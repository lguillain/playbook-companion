import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { env } from "../_shared/env.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const NOTION_CLIENT_ID = env("NOTION_CLIENT_ID");
  const PUBLIC_SUPABASE_URL = env("PUBLIC_SUPABASE_URL") ?? "http://127.0.0.1:54321";

  // Accept action from POST body (supabase.functions.invoke) or query param
  let action: string | null = new URL(req.url).searchParams.get("action");
  if (!action && req.method === "POST") {
    try {
      const body = await req.json();
      action = body.action;
    } catch {
      // ignore
    }
  }

  if (action === "connect") {
    // Authenticate caller to get user ID for state parameter
    const authHeader = req.headers.get("Authorization");
    let userId = "";
    if (authHeader) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? "";
    }

    const redirectUri = `${PUBLIC_SUPABASE_URL}/functions/v1/notion-callback`;
    const state = encodeURIComponent(btoa(JSON.stringify({ userId, nonce: crypto.randomUUID() })));
    const notionAuthUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${NOTION_CLIENT_ID}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    return new Response(JSON.stringify({ url: notionAuthUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Invalid action" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
