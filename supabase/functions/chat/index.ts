import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Tool definitions ──────────────────────────────────────────────────

const tools = [
  {
    name: "edit_section",
    description:
      "Replace specific content within an existing playbook section. The before_text must be an exact substring of the current section content.",
    input_schema: {
      type: "object",
      properties: {
        section_id: {
          type: "string",
          description: "ID of the section to edit",
        },
        before_text: {
          type: "string",
          description:
            "The exact text to replace. Must match current content verbatim.",
        },
        after_text: {
          type: "string",
          description: "The replacement text, in Markdown format.",
        },
        rationale: {
          type: "string",
          description: "Brief explanation of why this change improves the playbook.",
        },
      },
      required: ["section_id", "before_text", "after_text", "rationale"],
    },
  },
  {
    name: "append_to_section",
    description:
      "Add new content to the end of an existing playbook section. Use for new subsections, examples, or techniques.",
    input_schema: {
      type: "object",
      properties: {
        section_id: {
          type: "string",
          description: "ID of the section to append to",
        },
        content: {
          type: "string",
          description: "Content to append, in Markdown format.",
        },
        rationale: {
          type: "string",
          description: "Why this addition strengthens the playbook.",
        },
      },
      required: ["section_id", "content", "rationale"],
    },
  },
  {
    name: "create_section",
    description:
      "Create an entirely new playbook section. Only use when the topic does not fit any existing section.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Title of the new section",
        },
        content: {
          type: "string",
          description: "Full content for the new section, in Markdown format.",
        },
        rationale: {
          type: "string",
          description: "Why this new section is needed.",
        },
      },
      required: ["title", "content", "rationale"],
    },
  },
];

// ── Tool execution ────────────────────────────────────────────────────

async function executeTool(
  toolUse: { id: string; name: string; input: string },
  userId: string,
  supabase: SupabaseClient
): Promise<
  | { ok: true; edit: Record<string, unknown> }
  | { ok: false; error: string }
