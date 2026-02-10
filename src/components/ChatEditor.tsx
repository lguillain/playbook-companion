import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, Bot, User } from "lucide-react";
import type { ChatMessage } from "@/lib/mock-data";

const initialMessages: ChatMessage[] = [
  {
    id: "1",
    role: "assistant",
    content: "Hi! I'm your playbook assistant. Just tell me what you want to add or change — I'll figure out where it goes.\n\nYou can paste notes, describe a new technique, or ask me to fill a gap. I'll draft the content and place it in the right section for your review.",
    timestamp: new Date().toISOString(),
  },
];

const mockResponses: Record<string, string> = {
  "decision-maker": `Here's draft content for **Decision-Maker Roles & Buying Groups**:\n\n### Mapping the Buying Group\n\n**Typical Roles in a Deal:**\n- **Economic Buyer (CRO/CEO):** Has budget authority. Cares about revenue impact, forecasting, ROI.\n- **Champion (Enablement Manager):** Drives internal adoption. Needs easy rollout and quick wins.\n- **Technical Evaluator (RevOps/IT):** Validates integrations, security, data flows.\n- **End Users (Sales Reps/Managers):** Must see day-to-day value or adoption stalls.\n\n**How to Identify Each:**\n- Ask your champion: "Who has the authority to release the funds and sign the deal?"\n- "Who else needs to see this before a decision?"\n- "What happened last time you bought a tool like this?"\n\n**Common Mistakes:**\n- Assuming your champion IS the economic buyer\n- Waiting until contract stage to discover approval layers\n- Not validating power with your champion directly\n\n**Exit Criteria:** You've mapped all stakeholders and met or scheduled the economic buyer.\n\nShall I stage this for review?`,

  "pitch scripts": `Here's draft content for **Pitch Scripts**:\n\n### Company-Specific Pitch Scripts\n\n**30-Second Elevator Pitch:**\n"We help sales teams turn every customer interaction into a coaching moment. Instead of relying on managers to review calls, our AI coaches reps in real-time through Slack and Teams—so they improve after every conversation, not just quarterly reviews."\n\n**Cold Call Opener (CRO/Head of Sales):**\n"Hi [Name], I'm calling because most sales leaders I speak with say their reps only retain 10% of training content. We've helped companies like [Reference] cut ramp time by 30% using real-time coaching embedded in their daily workflow. Is that something worth a 15-minute conversation?"\n\n**Cold Call Opener (Enablement):**\n"Hi [Name], I'm reaching out because enablement teams often tell me the biggest challenge isn't creating content—it's getting reps to actually use it. We've built a way to deliver coaching proactively in Slack/Teams so reps learn by doing. Worth a quick chat?"\n\n**Discovery Bridge:**\nAfter any cold call agreement: "Great—before we meet, can I ask: what's the biggest skills gap you're trying to close this quarter?"\n\nReady to add this to Value Proposition & Messaging?`,

  "risk detection": `Here's draft content for **Risk Detection Guidance**:\n\n### Spotting Deal Risk Early\n\n**Red Flags (High Risk):**\n- No access to economic buyer after Stage 2\n- Champion goes silent for >7 days\n- "We need to check with legal" without a timeline\n- Competitor mentioned late in process\n- No compelling event or hard deadline\n\n**Amber Flags (Monitor Closely):**\n- Single-threaded (only one contact)\n- Budget not yet allocated\n- Stakeholder changes mid-cycle\n- "We love it but timing isn't right"\n\n**Green Flags (On Track):**\n- Multi-threaded with 3+ stakeholders\n- Economic buyer engaged\n- Mutual action plan agreed\n- Clear timeline tied to business initiative\n\n**What To Do:**\n- Red: Escalate in deal review. Create recovery plan or disqualify.\n- Amber: Address in next meeting. Ask direct questions.\n- Green: Maintain momentum. Don't slow down.\n\nShall I stage this for review?`,

  "stakeholder mapping": `Here's draft content for **Stakeholder Mapping Questions**:\n\n### Discovery Questions for Stakeholder Mapping\n\n**Identifying the Buying Group:**\n- "Besides yourself, who else would be involved in evaluating this?"\n- "Who would need to sign off before moving forward?"\n- "Is there someone in IT/Security who'd need to review?"\n- "Who used to own this initiative before you?"\n\n**Understanding Influence:**\n- "If you recommend this, what happens next?"\n- "Has anyone in the organization pushed back on similar purchases?"\n- "Who would benefit most from this—and who might resist?"\n\n**Mapping the Process:**\n- "Walk me through how your last software purchase happened."\n- "What's the typical approval chain for a tool at this price point?"\n- "Are there any committees or review boards involved?"\n\n**Pro Tip:** Build a stakeholder map after every discovery call. Update it after every meeting. Share it with your champion to validate.\n\nReady to add this to the playbook?`,

  "solution fit": `Here's draft content for **Solution Fit Assessment**:\n\n### Evaluating Solution Fit\n\n**Strong Fit Indicators:**\n- B2B sales team with 10-100 reps\n- Already using call recording (Gong, Chorus, etc.)\n- Sales leadership wants to scale coaching\n- Current training is event-based, not continuous\n- Using Slack or Teams for internal communication\n\n**Weak Fit / Disqualify:**\n- Service-based sales (not product sales)\n- No call recording infrastructure\n- Team <5 reps (ROI hard to justify)\n- Looking for a content management system, not coaching\n\n**How to Assess During Demo:**\n1. After showing each feature, ask: "Does this match how your team works today?"\n2. Score each use case 0-10 with the prospect\n3. If average <6, have an honest conversation about fit\n4. Document fit assessment in CRM opportunity notes\n\n**Honest Conversation Template:**\n"Based on what I've heard, I want to be transparent—our solution is strongest when [X, Y, Z]. It sounds like your priority is [A]. Let me think about whether we're the best fit and get back to you."\n\nShall I stage this?`,

  "handover processes": `Here's draft content for **Handover Processes**:\n\n### Sales Handover Standards\n\n**SDR → AE Handoff:**\n- Required: Company name, ICP fit score, persona, pain points identified, recording link\n- Meeting: 5-min sync before first call or async Slack summary\n- AE must review call recording before discovery\n\n**AE → CS Handoff:**\n- Required within 24 hours of close:\n  - Business case and success plan\n  - Timeline and hard deadlines\n  - Stakeholder map with champions\n  - Integration requirements\n  - Risks and mitigation strategies\n  - Expected outcomes and metrics\n- Introduce CSM to champion via email\n- Schedule kickoff within 1 week\n\n**AE → AE (Territory Transfer):**\n- Pipeline review meeting\n- All deal context transferred in CRM\n- Warm intro to active prospects\n\n**Meeting Notes Standard:**\nEvery external meeting must have notes in CRM within 4 hours. Include: attendees, key takeaways, commitments made, next steps with dates.\n\nReady to add this to the playbook?`,
};

