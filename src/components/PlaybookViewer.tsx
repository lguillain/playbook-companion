import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { playbookSections as initialSections, skillsFramework } from "@/lib/mock-data";
import { FileText, Clock, ChevronRight, CheckCircle2, AlertTriangle, XCircle, Pencil, X, Save } from "lucide-react";
import { ChatEditor } from "./ChatEditor";

const statusIcon = {
  covered: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
  partial: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
  missing: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
};

function getSkillsForSection(sectionTitle: string) {
  const allSkills = skillsFramework.flatMap((c) => c.skills);
  return allSkills.filter((s) => s.section === sectionTitle);
}

function getMissingSkillsForSection(sectionId: string) {
  const section = initialSections.find((s) => s.id === sectionId);
  if (!section) return [];
  const allSkills = skillsFramework.flatMap((c) => c.skills);
  // Skills that point to this section but aren't in skillsCovered (i.e. the section exists but skill is still partial/missing)
  const coveredIds = new Set(section.skillsCovered);
  return allSkills.filter((s) => s.section === section.title && !coveredIds.includes(s.id) && s.status !== "covered");
}

export const PlaybookViewer = () => {
  const [sections, setSections] = useState(initialSections);
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const current = sections.find((s) => s.id === activeSection)!;
  const sectionSkills = getSkillsForSection(current.title);

  const startEditing = () => {
    setEditDraft(current.content);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditDraft("");
  };

  const saveEdit = () => {
    if (editDraft === current.content) {
      setEditing(false);
      return;
    }
    setSections((prev) =>
      prev.map((s) => (s.id === activeSection ? { ...s, content: editDraft } : s))
    );
    setEditing(false);
    setEditDraft("");
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-xl border border-border bg-card shadow-card flex flex-col h-[calc(100vh-180px)]"
    >
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Playbook Content</h2>
          <AnimatePresence mode="wait">
            {savedFlash ? (
              <motion.span key="saved" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-[10px] text-success font-semibold">
                <CheckCircle2 className="w-3 h-3" />
                Saved — staged for review
              </motion.span>
            ) : (
              <motion.span key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[10px] text-muted-foreground">
                {editing ? "Editing · Markdown supported" : "Click edit to make changes"}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Side: Playbook Navigation & Content */}
        <div className="flex flex-1 overflow-hidden border-r border-border">
          {/* Sidebar */}
          <div className="w-56 border-r border-border overflow-y-auto py-2 flex-shrink-0">
            {sections.map((section) => {
              const skills = getSkillsForSection(section.title);
              const coveredCount = skills.filter((s) => s.status === "covered").length;
              const totalCount = skills.length;

              return (
                <button
                  key={section.id}
                  onClick={() => { setActiveSection(section.id); setEditing(false); }}
                  className={`w-full text-left px-4 py-2.5 flex items-start gap-2 text-xs transition-colors ${
                    activeSection === section.id
                      ? "bg-primary/10 text-primary border-r-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <ChevronRight className={`w-3 h-3 mt-0.5 flex-shrink-0 transition-transform ${activeSection === section.id ? "rotate-90" : ""}`} />
                  <div>
                    <span className="block">{section.title}</span>
                    {totalCount > 0 && (
                      <span className={`text-[10px] font-mono ${coveredCount === totalCount ? "text-success" : "text-muted-foreground"}`}>
                        {coveredCount}/{totalCount} skills
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-lg font-bold text-foreground">{current.title}</h3>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono bg-muted rounded px-2 py-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {current.lastUpdated}
                </div>
                {!editing ? (
                  <button
                    onClick={startEditing}
                    className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground hover:bg-secondary/80 transition-colors ml-auto"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      onClick={cancelEditing}
                      className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted/80 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      className="flex items-center gap-1 rounded-lg gradient-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-opacity"
                    >
                      <Save className="w-3 h-3" />
                      Save
                    </button>
                  </div>
                )}
              </div>

              {/* Skills covered by this section */}
              {sectionSkills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {sectionSkills.map((skill) => {
                    const cfg = statusIcon[skill.status];
                    const Icon = cfg.icon;
                    return (
                      <span key={skill.id} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${cfg.bg} border border-transparent`}>
                        <Icon className={`w-3 h-3 ${cfg.color}`} />
                        {skill.name}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {editing ? (
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                className="w-full h-[calc(100%-80px)] min-h-[300px] rounded-lg border border-border bg-muted/30 p-4 text-sm text-foreground font-mono leading-relaxed resize-none outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                autoFocus
              />
            ) : (
              <div className="prose prose-sm max-w-none">
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
            )}
          </div>
        </div>

        {/* Right Side: Persistent Chat */}
        <div className="w-[400px] flex-shrink-0">
          <ChatEditor
            currentSection={current.title}
            sectionId={current.id}
            isEmbedded
          />
        </div>
      </div>
    </motion.div>
  );
};
