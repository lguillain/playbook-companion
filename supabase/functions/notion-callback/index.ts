import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { env } from "../_shared/env.ts";

Deno.serve(async (req) => {
  const NOTION_CLIENT_ID = env("NOTION_CLIENT_ID");
  const NOTION_CLIENT_SECRET = env("NOTION_CLIENT_SECRET");
  const SITE_URL = env("SITE_URL") ?? "http://localhost:8080";
  const PUBLIC_SUPABASE_URL = env("PUBLIC_SUPABASE_URL") ?? "http://127.0.0.1:54321";

  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return Response.redirect(`${SITE_URL}?error=no_code`, 302);
  }

  // Decode user ID from state parameter
  let userId: string | null = null;
  const stateParam = url.searchParams.get("state");
  if (stateParam) {
    try {
      const decoded = JSON.parse(atob(decodeURIComponent(stateParam)));
      userId = decoded.userId || null;
    } catch {
      console.error("Failed to decode state parameter");
    }
  }

  try {
    const redirectUri = `${PUBLIC_SUPABASE_URL}/functions/v1/notion-callback`;
    const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`)}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      console.error("Notion token exchange failed:", err);
      return Response.redirect(`${SITE_URL}?error=token_exchange_failed`, 302);
    }

    const tokenData = await tokenResponse.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase.from("connections").insert({
      provider: "notion",
      access_token: tokenData.access_token,
      workspace_id: tokenData.workspace_id ?? null,
      connected_by: userId,
    });

    return Response.redirect(`${SITE_URL}?connected=notion`, 302);
  } catch (error) {
    console.error("Notion OAuth error:", error);
    return Response.redirect(`${SITE_URL}?error=oauth_failed`, 302);
  }
});
