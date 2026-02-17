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
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      return (data ?? []).map(
        (m): ChatMessage => ({
          id: m.id,
          role: m.role as ChatMessage["role"],
          content: m.content,
          timestamp: m.created_at,
        })
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
};

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [stagedEdits, setStagedEdits] = useState<StreamedEdit[]>([]);
  const [isToolRunning, setIsToolRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const sendMessage = useCallback(
    async (message: string, options: StreamOptions): Promise<StreamResult> => {
      setIsStreaming(true);
      setStreamingContent("");
      setStagedEdits([]);
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
          const err = await response.json();
          throw new Error(err.error || "Chat request failed");
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        const edits: StreamedEdit[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === "text") {
                  fullContent += parsed.text;
                  setStreamingContent(fullContent);
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

        return { content: fullContent, edits };
      } finally {
        setIsStreaming(false);
        setStreamingContent("");
        setIsToolRunning(false);
        abortRef.current = null;
      }
    },
    [queryClient]
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { sendMessage, isStreaming, streamingContent, stagedEdits, isToolRunning, abort };
}
