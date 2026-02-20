import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { splitIntoSections } from "../_shared/split-sections.ts";
import { scopedDeleteByProvider } from "../_shared/scoped-delete.ts";
import { env } from "../_shared/env.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let importRecordId: string | null = null;

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

    const { provider, content, pdfBase64 } = await req.json();

    if (!content && !pdfBase64) {
      return new Response(
        JSON.stringify({ error: "Either content or pdfBase64 must be provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY");

    // Create import record
    const { data: importRecord, error: importError } = await supabase
      .from("imports")
      .insert({
        provider,
        status: "processing",
        started_by: user.id,
      })
      .select()
      .single();

    if (importError) throw importError;
    importRecordId = importRecord.id;

    // ── Step 1: Convert to markdown ──────────────────────────────────

    let markdown: string;

    if (pdfBase64) {
      // Send the actual PDF to Claude for markdown conversion
      const pdfResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 16384,
          system: `You are a document formatter. Convert the contents of this PDF into clean, well-structured markdown.

RULES:
- Use # for major section headings (e.g. "# Discovery Process", "# Objection Handling")
- Use ## and ### for subsections within those sections
- Use bullet points, numbered lists, bold, tables, and other markdown formatting where appropriate
- Preserve ALL original content — do not summarize, omit, or rephrase anything
- Do not add commentary or explanations — output ONLY the formatted markdown
- If the document has an obvious title page or cover, use that as the first # heading
- Look for natural topic boundaries to determine where sections start and end`,
          messages: [{
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
              },
              {
                type: "text",
                text: "Convert this PDF to structured markdown. Output ONLY the markdown, nothing else.",
              },
            ],
          }],
        }),
      });

      if (!pdfResponse.ok) {
        const errBody = await pdfResponse.text();
        console.error("PDF conversion API response:", errBody);
        throw new Error(`Claude API error during PDF conversion: ${pdfResponse.status}`);
      }

      const pdfData = await pdfResponse.json();
      markdown = pdfData.content[0].text;
    } else if (content && !/^# .+/m.test(content)) {
      // Raw text without headings — ask Claude to structure it
      const structureResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 16384,
          system: `You are a document formatter. Convert the raw text of a sales playbook into clean, well-structured markdown.

RULES:
- Use # for major section headings (e.g. "# Discovery Process", "# Objection Handling")
- Use ## and ### for subsections within those sections
- Use bullet points, numbered lists, bold, and other markdown formatting where appropriate
- Preserve ALL original content — do not summarize, omit, or rephrase anything
- Do not add commentary or explanations — output ONLY the formatted markdown
- Look for natural topic boundaries to determine where sections start and end`,
          messages: [{
            role: "user",
            content: `Convert this raw text to structured markdown:\n\n${content}`,
          }],
        }),
      });

      if (!structureResponse.ok) {
        throw new Error(`Claude API error during markdown conversion: ${structureResponse.status}`);
      }

      const structureData = await structureResponse.json();
      markdown = structureData.content[0].text;
    } else {
      markdown = content;
    }

    // ── Step 2: Split and save sections ──────────────────────────────

    const sections = splitIntoSections(markdown);

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Clear existing sections for this provider only (preserves other sources)
    const sectionProvider = provider === "taskbase" ? "taskbase" : "pdf";
    await scopedDeleteByProvider(adminClient, user.id, sectionProvider);

    // Determine sort_order offset so new sections come after existing ones
    const { data: maxRow } = await adminClient
      .from("playbook_sections")
      .select("sort_order")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();
    const sortOffset = maxRow?.sort_order ?? 0;

    const today = new Date().toISOString().split("T")[0];

    for (let i = 0; i < sections.length; i++) {
      await adminClient
        .from("playbook_sections")
        .insert({
          user_id: user.id,
          title: sections[i].title,
          content: sections[i].content,
          sort_order: sortOffset + i + 1,
          last_updated: today,
          provider: sectionProvider,
        });
    }

    // Mark import as "extracted" — sections saved, ready for analysis
    await adminClient
      .from("imports")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        metadata: { sections_created: sections.length },
      })
      .eq("id", importRecord.id);

    return new Response(
      JSON.stringify({
        importId: importRecord.id,
        sectionsCreated: sections.length,
        status: "completed",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Import error:", error);

    // Update import record to failed so it doesn't stay stuck in "processing"
    if (importRecordId) {
      try {
        const adminClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await adminClient
          .from("imports")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", importRecordId);
      } catch {
        // Best-effort cleanup
      }
    }

    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
