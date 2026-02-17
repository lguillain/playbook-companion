import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlaybookSections, useUpdateSection } from "@/hooks/use-playbook-sections";
import { useSkills } from "@/hooks/use-skills";
import { useCreateStagedEdit } from "@/hooks/use-staged-edits";
import { extractHeadings } from "@/lib/extract-headings";
import { FileText, Clock, ChevronRight, CheckCircle2, AlertTriangle, XCircle, Pencil, X, Save, Loader2, Filter, ChevronsUpDown, Check } from "lucide-react";
import { toast } from "sonner";
import { ChatEditor } from "./ChatEditor";
import { Markdown } from "./Markdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

/** Extract the changed region with a few lines of context. */
function focusedDiff(before: string, after: string, contextLines = 2): { before: string; after: string } {
  const a = before.split("\n");
  const b = after.split("\n");

  // Find first differing line
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  // Find last differing line (from end)
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA > start && endB > start && a[endA] === b[endB]) { endA--; endB--; }

  // Add context
  const ctxStart = Math.max(0, start - contextLines);
  const ctxEndA = Math.min(a.length - 1, endA + contextLines);
  const ctxEndB = Math.min(b.length - 1, endB + contextLines);

  return {
    before: a.slice(ctxStart, ctxEndA + 1).join("\n"),
    after: b.slice(ctxStart, ctxEndB + 1).join("\n"),
  };
}

const statusIcon = {
  covered: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
  partial: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
  missing: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
};

const isSkillOutdated = (lastUpdated?: string) => {
  if (!lastUpdated) return false;
  return (new Date().getTime() - new Date(lastUpdated).getTime()) > 90 * 24 * 60 * 60 * 1000;
};

type StatusFilterKey = "covered" | "partial" | "missing" | "outdated";

const statusPillConfig: { key: StatusFilterKey; icon: typeof CheckCircle2; label: string; color: string }[] = [
  { key: "covered", icon: CheckCircle2, label: "Covered", color: "text-success" },
  { key: "partial", icon: AlertTriangle, label: "Partial", color: "text-warning" },
  { key: "missing", icon: XCircle, label: "Missing", color: "text-destructive" },
  { key: "outdated", icon: Clock, label: "Outdated", color: "text-muted-foreground" },
];

type SkillFilterComboboxProps = {
  skillFilter: { skillId: string; skillName: string } | null | undefined;
  skillsFramework: import("@/lib/types").SkillCategory[] | undefined;
  allSkills: import("@/lib/types").Skill[];
  onSkillFilterChange: (filter: { skillId: string; skillName: string } | null) => void;
};

const skillStatusIcon = {
  covered: { Icon: CheckCircle2, color: "text-success" },
  partial: { Icon: AlertTriangle, color: "text-warning" },
  missing: { Icon: XCircle, color: "text-destructive" },
};

