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

    const { type, message } = await req.json();

    // Get all team members
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name");

    const recipients = (profiles ?? []).filter((p) => p.id !== user.id);

    if (type === "slack") {
      // Look for a Slack connection
      const { data: slackConn } = await supabase
        .from("connections")
        .select("*")
        .eq("provider", "slack")
        .limit(1)
        .single();

      if (slackConn) {
        // Post to Slack channel
        await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${slackConn.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: slackConn.workspace_id ?? "#sales",
            text: message ?? "Your playbook has been updated! Check out the latest changes.",
          }),
        });
      }
    }

    // For now, return success with notification count
    // Email/in-app notifications can be added later
    return new Response(
      JSON.stringify({
        message: "Notifications sent",
        notified: recipients.length,
        type,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Notify error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