> {
  let input: Record<string, string>;
  try {
    input = JSON.parse(toolUse.input);
  } catch {
    return { ok: false, error: "Failed to parse tool input" };
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (toolUse.name === "edit_section" || toolUse.name === "append_to_section") {
    const sectionId =
      input.section_id;
    const beforeText =
      toolUse.name === "edit_section" ? input.before_text : "";
    const afterText =
      toolUse.name === "edit_section" ? input.after_text : input.content;

    // Verify section exists and belongs to user
    const { data: section } = await adminClient
      .from("playbook_sections")
      .select("id, title")
      .eq("id", sectionId)
      .eq("user_id", userId)
      .single();

    if (!section) {
      return { ok: false, error: `Section "${sectionId}" not found` };
    }

    const { data: edit, error } = await supabase
      .from("staged_edits")
      .insert({
        section_id: sectionId,
        before_text: beforeText,
        after_text: afterText,
        source: "chat",
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      return { ok: false, error: error.message };
    }

    return {
      ok: true,
      edit: {
        id: edit.id,
        sectionId: sectionId,
        sectionTitle: section.title,
        before: beforeText,
        after: afterText,
        rationale: input.rationale ?? "",
        timestamp: edit.created_at,
      },
    };
  }

  if (toolUse.name === "create_section") {
    const { title, content, rationale } = input;

    // Check for duplicate by title for this user
    const { data: existing } = await adminClient
      .from("playbook_sections")
      .select("id")
      .eq("user_id", userId)
      .ilike("title", title)
      .limit(1)
      .single();

    if (existing) {
      return {
        ok: false,
        error: `Section "${title}" already exists. Use edit_section or append_to_section instead.`,
      };
    }

    // Get next sort order
    const { data: sections } = await adminClient
      .from("playbook_sections")
      .select("sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextOrder = ((sections?.[0] as { sort_order: number } | undefined)?.sort_order ?? 0) + 1;

    // Create the section (UUID auto-generated)
    const { data: newSection, error: secError } = await adminClient
      .from("playbook_sections")
      .insert({ user_id: userId, title, content: "", sort_order: nextOrder })
      .select("id")
      .single();

    if (secError || !newSection) {
      return { ok: false, error: secError?.message ?? "Failed to create section" };
    }

    const sectionId = newSection.id;

    // Create staged edit to populate it
    const { data: edit, error: editError } = await supabase
      .from("staged_edits")
      .insert({
        section_id: sectionId,
        before_text: "",
        after_text: content,
        source: "chat",
        created_by: userId,
      })
      .select()
      .single();

    if (editError) {
      return { ok: false, error: editError.message };
    }

    return {
      ok: true,
      edit: {
        id: edit.id,
        sectionId,
        sectionTitle: title,
        before: "",
        after: content,
        rationale: rationale ?? "",
        timestamp: edit.created_at,
      },
    };
  }

  return { ok: false, error: `Unknown tool: ${toolUse.name}` };
}

// ── Main handler ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
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

    const { message, conversationId, sectionContext } = await req.json();

    // Persist user message
    await supabase.from("chat_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: message,
      section_id: sectionContext?.sectionId ?? null,
      created_by: user.id,
    });

    // ── Load playbook context ───────────────────────────────────────

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: allSections } = await adminClient
      .from("playbook_sections")
      .select("id, title, content")
      .eq("user_id", user.id)
      .order("sort_order");

    let playbookContext = "";
    if (allSections && allSections.length > 0) {
      playbookContext =
        "\n\nPlaybook sections (use these IDs when editing):\n" +
        allSections
          .map((s: { id: string; title: string; content: string }) => {
            // Full content for the section the user is viewing, summary for others
            const isCurrent = sectionContext?.sectionId === s.id;
            const body = isCurrent
              ? s.content
              : s.content.slice(0, 800) +
                (s.content.length > 800 ? "..." : "");
            return `### ${s.title}  (ID: ${s.id})\n${body}`;
          })
          .join("\n\n");
    }

    // ── Build system prompt ─────────────────────────────────────────

    const systemPrompt = `You are a sales playbook assistant. You help sales teams create, improve, and maintain their playbook content.

Your capabilities:
- Edit existing sections using the edit_section tool
- Add new content to sections using append_to_section
- Create entirely new sections using create_section (rarely needed)
- Answer questions about sales methodology and best practices

Communication style:
- Keep your responses short — 1-3 sentences max in chat. No long paragraphs or bullet-heavy replies.
- Before making any edit, ask ONE clarifying question to make sure you understand what the user wants. Only ask one question at a time, never multiple.
- Do NOT jump straight to editing. Confirm the intent first, then make the change.
- If the user's request is already very specific and unambiguous, you may skip the clarifying question and proceed.

Guidelines:
- Use edit_section when refining or replacing existing content — before_text must match exactly
- Use append_to_section when adding new subsections, examples, or techniques
- Use create_section only when the topic truly does not fit any existing section
- Format all playbook content in clean Markdown: ## headings, bullet points, **bold**, etc.
- If the user just asks a question, respond normally without using tools

${sectionContext?.sectionTitle ? `The user is currently viewing: "${sectionContext.sectionTitle}" (ID: ${sectionContext.sectionId})` : "The user is on the dashboard."}
${playbookContext}`;

    // ── Load conversation history ───────────────────────────────────

    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(20);

    const messages = (history ?? []).map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }));

    // ── Call Claude API with streaming + tools ──────────────────────

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools,
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${err}`);
    }

    // ── Transform the SSE stream ────────────────────────────────────

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullResponse = "";
    let currentToolUse: { id: string; name: string; input: string } | null =
      null;

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);

            // Text delta
            if (
              parsed.type === "content_block_delta" &&
              parsed.delta?.type === "text_delta"
            ) {
              fullResponse += parsed.delta.text;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "text", text: parsed.delta.text })}\n\n`
                )
              );
            }

            // Tool use start
            else if (
              parsed.type === "content_block_start" &&
              parsed.content_block?.type === "tool_use"
            ) {
              currentToolUse = {
                id: parsed.content_block.id,
                name: parsed.content_block.name,
                input: "",
              };
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "tool_start", tool_name: parsed.content_block.name })}\n\n`
                )
              );
            }

            // Tool input accumulation
            else if (
              parsed.type === "content_block_delta" &&
              parsed.delta?.type === "input_json_delta"
            ) {
              if (currentToolUse) {
                currentToolUse.input += parsed.delta.partial_json;
              }
            }

            // Tool use complete — execute
            else if (parsed.type === "content_block_stop" && currentToolUse) {
              const result = await executeTool(
                currentToolUse,
                user.id,
                supabase
              );

              if (result.ok) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "staged_edit", edit: result.edit })}\n\n`
                  )
                );
              } else {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "tool_error", error: result.error })}\n\n`
                  )
                );
              }

              currentToolUse = null;
            }

            // Message complete
            else if (parsed.type === "message_stop") {
              // Persist the text portions of the response before closing the stream
              if (fullResponse.trim()) {
                await supabase
                  .from("chat_messages")
                  .insert({
                    conversation_id: conversationId,
                    role: "assistant",
                    content: fullResponse,
                    section_id: sectionContext?.sectionId ?? null,
                    created_by: user.id,
                  });
              }

              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            }
          } catch {
            // Skip unparseable lines
          }
        }
      },
    });

    const readable = response.body!.pipeThrough(transformStream);

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
