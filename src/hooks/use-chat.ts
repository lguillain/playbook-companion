import { useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ChatMessage, StreamedEdit } from "@/lib/types";

export function useChatHistory(conversationId: string) {
  return useQuery<ChatMessage[]>({
    queryKey: ["chat-history", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*, staged_edits:staged_edits(id, section_id, before_text, after_text, created_at, status, playbook_sections!inner(title))")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      return (data ?? []).map(
        (m): ChatMessage => {
          const edits: StreamedEdit[] | undefined =
            m.role === "assistant" && Array.isArray(m.staged_edits) && m.staged_edits.length > 0
              ? m.staged_edits.map((e: { id: string; section_id: string; before_text: string; after_text: string; created_at: string; status: string; playbook_sections: { title: string } }) => ({
                  id: e.id,
                  sectionId: e.section_id,
                  sectionTitle: e.playbook_sections.title,
                  before: e.before_text,
                  after: e.after_text,
                  rationale: "",
                  timestamp: e.created_at,
                  status: e.status as "pending" | "approved" | "rejected",
                }))
              : undefined;

          return {
            id: m.id,
            role: m.role as ChatMessage["role"],
            content: m.content,
            timestamp: m.created_at,
            edits,
          };
        }
      );
    },
    enabled: !!conversationId,
  });
}

type StreamOptions = {
  conversationId: string;
  sectionContext?: {
    sectionId: string;
    sectionTitle: string;
    sectionContent?: string;
  };
};

type StreamResult = {
  content: string;
  edits: StreamedEdit[];
  suggestions: string[];
};

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [stagedEdits, setStagedEdits] = useState<StreamedEdit[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isToolRunning, setIsToolRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const sendMessage = useCallback(
    async (message: string, options: StreamOptions): Promise<StreamResult> => {
      setIsStreaming(true);
      setStreamingContent("");
      setStagedEdits([]);
      setSuggestions([]);
      setIsToolRunning(false);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Use getUser() to force a token refresh, then grab the fresh session
        const { error: userError } = await supabase.auth.getUser();
        if (userError) throw new Error("Not authenticated");
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              message,
              conversationId: options.conversationId,
              sectionContext: options.sectionContext,
            }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          let errorMessage = "Chat request failed";
          try {
            const err = await response.json();
            errorMessage = err.error || errorMessage;
          } catch {
            // Response was not JSON (e.g. 502 HTML page)
          }
          throw new Error(errorMessage);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        const edits: StreamedEdit[] = [];
        let collectedSuggestions: string[] = [];
        let lineBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          lineBuffer += chunk;
          const lines = lineBuffer.split("\n");
          // Keep the last (potentially incomplete) line in the buffer
          lineBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === "text") {
                  fullContent += parsed.text;
                  // Strip suggestion markers so they never flash in the UI.
                  // Handles both {{suggest: [...]}} and {"suggest": [...]} formats,
                  // including partial markers still being streamed token-by-token.
                  const display = fullContent.replace(/\n*\{?\{["']?suggest[\s\S]*$/, "");
                  setStreamingContent(display);
                } else if (parsed.type === "suggestions") {
                  collectedSuggestions = parsed.options;
                  setSuggestions(parsed.options);
                } else if (parsed.type === "tool_start") {
                  setIsToolRunning(true);
                } else if (parsed.type === "staged_edit") {
                  setIsToolRunning(false);
                  edits.push(parsed.edit);
                  setStagedEdits((prev) => [...prev, parsed.edit]);
                } else if (parsed.type === "tool_error") {
                  setIsToolRunning(false);
                  fullContent += `\n\n*Error: ${parsed.error}*`;
                  setStreamingContent(fullContent);
                }
              } catch {
                // Skip unparseable
              }
            }
          }
        }

        // Invalidate chat history + staged edits
        queryClient.invalidateQueries({
          queryKey: ["chat-history", options.conversationId],
        });
        if (edits.length > 0) {
          queryClient.invalidateQueries({ queryKey: ["staged-edits"] });
        }

        // Strip any suggest marker that wasn't caught by the backend SSE event
        const cleanContent = fullContent.replace(/\n*\{?\{["']?suggest["']?:\s*\[.*?\]\}?\}\s*$/, "");
        return { content: cleanContent, edits, suggestions: collectedSuggestions };
      } finally {
        // Only clear streaming flag and tool state — keep streamingContent
        // visible until the caller has pushed the result to localMessages
        // and calls clearStream() to avoid a flash of empty content.
        setIsStreaming(false);
        setIsToolRunning(false);
        abortRef.current = null;
      }
    },
    [queryClient]
  );

  const clearStream = useCallback(() => {
    setStreamingContent("");
    setStagedEdits([]);
    setSuggestions([]);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { sendMessage, isStreaming, streamingContent, stagedEdits, suggestions, isToolRunning, abort, clearStream };
}
