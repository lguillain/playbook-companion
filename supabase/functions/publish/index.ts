import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Convert markdown to Confluence storage format (XHTML). */
function markdownToStorage(md: string): string {
  let html = md;

  // Code blocks (before inline processing)
  html = html.replace(/```[\s\S]*?\n([\s\S]*?)```/g, (_m, code: string) =>
    `<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[${code.trim()}]]></ac:plain-text-body></ac:structured-macro>\n`
  );

  // Headings
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold & italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Markdown tables → Confluence storage tables
  html = html.replace(/((?:^\|.+\|\s*\n)+)/gm, (_match, block: string) => {
    const lines = block.trim().split("\n");
    // Skip separator row (| --- | --- |)
    const dataRows = lines.filter((l: string) => !/^\|\s*[-:]+/.test(l));
    if (dataRows.length === 0) return block;

    let table = "<table><tbody>\n";
    for (const row of dataRows) {
      const cells = row.split("|").slice(1, -1).map((c: string) => c.trim());
      table += "<tr>" + cells.map((c: string) => `<td>${c}</td>`).join("") + "</tr>\n";
    }
    table += "</tbody></table>\n";
    return table;
  });

  // Unordered lists — collect consecutive lines
  html = html.replace(/((?:^- .+\n?)+)/gm, (_match, block: string) => {
    const items = block.trim().split("\n").map((l: string) => l.replace(/^- /, ""));
    return "<ul>" + items.map((i: string) => `<li>${i}</li>`).join("") + "</ul>\n";
  });

  // Wrap remaining plain text lines in <p> tags
  html = html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      // Skip if already wrapped in a block element
      if (/^<(h[1-4]|ul|ol|table|ac:|p)/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n");

  return html;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { provider } = await req.json();

    // Get the connection for this provider
    const { data: connection, error: connError } = await supabase
      .from("connections")
      .select("*")
      .eq("provider", provider)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: `No ${provider} connection found. Please connect first.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch approved edits that haven't been published yet
    const { data: approvedEdits } = await supabase
      .from("staged_edits")
      .select("*, playbook_sections!inner(title, content)")
      .eq("status", "approved");

    if (!approvedEdits || approvedEdits.length === 0) {
      return new Response(
        JSON.stringify({ message: "No approved edits to publish", published: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unique sections that have approved edits
    const sectionIds = [...new Set(approvedEdits.map((e) => e.section_id))];
    const errors: string[] = [];

    if (provider === "confluence") {
      const cloudId = connection.workspace_id;
      if (!cloudId) {
        return new Response(
          JSON.stringify({ error: "No Confluence cloud ID found. Please reconnect Confluence." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      for (const sectionId of sectionIds) {
        const { data: section } = await supabase
          .from("playbook_sections")
          .select("*")
          .eq("id", sectionId)
          .single();

        if (!section) continue;

        // Search for existing Confluence page by title using CQL
        const cql = `title = "${section.title.trim()}" and type = page`;
        const searchRes = await fetch(
          `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=1`,
          {
            headers: {
              Authorization: `Bearer ${connection.access_token}`,
              Accept: "application/json",
            },
          }
        );

        if (!searchRes.ok) {
          const errText = await searchRes.text();
          console.error(`Confluence search failed for "${section.title}":`, errText);
          errors.push(`Search failed for "${section.title}"`);
          continue;
        }

        const searchData = await searchRes.json();
        const existingPage = searchData.results?.[0];

        if (!existingPage) {
          console.log(`No Confluence page found matching "${section.title}", skipping`);
          errors.push(`No page found for "${section.title}"`);
          continue;
        }

        // Get current page version (needed for update)
        const pageRes = await fetch(
          `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/pages/${existingPage.id}`,
          {
            headers: {
              Authorization: `Bearer ${connection.access_token}`,
              Accept: "application/json",
            },
          }
        );

        if (!pageRes.ok) {
          errors.push(`Failed to fetch page "${section.title}"`);
          continue;
        }

        const pageData = await pageRes.json();
        const currentVersion = pageData.version?.number ?? 1;

        // Convert markdown content to Confluence storage format
        const storageContent = markdownToStorage(section.content);

        // Update the page
        const updateRes = await fetch(
          `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/pages/${existingPage.id}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${connection.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: existingPage.id,
              status: "current",
              title: section.title.trim(),
              body: {
                representation: "storage",
                value: storageContent,
              },
              version: {
                number: currentVersion + 1,
                message: "Updated via Playbook Companion",
              },
            }),
          }
        );

        if (!updateRes.ok) {
          const errText = await updateRes.text();
          console.error(`Failed to update Confluence page "${section.title}":`, errText);
          errors.push(`Update failed for "${section.title}"`);
        }
      }
    } else if (provider === "notion") {
      for (const sectionId of sectionIds) {
        const { data: section } = await supabase
          .from("playbook_sections")
          .select("*")
          .eq("id", sectionId)
          .single();

        if (!section) continue;

        // Search for existing Notion page by title
        const searchRes = await fetch(
          `https://api.notion.com/v1/search`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${connection.access_token}`,
              "Content-Type": "application/json",
              "Notion-Version": "2022-06-28",
            },
            body: JSON.stringify({
              query: section.title,
              filter: { property: "object", value: "page" },
            }),
          }
        );

        const searchData = await searchRes.json();
        const existingPage = searchData.results?.[0];

        if (existingPage) {
          const updateRes = await fetch(
            `https://api.notion.com/v1/blocks/${existingPage.id}/children`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${connection.access_token}`,
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
              },
              body: JSON.stringify({
                children: [
                  {
                    object: "block",
                    type: "paragraph",
                    paragraph: {
                      rich_text: [
                        {
                          type: "text",
                          text: { content: `[Updated ${new Date().toISOString().split("T")[0]}]\n${section.content.substring(0, 2000)}` },
                        },
                      ],
                    },
                  },
                ],
              }),
            }
          );

          if (!updateRes.ok) {
            errors.push(`Update failed for "${section.title}"`);
          }
        } else {
          errors.push(`No page found for "${section.title}"`);
        }
      }
    } else {
      return new Response(
        JSON.stringify({ error: `Unsupported provider: ${provider}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean up published edits — delete approved edits for sections we just pushed
    const publishedEditIds = approvedEdits
      .filter((e) => sectionIds.includes(e.section_id))
      .map((e) => e.id);

    if (publishedEditIds.length > 0) {
      await supabase
        .from("staged_edits")
        .delete()
        .in("id", publishedEditIds);
    }

    const publishedCount = sectionIds.length - errors.length;

    if (publishedCount === 0) {
      return new Response(
        JSON.stringify({
          error: `Failed to publish to ${provider}. ${errors[0] ?? ""}`.trim(),
          errors,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Published successfully",
        published: publishedCount,
        provider,
        ...(errors.length > 0 ? { warnings: errors } : {}),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Publish error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
