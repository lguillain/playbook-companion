import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, Bot, User } from "lucide-react";
import type { ChatMessage } from "@/lib/mock-data";

const initialMessages: ChatMessage[] = [
  {
    id: "1",
    role: "assistant",
    content: "👋 I'm your playbook assistant. I can help you fill content gaps, update sections, or draft new material. What would you like to work on?",
    timestamp: new Date().toISOString(),
  },
];

const mockResponses: Record<string, string> = {
  "budget discovery": `Here's a draft for **Budget Discovery**:\n\n### Budget Discovery Questions\n1. "Has budget been allocated for this initiative?"\n2. "What's the typical procurement process for tools in this category?"\n3. "Who controls the budget for this department?"\n4. "What ROI would justify this investment for your team?"\n\n**Pro tip:** Never ask "What's your budget?" directly. Instead, frame around investment expectations.\n\nWant me to add this to your Discovery Playbook?`,
  "competitive positioning": `Here's a draft for **Competitive Positioning**:\n\n### Competitive Battlecard\n| Competitor | Their Pitch | Our Counter |\n|-----------|------------|-------------|\n| Competitor A | "All-in-one platform" | "Purpose-built > jack-of-all-trades" |\n| Competitor B | "Lowest price" | "TCO includes implementation + training" |\n| Competitor C | "Enterprise-grade" | "Enterprise power, startup speed" |\n\n**Key differentiators:**\n- 3x faster implementation\n- No-code customization\n- Real-time analytics\n\nShall I stage this for review?`,
};

export const ChatEditor = ({ prefillGap }: { prefillGap?: string }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefillGap) {
      setInput(`Help me write content for: ${prefillGap}`);
    }
  }, [prefillGap]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    const matchKey = Object.keys(mockResponses).find((k) => input.toLowerCase().includes(k));

    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: matchKey
          ? mockResponses[matchKey]
          : `I've drafted some content based on your request. Here's what I suggest:\n\n> ${input}\n\nI can refine this further, add examples, or stage it for review. What would you prefer?`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-xl border border-border bg-card shadow-card flex flex-col h-[600px]"
    >
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Playbook Chat Editor</h2>
          <p className="text-[11px] text-muted-foreground">Draft and edit playbook content with AI</p>
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
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${msg.role === "assistant" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}`}>
                {msg.role === "assistant" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${msg.role === "assistant" ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isTyping && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
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
        <div className="flex items-center gap-2 bg-muted rounded-xl px-4 py-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask me to draft content, fill gaps, or edit sections..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center disabled:opacity-30 transition-opacity"
          >
            <Send className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
