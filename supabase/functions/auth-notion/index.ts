import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
    const redirectUri = `${PUBLIC_SUPABASE_URL}/functions/v1/notion-callback`;
    const notionAuthUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${NOTION_CLIENT_ID}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(redirectUri)}`;

    return new Response(JSON.stringify({ url: notionAuthUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Invalid action" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
