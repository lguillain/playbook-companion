import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { env } from "../_shared/env.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  const CONFLUENCE_CLIENT_ID = env("CONFLUENCE_CLIENT_ID");
  const CONFLUENCE_CLIENT_SECRET = env("CONFLUENCE_CLIENT_SECRET");
  const SITE_URL = env("SITE_URL") ?? "http://localhost:8080";
  const PUBLIC_SUPABASE_URL = env("PUBLIC_SUPABASE_URL") ?? "http://127.0.0.1:54321";
  const url = new URL(req.url);
  // Resolve action from query param (GET callback) or POST body
  let action = url.searchParams.get("action");
  if (!action && req.method === "POST") {
    try {
      const body = await req.json();
      action = body.action;
    } catch  {
    // ignore parse errors
    }
  }
  // Step 1: Redirect user to Confluence OAuth
  if (action === "connect") {
    // Authenticate caller to get user ID for state parameter
    const authHeader = req.headers.get("Authorization");
    let userId = "";
    if (authHeader) {
      const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      });
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? "";
    }
    const redirectUri = `${PUBLIC_SUPABASE_URL}/functions/v1/auth-confluence?action=callback`;
    const scopes = encodeURIComponent("search:confluence read:confluence-content.summary read:confluence-content.all read:confluence-space.summary read:page:confluence read:space:confluence write:page:confluence write:confluence-content offline_access");
    const state = btoa(JSON.stringify({
      userId,
      nonce: crypto.randomUUID()
    }));
    const confluenceAuthUrl = `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${CONFLUENCE_CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&response_type=code&prompt=consent`;
    return new Response(JSON.stringify({
      url: confluenceAuthUrl
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
  // Step 2: Handle OAuth callback — exchange code for token
  if (action === "callback") {
    const code = url.searchParams.get("code");
    if (!code) {
      return Response.redirect(`${SITE_URL}?error=no_code`, 302);
    }
    // Decode user ID from state parameter
    let userId = null;
    const stateParam = url.searchParams.get("state");
    if (stateParam) {
      try {
        const decoded = JSON.parse(atob(decodeURIComponent(stateParam)));
        userId = decoded.userId || null;
      } catch  {
        console.error("Failed to decode state parameter");
      }
    }
    try {
      const redirectUri = `${PUBLIC_SUPABASE_URL}/functions/v1/auth-confluence?action=callback`;
      const tokenResponse = await fetch("https://auth.atlassian.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: CONFLUENCE_CLIENT_ID,
          client_secret: CONFLUENCE_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri
        })
      });
      if (!tokenResponse.ok) {
        const err = await tokenResponse.text();
        console.error("Confluence token exchange failed:", err);
        return Response.redirect(`${SITE_URL}?error=token_exchange_failed`, 302);
      }
      const tokenData = await tokenResponse.json();
      // Get accessible resources to find cloud ID
      const resourcesRes = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      });
      const resources = await resourcesRes.json();
      const cloudId = resources[0]?.id ?? null;
      console.log("DEBUG confluence callback: userId=" + userId + " cloudId=" + cloudId + " hasToken=" + !!tokenData.access_token);
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      console.log("DEBUG supabaseUrl=" + supabaseUrl + " hasServiceKey=" + !!serviceKey);
      const supabase = createClient(supabaseUrl, serviceKey);
      const insertPayload = {
        provider: "confluence",
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token ?? null,
        workspace_id: cloudId,
        connected_by: userId
      };
      console.log("DEBUG insert payload:", JSON.stringify({ ...insertPayload, access_token: "[redacted]" }));
      const { error: insertError } = await supabase.from("connections").insert(insertPayload);
      if (insertError) {
        console.error("DEBUG insert error: " + JSON.stringify(insertError));
        return Response.redirect(`${SITE_URL}?error=save_failed&detail=${encodeURIComponent(insertError.message)}`, 302);
      }
      console.log("DEBUG insert succeeded");
      return Response.redirect(`${SITE_URL}?connected=confluence`, 302);
    } catch (error) {
      console.error("Confluence OAuth error:", error);
      return Response.redirect(`${SITE_URL}?error=oauth_failed`, 302);
    }
  }
  return new Response(JSON.stringify({
    error: "Invalid action"
  }), {
    status: 400,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
});
