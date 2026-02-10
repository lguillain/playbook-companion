import { useState } from "react";
import { motion } from "framer-motion";
import { playbookSections } from "@/lib/mock-data";
import { FileText, Clock, ChevronRight } from "lucide-react";

export const PlaybookViewer = () => {
  const [activeSection, setActiveSection] = useState(playbookSections[0].id);
  const current = playbookSections.find((s) => s.id === activeSection)!;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-xl border border-border bg-card shadow-card flex flex-col h-[600px]"
    >
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Playbook Content</h2>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-52 border-r border-border overflow-y-auto py-2 flex-shrink-0">
          {playbookSections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-2 text-xs transition-colors ${
                activeSection === section.id
                  ? "bg-primary/10 text-primary border-r-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <ChevronRight className={`w-3 h-3 transition-transform ${activeSection === section.id ? "rotate-90" : ""}`} />
              {section.title}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-bold text-foreground">{current.title}</h3>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono bg-muted rounded px-2 py-0.5">
              <Clock className="w-2.5 h-2.5" />
              {current.lastUpdated}
            </div>
          </div>
          <div className="prose prose-sm prose-invert max-w-none">
            {current.content.split("\n").map((line, i) => {
              if (line.startsWith("## ")) return <h2 key={i} className="text-base font-bold text-foreground mt-4 mb-2">{line.replace("## ", "")}</h2>;
              if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-semibold text-foreground mt-3 mb-1.5">{line.replace("### ", "")}</h3>;
              if (line.startsWith("- ")) return <li key={i} className="text-sm text-secondary-foreground ml-4 list-disc">{line.replace("- ", "")}</li>;
              if (line.startsWith("| ")) return <p key={i} className="text-xs font-mono text-muted-foreground">{line}</p>;
              if (line.startsWith("**")) return <p key={i} className="text-sm font-semibold text-foreground mt-2">{line.replace(/\*\*/g, "")}</p>;
              if (line.startsWith(">")) return <blockquote key={i} className="border-l-2 border-primary pl-3 text-sm text-muted-foreground italic my-2">{line.replace("> ", "")}</blockquote>;
              if (line.match(/^\d+\./)) return <li key={i} className="text-sm text-secondary-foreground ml-4 list-decimal">{line.replace(/^\d+\.\s/, "")}</li>;
              if (line.trim() === "") return <br key={i} />;
              return <p key={i} className="text-sm text-secondary-foreground leading-relaxed">{line}</p>;
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
