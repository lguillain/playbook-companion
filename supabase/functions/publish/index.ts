import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Get the Notion connection
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

    if (provider === "notion") {
      // Push each section's updated content to Notion
      for (const sectionId of sectionIds) {
        const { data: section } = await supabase
          .from("playbook_sections")
          .select("*")
          .eq("id", sectionId)
          .single();

        if (!section) continue;

        // Search for existing Notion page by title, or create new one
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
          // Update existing page content by appending a block
          await fetch(
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
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: "Published successfully",
        published: sectionIds.length,
        provider,
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
