import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { env } from "../_shared/env.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

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
  supabase: SupabaseClient,
  messageId?: string,
): Promise<
  | { ok: true; edit: Record<string, unknown> }
  | { ok: false; error: string }
> {
  if (!toolUse.input) {
    return { ok: false, error: "Empty tool input" };
  }

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
        ...(messageId ? { message_id: messageId } : {}),
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
        ...(messageId ? { message_id: messageId } : {}),
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

// ── Helpers ───────────────────────────────────────────────────────────

/** Parse SSE lines from a chunk, buffering partial lines across calls. */
function parseSSELines(chunk: string, buffer: string): { lines: string[]; remaining: string } {
  const combined = buffer + chunk;
  const parts = combined.split("\n");
  const remaining = parts.pop() ?? "";
  return { lines: parts, remaining };
}

/** Extract suggestion markers from text, returning cleaned text and parsed options.
 *  Handles both {{suggest: [...]}} and {"suggest": [...]} formats since the model
 *  may use either. */
function extractSuggestions(text: string): { cleaned: string; options: string[] | null } {
  // Match {{suggest: [...]}} or {"suggest": [...]}
  const match = text.match(/\{?\{["']?suggest["']?:\s*(\[.*?\])\}?\}/);
  if (!match) return { cleaned: text, options: null };
  try {
    const options = JSON.parse(match[1]);
    if (Array.isArray(options) && options.every((o: unknown) => typeof o === "string")) {
      return { cleaned: text.replace(match[0], "").trimEnd(), options };
    }
  } catch { /* invalid JSON — ignore */ }
  return { cleaned: text, options: null };
}

/** Call Claude API (non-streaming) to get a follow-up response after tool use. */
async function callClaude(
  apiKey: string,
  systemPrompt: string,
  messages: { role: string; content: unknown }[],
): Promise<{ text: string; toolUse: { id: string; name: string; input: string } | null }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  let text = "";
  let toolUse: { id: string; name: string; input: string } | null = null;

  for (const block of data.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use") {
      toolUse = { id: block.id, name: block.name, input: JSON.stringify(block.input) };
    }
  }

  return { text, toolUse };
}

// ── Main handler ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

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

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!conversationId || typeof conversationId !== "string") {
      return new Response(JSON.stringify({ error: "conversationId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // ── Load skill evaluation context ─────────────────────────────────

    const [catResult, skillResult, userSkillResult] = await Promise.all([
      adminClient.from("skill_categories").select("id, name").order("sort_order"),
      adminClient.from("skills").select("id, category_id, name").order("sort_order"),
      adminClient.from("user_skills").select("skill_id, status, coverage_note, section_title, fulfilled").eq("user_id", user.id),
    ]);

    let skillsContext = "";
    if (catResult.data && skillResult.data && userSkillResult.data) {
      const userSkillMap = new Map(
        userSkillResult.data.map((us: { skill_id: string; status: string; coverage_note: string | null; section_title: string | null; fulfilled: boolean }) => [us.skill_id, us])
      );

      const gaps: string[] = [];
      for (const cat of catResult.data) {
        const catSkills = skillResult.data.filter((s: { category_id: string }) => s.category_id === cat.id);
        const entries: string[] = [];
        for (const skill of catSkills) {
          const us = userSkillMap.get(skill.id) as { status: string; coverage_note: string | null; section_title: string | null; fulfilled: boolean } | undefined;
          if (!us || us.fulfilled) continue;
          if (us.status === "missing" || us.status === "partial") {
            let line = `- ${skill.name}: ${us.status}`;
            if (us.coverage_note) line += ` — ${us.coverage_note}`;
            if (us.section_title) line += ` (in "${us.section_title}")`;
            entries.push(line);
          }
        }
        if (entries.length > 0) {
          gaps.push(`**${cat.name}**\n${entries.join("\n")}`);
        }
      }

      if (gaps.length > 0) {
        skillsContext = "\n\nSkill gaps identified in this playbook:\n" + gaps.join("\n\n");
      }
    }

    let playbookContext = "";
    if (allSections && allSections.length > 0) {
      playbookContext =
        "\n\nPlaybook sections (use these IDs when editing):\n" +
        allSections
          .map((s: { id: string; title: string; content: string }) => {
            // Full content for the dashboard or the section the user is viewing, summary for others
            const isDashboard = !sectionContext?.sectionId;
            const isCurrent = sectionContext?.sectionId === s.id;
            const body = isDashboard || isCurrent
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
- When asking a clarifying question, include 2-4 short suggested answers as a JSON array on the last line in this exact format: {{suggest: ["Option A", "Option B"]}}. Never include this format when you are NOT asking a question.

Guidelines:
- Use edit_section when refining or replacing existing content — before_text must match exactly
- Use append_to_section when adding new subsections, examples, or techniques
- Use create_section only when the topic truly does not fit any existing section
- Format all playbook content in clean Markdown: ## headings, bullet points, **bold**, etc.
- If the user just asks a question, respond normally without using tools
- When referencing playbook sections, mention them by their exact title so the user can navigate to them easily.
- When suggesting improvements, prioritize addressing skill gaps listed below. Reference specific gaps when relevant.

${sectionContext?.sectionTitle ? `The user is currently viewing: "${sectionContext.sectionTitle}" (ID: ${sectionContext.sectionId})` : "The user is on the dashboard."}
${playbookContext}${skillsContext}`;

    // ── Load conversation history ───────────────────────────────────

    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(20);

    const messages: { role: string; content: unknown }[] = (history ?? []).map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }));

    // ── Call Claude API with streaming + tools ──────────────────────

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
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

    // Pre-create the assistant message row so staged edits can FK-reference it.
    // Content will be updated with the real response once streaming finishes.
    const assistantMessageId = crypto.randomUUID();
    await supabase.from("chat_messages").insert({
      id: assistantMessageId,
      conversation_id: conversationId,
      role: "assistant",
      content: "",
      section_id: sectionContext?.sectionId ?? null,
      created_by: user.id,
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullResponse = "";
    let currentToolUse: { id: string; name: string; input: string } | null =
      null;
    let sseBuffer = "";

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        const { lines, remaining } = parseSSELines(text, sseBuffer);
        sseBuffer = remaining;

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

            // Tool use complete — execute and send tool_result back to Claude
            else if (parsed.type === "content_block_stop" && currentToolUse) {
              const result = await executeTool(
                currentToolUse,
                user.id,
                supabase,
                assistantMessageId
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

              // Build the tool_result and send follow-up requests to Claude
              // so it can acknowledge the tool use and optionally make more edits.
              const toolResultContent = result.ok
                ? `Tool executed successfully. Staged edit created for section "${(result.edit as Record<string, unknown>).sectionTitle}".`
                : `Tool failed: ${result.error}`;

              const followUpMessages: { role: string; content: unknown }[] = [
                ...messages,
                {
                  role: "assistant",
                  content: [
                    ...(fullResponse ? [{ type: "text", text: fullResponse }] : []),
                    { type: "tool_use", id: currentToolUse.id, name: currentToolUse.name, input: JSON.parse(currentToolUse.input || "{}") },
                  ],
                },
                {
                  role: "user",
                  content: [
                    { type: "tool_result", tool_use_id: currentToolUse.id, content: toolResultContent },
                  ],
                },
              ];

              currentToolUse = null;

              try {
                // Loop: let Claude make additional tool calls if it wants to
                let followUp = await callClaude(ANTHROPIC_API_KEY, systemPrompt, followUpMessages);

                while (followUp.toolUse) {
                  // Emit tool_start for the next edit
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "tool_start", tool_name: followUp.toolUse.name })}\n\n`
                    )
                  );

                  // Stream any interstitial text before the tool call
                  if (followUp.text) {
                    const { cleaned, options } = extractSuggestions(followUp.text);
                    fullResponse += cleaned;
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ type: "text", text: cleaned })}\n\n`
                      )
                    );
                    if (options) {
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify({ type: "suggestions", options })}\n\n`
                        )
                      );
                    }
                  }

                  // Execute the tool
                  const nextResult = await executeTool(
                    followUp.toolUse,
                    user.id,
                    supabase,
                    assistantMessageId
                  );

                  if (nextResult.ok) {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ type: "staged_edit", edit: nextResult.edit })}\n\n`
                      )
                    );
                  } else {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ type: "tool_error", error: nextResult.error })}\n\n`
                      )
                    );
                  }

                  const nextToolResultContent = nextResult.ok
                    ? `Tool executed successfully. Staged edit created for section "${(nextResult.edit as Record<string, unknown>).sectionTitle}".`
                    : `Tool failed: ${nextResult.error}`;

                  // Append the assistant turn + tool result for the next iteration
                  followUpMessages.push(
                    {
                      role: "assistant",
                      content: [
                        ...(followUp.text ? [{ type: "text", text: followUp.text }] : []),
                        { type: "tool_use", id: followUp.toolUse.id, name: followUp.toolUse.name, input: JSON.parse(followUp.toolUse.input || "{}") },
                      ],
                    },
                    {
                      role: "user",
                      content: [
                        { type: "tool_result", tool_use_id: followUp.toolUse.id, content: nextToolResultContent },
                      ],
                    },
                  );

                  // Ask Claude again — it may want yet another edit or to wrap up
                  followUp = await callClaude(ANTHROPIC_API_KEY, systemPrompt, followUpMessages);
                }

                // No more tool calls — stream the final text
                if (followUp.text) {
                  const { cleaned, options } = extractSuggestions(followUp.text);
                  fullResponse += cleaned;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "text", text: cleaned })}\n\n`
                    )
                  );
                  if (options) {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ type: "suggestions", options })}\n\n`
                      )
                    );
                  }
                }
              } catch (e) {
                console.error("Follow-up Claude call failed:", e);
              }
            }

            // Message complete
            else if (parsed.type === "message_stop") {
              // Extract suggestions before persisting so the marker never hits the DB
              const { cleaned, options } = extractSuggestions(fullResponse);
              fullResponse = cleaned;

              if (options) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "suggestions", options })}\n\n`
                  )
                );
              }

              // Update the pre-created assistant message with the real content.
              // If the response was empty, delete the placeholder row.
              if (fullResponse.trim()) {
                await supabase
                  .from("chat_messages")
                  .update({ content: fullResponse })
                  .eq("id", assistantMessageId);
              } else {
                await supabase
                  .from("chat_messages")
                  .delete()
                  .eq("id", assistantMessageId);
              }

              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            }
          } catch (e) {
            // Log parse errors for debugging but don't crash the stream
            if (data.trim()) {
              console.error("SSE parse error:", e);
            }
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
