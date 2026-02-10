import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Link, Upload, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { getHealthScore } from "@/lib/mock-data";

const { missing, partial } = getHealthScore();
const gapCount = missing + partial;

const sources = [
  { id: "notion", name: "Notion", icon: "📝", desc: "Connect your Notion workspace" },
  { id: "confluence", name: "Confluence", icon: "📘", desc: "Link your Confluence space" },
  { id: "pdf", name: "PDF Upload", icon: "📄", desc: "Upload a playbook PDF" },
];

export const OnboardingFlow = ({ onComplete }: { onComplete: () => void }) => {
  const [step, setStep] = useState<"source" | "analyzing" | "done">("source");
  const [selected, setSelected] = useState<string | null>(null);

  const handleConnect = () => {
    if (!selected) return;
    setStep("analyzing");
    setTimeout(() => setStep("done"), 3000);
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-card"
      >
        <AnimatePresence mode="wait">
          {step === "source" && (
            <motion.div key="source" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 className="text-2xl font-bold text-foreground mb-1">Connect your playbook</h2>
              <p className="text-sm text-muted-foreground mb-6">Choose where your sales playbook lives</p>

              <div className="space-y-2 mb-6">
                {sources.map((src) => (
                  <button
                    key={src.id}
                    onClick={() => setSelected(src.id)}
                    className={`w-full flex items-center gap-4 rounded-xl p-4 border transition-all ${
                      selected === src.id
                        ? "border-primary bg-primary/5 shadow-glow"
                        : "border-border bg-muted/30 hover:border-muted-foreground/30"
                    }`}
                  >
                    <span className="text-2xl">{src.icon}</span>
                    <div className="text-left">
                      <div className="text-sm font-semibold text-foreground">{src.name}</div>
                      <div className="text-xs text-muted-foreground">{src.desc}</div>
                    </div>
                    {selected === src.id && <CheckCircle2 className="w-5 h-5 text-primary ml-auto" />}
                  </button>
                ))}
              </div>

              <button
                onClick={handleConnect}
                disabled={!selected}
                className="w-full flex items-center justify-center gap-2 rounded-xl gradient-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-30 transition-opacity"
              >
                Connect & Analyze
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {step === "analyzing" && (
            <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-8">
              <Loader2 className="w-10 h-10 text-primary mx-auto mb-4 animate-spin" />
              <h2 className="text-xl font-bold text-foreground mb-2">Analyzing your playbook</h2>
              <p className="text-sm text-muted-foreground">Mapping content to skills framework…</p>
              <div className="mt-6 space-y-2">
                {["Importing content…", "Identifying skills coverage…", "Checking recency…"].map((text, i) => (
                  <motion.div
                    key={text}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.8 }}
                    className="flex items-center gap-2 justify-center text-xs text-muted-foreground"
                  >
                    <CheckCircle2 className="w-3 h-3 text-success" />
                    {text}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {step === "done" && (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-8">
              <div className="w-14 h-14 rounded-2xl gradient-primary mx-auto mb-4 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-primary-foreground" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Playbook connected!</h2>
              <p className="text-sm text-muted-foreground mb-6">We found {gapCount} gaps in your skills coverage. Let's fix them.</p>
              <button
                onClick={onComplete}
                className="rounded-xl gradient-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
              >
                View Dashboard
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
