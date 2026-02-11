import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, Bot, User, Mic, MicOff, GitBranch, Check, X, Loader2, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import type { ChatMessage, StreamedEdit } from "@/lib/types";
import { useChatStream, useChatHistory } from "@/hooks/use-chat";
import { useApproveEdit, useRejectEdit } from "@/hooks/use-staged-edits";
import { Markdown } from "./Markdown";

// ── Inline diff card ──────────────────────────────────────────────────

type DiffCardProps = {
  edit: StreamedEdit;
  onAccept: (editId: string) => void;
  onReject: (editId: string) => void;
  status: "pending" | "accepted" | "rejected";
  isProcessing: boolean;
};

const DiffCard = ({ edit, onAccept, onReject, status, isProcessing }: DiffCardProps) => {
  const isResolved = status !== "pending";
  const [open, setOpen] = useState(false);

  const diffContent = (fullSize: boolean) => (
    <div className={fullSize ? "grid grid-cols-2 gap-4 text-sm" : "grid grid-cols-2 gap-2 text-[11px]"}>
      <div>
        <span className={`${fullSize ? "text-xs" : "text-[9px]"} font-semibold text-muted-foreground uppercase tracking-wider`}>
          Before
        </span>
        <div className={`mt-1 rounded bg-destructive/5 border border-destructive/10 ${fullSize ? "p-3" : "p-1.5"} text-muted-foreground leading-relaxed ${fullSize ? "max-h-[60vh] overflow-y-auto" : "max-h-[150px] overflow-y-auto"}`}>
          {edit.before || (
            <span className="italic text-muted-foreground/50">Empty — new content</span>
          )}
        </div>
      </div>
      <div>
        <span className={`${fullSize ? "text-xs" : "text-[9px]"} font-semibold text-muted-foreground uppercase tracking-wider`}>
          After
        </span>
        <div className={`mt-1 rounded bg-success/5 border border-success/10 ${fullSize ? "p-3" : "p-1.5"} text-foreground leading-relaxed ${fullSize ? "max-h-[60vh] overflow-y-auto" : "max-h-[150px] overflow-y-auto"}`}>
          {edit.after}
        </div>
      </div>
    </div>
  );

  const actionButtons = (fullSize: boolean) =>
    !isResolved ? (
      <div className={`flex gap-2 ${fullSize ? "pt-2" : "pt-1"}`}>
        <button
          onClick={() => { onAccept(edit.id); setOpen(false); }}
          disabled={isProcessing}
          className={`flex-1 flex items-center justify-center gap-1 rounded-md bg-success/15 hover:bg-success/25 px-2 ${fullSize ? "py-2 text-sm" : "py-1.5 text-[11px]"} font-semibold text-success transition-colors disabled:opacity-30`}
        >
          {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Accept
        </button>
        <button
          onClick={() => { onReject(edit.id); setOpen(false); }}
          disabled={isProcessing}
          className={`flex-1 flex items-center justify-center gap-1 rounded-md bg-destructive/15 hover:bg-destructive/25 px-2 ${fullSize ? "py-2 text-sm" : "py-1.5 text-[11px]"} font-semibold text-destructive transition-colors disabled:opacity-30`}
        >
          {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          Reject
        </button>
      </div>
    ) : null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`rounded-lg border p-3 space-y-2 ${
          isResolved
            ? status === "accepted"
              ? "border-success/30 bg-success/5"
              : "border-destructive/30 bg-destructive/5 opacity-60"
            : "border-primary/30 bg-primary/5"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <GitBranch className="w-3 h-3 text-primary" />
            <span className="text-[11px] font-semibold text-foreground">{edit.sectionTitle}</span>
            {isResolved && (
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold ${
                status === "accepted"
                  ? "bg-success/15 text-success"
                  : "bg-destructive/15 text-destructive"
              }`}>
                {status}
              </span>
            )}
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 text-[9px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <Maximize2 className="w-3 h-3" />
            Expand
          </button>
        </div>

        {edit.rationale && (
          <p className="text-[11px] text-muted-foreground italic leading-snug">
            {edit.rationale}
          </p>
        )}

        {diffContent(false)}
        {actionButtons(false)}
      </motion.div>

      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-4xl rounded-xl border border-border bg-card shadow-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">{edit.sectionTitle}</span>
                {isResolved && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
                    status === "accepted"
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive"
                  }`}>
                    {status}
                  </span>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {edit.rationale && (
              <p className="text-sm text-muted-foreground italic leading-snug">
                {edit.rationale}
              </p>
            )}

            {diffContent(true)}
            {actionButtons(true)}
          </motion.div>
        </div>,
        document.body
      )}
    </>
  );
};

// ── Main component ────────────────────────────────────────────────────

type ChatEditorProps = {
  currentSection?: string;
  sectionId?: string;
  isEmbedded?: boolean;
};

export const ChatEditor = ({ currentSection, sectionId, isEmbedded = false }: ChatEditorProps) => {
  const conversationId = useMemo(
    () => sectionId ? `section-${sectionId}` : "dashboard",
    [sectionId]
  );

  const { data: history } = useChatHistory(conversationId);
  const { sendMessage: streamMessage, isStreaming, streamingContent, stagedEdits, isToolRunning } = useChatStream();
  const approveEdit = useApproveEdit();
  const rejectEdit = useRejectEdit();

  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [editStatuses, setEditStatuses] = useState<Record<string, "accepted" | "rejected">>({});
  const [processingEditId, setProcessingEditId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice-to-text via Web Speech API
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // Capture whatever is already in the input as the frozen base
    const baseText = input.trim() ? input.trimEnd() + " " : "";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let full = "";
      for (let i = 0; i < event.results.length; i++) {
        full += event.results[i][0].transcript;
      }
      setInput(baseText + full);
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // Build display messages: history from DB + local optimistic messages
  const messages = useMemo(() => {
    const initialMsg: ChatMessage = {
      id: "initial",
      role: "assistant",
      content: isEmbedded && currentSection
        ? `You're viewing: **${currentSection}**\n\nJust tell me what you want to add or change — I'll figure out where it belongs in the playbook. It doesn't have to be about this section.\n\nI can also help with gaps, questions, or drafting new content.`
        : "Hi! I'm your playbook assistant. Just tell me what you want to add or change — I'll figure out where it goes.\n\nYou can paste notes, describe a new technique, or ask me to fill a gap. I'll draft the content and place it in the right section for your review.",
      timestamp: new Date().toISOString(),
    };

    const dbMessages = history ?? [];
    return [initialMsg, ...dbMessages, ...localMessages];
  }, [history, localMessages, isEmbedded, currentSection]);

  // Reset local messages when conversation changes
  useEffect(() => {
    setLocalMessages([]);
    setEditStatuses({});
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingContent, stagedEdits]);

  const handleAccept = async (editId: string) => {
    setProcessingEditId(editId);
    try {
      await approveEdit.mutateAsync(editId);
      setEditStatuses((prev) => ({ ...prev, [editId]: "accepted" }));
      toast.success("Edit approved and applied!");
    } catch {
      toast.error("Failed to approve edit");
    } finally {
      setProcessingEditId(null);
    }
  };

  const handleReject = async (editId: string) => {
    setProcessingEditId(editId);
    try {
      await rejectEdit.mutateAsync(editId);
      setEditStatuses((prev) => ({ ...prev, [editId]: "rejected" }));
      toast.success("Edit rejected");
    } catch {
      toast.error("Failed to reject edit");
    } finally {
      setProcessingEditId(null);
    }
  };

  const handleSendText = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const result = await streamMessage(text, {
        conversationId,
        sectionContext: sectionId
          ? { sectionId, sectionTitle: currentSection ?? "" }
          : undefined,
      });

      // Persist edits as a local assistant message so they stay visible after stream ends
      if (result.edits.length > 0) {
        setLocalMessages((prev) => [
          ...prev,
          {
            id: `edits-${Date.now()}`,
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
            edits: result.edits,
          },
        ]);
      } else {
        // No edits — history query will refetch, clear locals
        setLocalMessages([]);
      }
    } catch {
      // On error, keep local messages visible so user sees what they sent
    }
  };

  const handleSend = () => handleSendText(input);

  return (
    <motion.div
      initial={{ opacity: 0, y: isEmbedded ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: isEmbedded ? 0 : 0.2 }}
      className={`flex flex-col ${isEmbedded ? "h-full bg-muted/30" : "rounded-xl border border-border bg-card shadow-card h-[600px]"}`}
    >
      <div className={`flex items-center gap-2 px-5 py-4 ${isEmbedded ? "border-b border-border/50" : "border-b border-border"}`}>
        <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">AI Assistant</h2>
          <p className="text-[11px] text-muted-foreground">{isEmbedded ? "Context-aware help" : "Draft and edit playbook content"}</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              {/* Avatar */}
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${msg.role === "assistant" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}`}>
                {msg.role === "assistant" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>

              <div className="max-w-[80%] space-y-2">
                {/* Text content */}
                {msg.content && (
                  <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${msg.role === "assistant" ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}>
                    {msg.role === "assistant" ? (
                      <Markdown>{msg.content}</Markdown>
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}
                  </div>
                )}

                {/* Inline diff cards for this message */}
                {msg.edits?.map((edit) => (
                  <DiffCard
                    key={edit.id}
                    edit={edit}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    status={editStatuses[edit.id] ?? "pending"}
                    isProcessing={processingEditId === edit.id}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Streaming text */}
        {isStreaming && streamingContent && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="max-w-[80%] space-y-2">
              <div className="rounded-xl px-4 py-3 text-sm leading-relaxed bg-muted text-foreground">
                <Markdown>{streamingContent}</Markdown>
              </div>

              {/* Diff cards that arrived during streaming */}
              {stagedEdits.map((edit) => (
                <DiffCard
                  key={edit.id}
                  edit={edit}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  status={editStatuses[edit.id] ?? "pending"}
                  isProcessing={processingEditId === edit.id}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Diff cards without preceding text (tool-only response) */}
        {isStreaming && !streamingContent && stagedEdits.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="max-w-[80%] space-y-2">
              {stagedEdits.map((edit) => (
                <DiffCard
                  key={edit.id}
                  edit={edit}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  status={editStatuses[edit.id] ?? "pending"}
                  isProcessing={processingEditId === edit.id}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Tool running indicator */}
        {isStreaming && isToolRunning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-muted rounded-xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
              <span className="text-xs text-muted-foreground">Staging edit...</span>
            </div>
          </motion.div>
        )}

        {/* Loading dots */}
        {isStreaming && !streamingContent && !isToolRunning && stagedEdits.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-muted rounded-xl px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-end gap-2 bg-muted rounded-xl px-4 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask me to draft content, fill gaps, or edit sections..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none leading-relaxed py-1"
            rows={1}
            disabled={isStreaming}
          />
          {speechSupported && (
            <button
              onClick={toggleListening}
              disabled={isStreaming}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 ${isListening ? "bg-red-500/15 text-red-500 animate-pulse" : "text-muted-foreground hover:text-foreground"}`}
              title={isListening ? "Stop listening" : "Voice input"}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center disabled:opacity-30 transition-opacity"
          >
            <Send className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