function SkillFilterCombobox({ skillFilter, skillsFramework, allSkills, onSkillFilterChange }: SkillFilterComboboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="px-3 py-2 border-b border-border/50">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            role="combobox"
            aria-expanded={open}
            className="flex w-full items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/30 hover:bg-muted/50 transition-colors"
          >
            {skillFilter ? (
              <span className="flex items-center gap-1.5 truncate">
                {(() => {
                  const skill = allSkills.find((s) => s.id === skillFilter.skillId);
                  if (!skill) return skillFilter.skillName;
                  const { Icon, color } = skillStatusIcon[skill.status];
                  return (
                    <>
                      <Icon className={`w-3 h-3 flex-shrink-0 ${color}`} />
                      <span className="truncate">{skill.name}</span>
                    </>
                  );
                })()}
              </span>
            ) : (
              <span className="text-muted-foreground">All sections</span>
            )}
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Filter by skill..." className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty>No skill found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__all__"
                  onSelect={() => {
                    onSkillFilterChange(null);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check className={`mr-1.5 h-3 w-3 ${!skillFilter ? "opacity-100" : "opacity-0"}`} />
                  All sections
                </CommandItem>
              </CommandGroup>
              {skillsFramework?.map((cat) => (
                <CommandGroup key={cat.id} heading={cat.name}>
                  {cat.skills.map((skill) => {
                    const { Icon, color } = skillStatusIcon[skill.status];
                    const isSelected = skillFilter?.skillId === skill.id;
                    return (
                      <CommandItem
                        key={skill.id}
                        value={skill.name}
                        onSelect={() => {
                          onSkillFilterChange({ skillId: skill.id, skillName: skill.name });
                          setOpen(false);
                        }}
                        className="text-xs"
                      >
                        <Check className={`mr-1.5 h-3 w-3 flex-shrink-0 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                        <Icon className={`mr-1.5 h-3 w-3 flex-shrink-0 ${color}`} />
                        <span className="truncate">{skill.name}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

type PlaybookViewerProps = {
  skillFilter?: { skillId: string; skillName: string } | null;
  onSkillFilterChange: (filter: { skillId: string; skillName: string } | null) => void;
};

export const PlaybookViewer = ({ skillFilter, onSkillFilterChange }: PlaybookViewerProps) => {
  const { data: sections, isLoading: sectionsLoading } = usePlaybookSections();
  const { data: skillsFramework, isLoading: skillsLoading } = useSkills();
  const updateSection = useUpdateSection();
  const createEdit = useCreateStagedEdit();

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey | null>(null);

  const allSkills = useMemo(
    () => skillsFramework?.flatMap((c) => c.skills) ?? [],
    [skillsFramework]
  );

  const getSkillsForSection = useMemo(() => {
    return (sectionTitle: string) => allSkills.filter((s) => s.section === sectionTitle);
  }, [allSkills]);

  const { displaySections, filterMode } = useMemo<{
    displaySections: typeof sections extends (infer T)[] | undefined ? T[] : never[];
    filterMode: "none" | "direct" | "category" | "unlinked";
  }>(() => {
    if (!sections) return { displaySections: [] as any, filterMode: "none" };

    let filtered = sections;
    let mode: "none" | "direct" | "category" | "unlinked" = "none";

    // Apply skill filter first
    if (skillFilter) {
      const targetSkill = allSkills.find((s) => s.id === skillFilter.skillId);

      // 1. Direct match: skill linked to section via junction table or section_title
      const direct = sections.filter((section) => {
        if (section.skillsCovered.includes(skillFilter.skillId)) return true;
        if (targetSkill?.section && targetSkill.section === section.title) return true;
        return false;
      });
      if (direct.length > 0) {
        filtered = direct;
        mode = "direct";
      } else {
        // 2. Category match: sections linked to sibling skills in the same category
        const category = skillsFramework?.find((c) => c.skills.some((s) => s.id === skillFilter.skillId));
        if (category) {
          const siblingIds = new Set(category.skills.map((s) => s.id));
          const byCat = sections.filter((section) =>
            section.skillsCovered.some((sid) => siblingIds.has(sid))
          );
          if (byCat.length > 0) {
            filtered = byCat;
            mode = "category";
          } else {
            mode = "unlinked";
          }
        } else {
          mode = "unlinked";
        }
      }
    }

    // Apply status filter on top — check both junction-table links and title-based links
    if (statusFilter) {
      filtered = filtered.filter((section) => {
        const linkedSkillIds = new Set(section.skillsCovered);
        const titleSkills = getSkillsForSection(section.title);
        for (const s of titleSkills) linkedSkillIds.add(s.id);

        const linkedSkills = allSkills.filter((s) => linkedSkillIds.has(s.id));
        if (linkedSkills.length === 0) return false;
        if (statusFilter === "outdated") return linkedSkills.some((s) => isSkillOutdated(s.lastUpdated));
        return linkedSkills.some((s) => s.status === statusFilter);
      });
    }

    return { displaySections: filtered, filterMode: mode };
  }, [skillFilter, statusFilter, sections, allSkills, skillsFramework, getSkillsForSection]);

  // Compute status counts from all skills (consistent with dashboard)
  const statusCounts = useMemo(() => {
    const counts = { covered: 0, partial: 0, missing: 0, outdated: 0 };
    for (const skill of allSkills) {
      if (skill.status === "covered") counts.covered++;
      if (skill.status === "partial") counts.partial++;
      if (skill.status === "missing") counts.missing++;
      if (isSkillOutdated(skill.lastUpdated)) counts.outdated++;
    }
    return counts;
  }, [allSkills]);

  // Auto-select first section when filter changes or data loads
  useEffect(() => {
    if ((skillFilter || statusFilter) && displaySections.length > 0) {
      setActiveSection(displaySections[0].id);
      setEditing(false);
    }
  }, [skillFilter?.skillId, statusFilter, displaySections]);

  if (sectionsLoading || skillsLoading || !sections || !skillsFramework) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-card flex items-center justify-center h-[calc(100vh-180px)]">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  const currentId = activeSection ?? displaySections[0]?.id;
  const current = displaySections.find((s) => s.id === currentId) ?? displaySections[0];

  if (!current) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl border border-border bg-card shadow-card flex flex-col h-[calc(100vh-180px)]"
      >
        <div className="px-5 py-3 border-b border-border">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Playbook Content</h2>
            </div>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-2">
              {statusPillConfig.map(({ key, icon: Icon, label, color }) => {
                const count = statusCounts[key];
                const active = statusFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(active ? null : key)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      active
                        ? "bg-primary/10 ring-2 ring-primary/30"
                        : "bg-muted/50 hover:bg-muted/80"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-bold font-mono ${color}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          No sections match this filter.
        </div>
      </motion.div>
    );
  }

  const sectionSkills = getSkillsForSection(current.title);

  const startEditing = () => {
    setEditDraft(current.content);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditDraft("");
  };

  const saveEdit = async () => {
    if (editDraft === current.content) {
      setEditing(false);
      return;
    }

    const diff = focusedDiff(current.content, editDraft);

    try {
      // Directly update the section content
      await updateSection.mutateAsync({ id: current.id, content: editDraft });
      // Record as auto-approved staged edit (focused diff for audit trail)
      await createEdit.mutateAsync({
        sectionId: current.id,
        before: diff.before,
        after: diff.after,
        source: "manual",
        autoApprove: true,
      });
      setEditing(false);
      setEditDraft("");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch {
      toast.error("Failed to save edit");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-xl border border-border bg-card shadow-card flex flex-col h-[calc(100vh-180px)]"
    >
      <div className="px-5 py-3 border-b border-border">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Playbook Content</h2>
          </div>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            {statusPillConfig.map(({ key, icon: Icon, label, color }) => {
              const count = statusCounts[key];
              const active = statusFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(active ? null : key)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? "bg-primary/10 ring-2 ring-primary/30"
                      : "bg-muted/50 hover:bg-muted/80"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-bold font-mono ${color}`}>{count}</span>
                </button>
              );
            })}
          </div>
          {skillFilter && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3 h-3 text-primary" />
                <span className="text-[11px] text-muted-foreground">
                  {filterMode === "direct" && `${displaySections.length} section${displaySections.length !== 1 ? "s" : ""} for`}
                  {filterMode === "category" && `${displaySections.length} related section${displaySections.length !== 1 ? "s" : ""} for`}
                  {filterMode === "unlinked" && "No linked sections for"}
                </span>
                <span className="text-[11px] font-semibold text-primary">{skillFilter.skillName}</span>
                {filterMode === "unlinked" && (
                  <span className="text-[11px] text-muted-foreground">— consider adding a new section</span>
                )}
              </div>
              <button
                onClick={() => onSkillFilterChange(null)}
                className="flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                <X className="w-2.5 h-2.5" />
                Clear
              </button>
            </div>
          )}
          <AnimatePresence mode="wait">
            {savedFlash && (
              <motion.span key="saved" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-[10px] text-success font-semibold">
                <CheckCircle2 className="w-3 h-3" />
                Saved — staged for review
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Side: Playbook Navigation & Content */}
        <div className="flex flex-1 overflow-hidden border-r border-border">
          {/* Sidebar */}
          <div className="w-56 border-r border-border flex-shrink-0 flex flex-col">
            <SkillFilterCombobox
              skillFilter={skillFilter}
              skillsFramework={skillsFramework}
              allSkills={allSkills}
              onSkillFilterChange={onSkillFilterChange}
            />
            <div className="flex-1 overflow-y-auto py-1">
            {displaySections.map((section) => {
              const skills = getSkillsForSection(section.title);
              const coveredCount = skills.filter((s) => s.status === "covered").length;
              const totalCount = skills.length;
              const isActive = currentId === section.id;
              const headings = isActive ? extractHeadings(section.content) : [];

              return (
                <div key={section.id}>
                  <button
                    onClick={() => { setActiveSection(section.id); setEditing(false); }}
                    className={`w-full text-left px-4 py-2.5 flex items-start gap-2 text-xs transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary border-r-2 border-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <ChevronRight className={`w-3 h-3 mt-0.5 flex-shrink-0 transition-transform ${isActive ? "rotate-90" : ""}`} />
                    <div>
                      <span className="block">{section.title}</span>
                      {totalCount > 0 && (
                        <span className={`text-[10px] font-mono ${coveredCount === totalCount ? "text-success" : "text-muted-foreground"}`}>
                          {coveredCount}/{totalCount} skills
                        </span>
                      )}
                    </div>
                  </button>
                  {isActive && headings.length > 0 && (
                    <div className="pb-1">
                      {headings.map((h) => (
                        <button
                          key={h.slug}
                          onClick={() => document.getElementById(h.slug)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                          className="w-full text-left text-[11px] py-1 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors truncate"
                          style={{ paddingLeft: `${(h.level - 1) * 12 + 16}px` }}
                          title={h.text}
                        >
                          {h.text}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-lg font-bold text-foreground">{current.title.replace(/^\u00A0+/, "")}</h3>
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
                      disabled={updateSection.isPending}
                      className="flex items-center gap-1 rounded-lg gradient-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
                    >
                      {updateSection.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
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
              <Markdown>{current.content}</Markdown>
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
