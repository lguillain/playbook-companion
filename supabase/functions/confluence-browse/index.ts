import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate the caller
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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the Confluence connection
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: connection, error: connError } = await adminClient
      .from("connections")
      .select("*")
      .eq("provider", "confluence")
      .eq("connected_by", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: "No Confluence connection found. Please connect Confluence first." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = connection.access_token;
    const cloudId = connection.workspace_id;

    if (!cloudId) {
      return new Response(
        JSON.stringify({ error: "No Confluence cloud ID found. Please reconnect Confluence." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse action from request body
    const body = await req.json();
    const action = body.action;

    if (action === "list-spaces") {
      const url = `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/spaces?limit=25`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Confluence API error (${res.status}): ${err}`);
      }

      const data = await res.json();
      const spaces = (data.results ?? []).map((s: { id: string; name: string; key: string }) => ({
        id: s.id,
        name: s.name,
        key: s.key,
      }));

      return new Response(JSON.stringify({ spaces }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list-pages") {
      const spaceId = body.spaceId;
      if (!spaceId) {
        return new Response(JSON.stringify({ error: "spaceId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pages: { id: string; title: string; parentId: string | null }[] = [];
      let cursor: string | undefined;
      const limit = 50;
      const maxPages = 200;

      do {
        const params = new URLSearchParams({
          "space-id": spaceId,
          status: "current",
          limit: String(limit),
        });
        if (cursor) params.set("cursor", cursor);

        const url = `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/pages?${params}`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Confluence API error (${res.status}): ${err}`);
        }

        const data = await res.json();
        for (const p of data.results ?? []) {
          pages.push({ id: p.id, title: p.title, parentId: p.parentId ?? null });
        }

        cursor = data._links?.next
          ? new URL(data._links.next, "https://api.atlassian.com").searchParams.get("cursor") ?? undefined
          : undefined;

        if (pages.length >= maxPages) break;
      } while (cursor);

      return new Response(JSON.stringify({ pages }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Confluence browse error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
