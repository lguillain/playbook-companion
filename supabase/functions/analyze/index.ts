import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { analyzeSections } from "../_shared/analyze-sections.ts";
import { env } from "../_shared/env.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * Analyze saved playbook sections for skill coverage.
 * Reads sections from the DB, sends full content to Claude, writes skill mappings back.
 * Called AFTER import has saved sections.
 */
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Read saved sections
    const { data: sections, error: secError } = await adminClient
      .from("playbook_sections")
      .select("id, title, content")
      .eq("user_id", user.id)
      .order("sort_order");

    if (secError) throw secError;
    if (!sections || sections.length === 0) {
      // No sections left — reset all skill evals to missing
      await adminClient.from("section_skills").delete().eq("user_id", user.id);
      await adminClient
        .from("user_skills")
        .update({ status: "missing", last_updated: null, section_title: null, coverage_note: null })
        .eq("user_id", user.id);
      await adminClient
        .from("profiles")
        .update({ analyzed_at: new Date().toISOString() })
        .eq("id", user.id);
      return new Response(
        JSON.stringify({ status: "completed", sectionsAnalyzed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = env("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const result = await analyzeSections(
      sections,
      adminClient,
      user.id,
      apiKey,
    );

    return new Response(
      JSON.stringify({ status: "completed", ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Analyze error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