type FillRequest = { skill: string; key: number };

type ChatEditorProps = {
  prefillGap?: FillRequest;
  currentSection?: string;
  sectionId?: string;
  isEmbedded?: boolean;
};

export const ChatEditor = ({ prefillGap, currentSection, sectionId, isEmbedded = false }: ChatEditorProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefillGap) {
      const text = `Help me write content for: ${prefillGap.skill}`;
      sendMessage(text);
    }
  }, [prefillGap?.key]);

  // Update initial message when section changes (embedded mode)
  useEffect(() => {
    if (isEmbedded && currentSection) {
      setMessages([
        {
          id: "1",
          role: "assistant",
          content: `You're viewing: **${currentSection}**\n\nJust tell me what you want to add or change — I'll figure out where it belongs in the playbook. It doesn't have to be about this section.\n\nI can also help with gaps, questions, or drafting new content.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [currentSection, sectionId, isEmbedded]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    const matchKey = Object.keys(mockResponses).find((k) => text.toLowerCase().includes(k));

    setTimeout(() => {
      let content: string;

      if (matchKey) {
        content = mockResponses[matchKey];
      } else {
        // Provide contextual fallback responses based on keywords
        const lowerInput = text.toLowerCase();

        if (lowerInput.includes("objection") || lowerInput.includes("handle") || lowerInput.includes("pricing")) {
          content = `I can help with objection & pricing handling. I see we're missing content for:\n\n• **Top Rep Response Examples** — real examples from your best reps\n\nWe also have partial coverage on persona-specific objection patterns I could expand. Which would be most helpful right now?\n\nOr tell me about a specific objection your reps are facing, and I'll draft a response framework.`;
        } else if (lowerInput.includes("demo") || lowerInput.includes("presentation") || lowerInput.includes("solution fit")) {
          content = `For demo & solution fit, I can help with:\n\n• **Solution Fit Assessment** (currently missing)\n• **Persona-Based Demo Adaptation** (currently missing)\n• Expanding customer-specific demo examples\n• Improving the demo storyline and sequence\n\nWhat aspect of demos would you like to focus on?`;
        } else if (lowerInput.includes("qualification") || lowerInput.includes("meddicc") || lowerInput.includes("risk")) {
          content = `Our qualification section covers MEDDICC and 5Ps frameworks. I can help with:\n\n• **Risk Detection Guidance** (currently missing)\n• **Deal Health Flags** — red/amber/green indicators (currently missing)\n• Expanding ICP fit in qualification\n• Adding company-specific discovery questions\n\nWhich qualification skill should we prioritize?`;
        } else if (lowerInput.includes("discovery") || lowerInput.includes("question")) {
          content = `For discovery & customer-centric questioning, I see gaps in:\n\n• **Stakeholder Mapping Questions** (missing)\n• **Discovery-to-Value Connection** (missing)\n• Company-specific discovery questions (partial)\n\nI can draft targeted question frameworks tied to your ICP and personas. Where should we start?`;
        } else if (lowerInput.includes("process") || lowerInput.includes("meeting")) {
          content = `For sales process & meeting sequences, I can help with:\n\n• **Process Best Practices & Examples** (currently missing)\n• Expanding meeting sequences\n• Adding real examples of what "good" looks like at each stage\n\nWant me to start with best practices or meeting flow?`;
        } else if (lowerInput.includes("vocab") || lowerInput.includes("language") || lowerInput.includes("terminol")) {
          content = `For sales vocabulary & buyer language, I see a gap in:\n\n• **Terms to Avoid & Correct Usage** (missing)\n\nI can also expand buyer-facing terminology to ensure your team speaks the customer's language. Want me to draft a glossary or a "do's and don'ts" list?`;
        } else if (lowerInput.includes("tool") || lowerInput.includes("crm") || lowerInput.includes("handover") || lowerInput.includes("handoff")) {
          content = `For tools, tech stack & usage, I can help with:\n\n• **Handover Processes** — SDR→AE, AE→CS, territory transfers (missing)\n• Expanding sales engagement tool guidelines\n• Updating CRM usage rules\n\nWhat's most critical for your team right now?`;
        } else if (lowerInput.includes("deal") || lowerInput.includes("opportunity") || lowerInput.includes("alignment")) {
          content = `For opportunity management & deal control, I see gaps in:\n\n• **Internal Alignment Playbook** (missing)\n• Expanding next-step control techniques\n\nI can also strengthen the mutual commitment checklists. What would help your reps most?`;
        } else {
          // Generic but helpful fallback
          content = `I can help with that! Based on your playbook, I suggest:\n\n**Current gaps I see:**\n• Decision-Maker Roles & Buying Groups\n• Risk Detection Guidance\n• Stakeholder Mapping Questions\n• Solution Fit Assessment\n• Handover Processes\n\n**Or I can:**\n• Expand existing sections with more examples\n• Update outdated content\n• Answer questions about what's already documented\n\nWhat would be most valuable for your team right now?`;
        }
      }

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsTyping(false);
    }, 1500);
  };

  const handleSend = () => sendMessage(input);

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
