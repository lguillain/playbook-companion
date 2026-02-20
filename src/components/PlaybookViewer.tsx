import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlaybookSections, useUpdateSection } from "@/hooks/use-playbook-sections";
import { useSkills, useToggleSkillFulfilled } from "@/hooks/use-skills";
import { useCreateStagedEdit } from "@/hooks/use-staged-edits";
import { extractHeadings, type Heading } from "@/lib/extract-headings";
import type { PlaybookSection } from "@/lib/types";
import { FileText, Clock, ChevronRight, CheckCircle2, AlertTriangle, XCircle, Pencil, X, Save, Loader2, Filter, ChevronsUpDown, Check, PanelRightClose, PanelRightOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ChatEditor } from "./ChatEditor";
import { Markdown } from "./Markdown";
import { MarkdownEditor } from "./MarkdownEditor";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";


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

// ── Tree building ────────────────────────────────────────────────────

type SectionTreeNode = PlaybookSection & { children: SectionTreeNode[] };

function buildSectionTree(sections: PlaybookSection[]): SectionTreeNode[] {
  const roots: SectionTreeNode[] = [];
  const stack: SectionTreeNode[] = [];
  for (const section of sections) {
    const node: SectionTreeNode = { ...section, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].depth >= section.depth) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }
  return roots;
}

type SectionTreeItemProps = {
  node: SectionTreeNode;
  currentId: string;
  expandedSections: Set<string>;
  headingsMap: Map<string, Heading[]>;
  getSkillsForSection: (sectionId: string) => import("@/lib/types").Skill[];
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  level: number;
};

function SectionTreeItem({
  node,
  currentId,
  expandedSections,
  headingsMap,
  getSkillsForSection,
  onSelect,
  onToggle,
  level,
}: SectionTreeItemProps) {
  const isActive = currentId === node.id;
  const isExpanded = expandedSections.has(node.id);
  const headings = headingsMap.get(node.id) ?? [];
  const hasChildren = node.children.length > 0 || headings.length > 0;
  const skills = getSkillsForSection(node.id);
  const coveredCount = skills.filter((s) => s.status === "covered").length;
  const totalCount = skills.length;
  const indent = level * 12 + 8;

  return (
    <div>
      <div
        className={`flex items-start text-xs transition-colors ${
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`}
        style={{ paddingLeft: `${indent}px` }}
      >
        {/* Chevron toggle — only clickable when there are children */}
        <button
          onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(node.id); }}
          className={`w-5 h-7 flex items-center justify-center flex-shrink-0 ${hasChildren ? "cursor-pointer" : "invisible"}`}
          tabIndex={hasChildren ? 0 : -1}
        >
          <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
        </button>
        {/* Section title */}
        <button
          onClick={() => onSelect(node.id)}
          className="flex-1 text-left py-2 pr-3 flex items-start gap-1.5 min-w-0"
        >
          <FileText className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-50" />
          <div className="min-w-0">
            <span className="block truncate">{node.title}</span>
            {totalCount > 0 && (
              <span className={`text-[10px] font-mono ${coveredCount === totalCount ? "text-success" : "text-muted-foreground"}`}>
                {coveredCount}/{totalCount} skills
              </span>
            )}
          </div>
        </button>
      </div>
      {/* Collapsible children + headings */}
      {hasChildren && (
        <Collapsible open={isExpanded}>
          <CollapsibleContent>
            {/* Child sections (recursive) */}
            {node.children.map((child) => (
              <SectionTreeItem
                key={child.id}
                node={child}
                currentId={currentId}
                expandedSections={expandedSections}
                headingsMap={headingsMap}
                getSkillsForSection={getSkillsForSection}
                onSelect={onSelect}
                onToggle={onToggle}
                level={level + 1}
              />
            ))}
            {/* Heading sub-nav (only for active section) */}
            {isActive && headings.length > 0 && (
              <div className="pb-1">
                {headings.map((h) => (
                  <button
                    key={h.slug}
                    onClick={() => document.getElementById(h.slug)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="w-full text-left text-[11px] py-1 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors truncate"
                    style={{ paddingLeft: `${indent + 20 + (h.level - 2) * 12}px` }}
                    title={h.text}
                  >
                    {h.text}
                  </button>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

type PlaybookViewerProps = {
  skillFilter?: { skillId: string; skillName: string } | null;
  onSkillFilterChange: (filter: { skillId: string; skillName: string } | null) => void;
  initialSectionId?: string | null;
  onInitialSectionConsumed?: () => void;
};

export const PlaybookViewer = ({ skillFilter, onSkillFilterChange, initialSectionId, onInitialSectionConsumed }: PlaybookViewerProps) => {
  const { data: sections, isLoading: sectionsLoading, isRefetching } = usePlaybookSections();
  const { data: skillsFramework, isLoading: skillsLoading } = useSkills();
  const updateSection = useUpdateSection();
  const createEdit = useCreateStagedEdit();
  const toggleFulfilled = useToggleSkillFulfilled();

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [chatPanelOpen, setChatPanelOpen] = useState(true);
  const [chatPrefill, setChatPrefill] = useState<{ text: string; key: number } | undefined>();
  const chatPrefillCounter = useRef(0);

  const allSkills = useMemo(
    () => skillsFramework?.flatMap((c) => c.skills) ?? [],
    [skillsFramework]
  );

  type SectionSkill = import("@/lib/types").Skill & { sectionNote?: string };

  const getSkillsForSection = useMemo(() => {
    // Build a lookup from section ID → skills with section-specific coverage notes
    const map = new Map<string, SectionSkill[]>();
    if (sections) {
      const skillById = new Map(allSkills.map((s) => [s.id, s]));
      for (const section of sections) {
        const skills: SectionSkill[] = [];
        for (const link of section.skillsCovered) {
          const skill = skillById.get(link.skillId);
          if (skill) {
            skills.push({ ...skill, sectionNote: link.coverageNote ?? undefined });
          }
        }
        if (skills.length > 0) map.set(section.id, skills);
      }
    }
    return (sectionId: string) => map.get(sectionId) ?? [];
  }, [allSkills, sections]);

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
        if (section.skillsCovered.some((l) => l.skillId === skillFilter.skillId)) return true;
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
            section.skillsCovered.some((l) => siblingIds.has(l.skillId))
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

    // Apply status filter on top using junction-table links
    if (statusFilter) {
      filtered = filtered.filter((section) => {
        const linkedSkills = getSkillsForSection(section.id);
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

  // Memoize headings for all sections (used in tree nav)
  const headingsMap = useMemo(() => {
    const map = new Map<string, Heading[]>();
    for (const section of displaySections) {
      const headings = extractHeadings(section.content);
      if (headings.length > 0) map.set(section.id, headings);
    }
    return map;
  }, [displaySections]);

  // Build tree from flat sections
  const sectionTree = useMemo(() => buildSectionTree(displaySections), [displaySections]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectSection = useCallback((id: string) => {
    setActiveSection(id);
    setEditing(false);
    // Auto-expand when selecting
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Auto-select first section when filter changes or data loads
  useEffect(() => {
    if ((skillFilter || statusFilter) && displaySections.length > 0) {
      setActiveSection(displaySections[0].id);
      setEditing(false);
    }
  }, [skillFilter?.skillId, statusFilter, displaySections]);

  // Navigate to a specific section when triggered from outside (e.g. chat link)
  useEffect(() => {
    if (initialSectionId && sections?.some((s) => s.id === initialSectionId)) {
      setActiveSection(initialSectionId);
      setExpandedSections((prev) => new Set([...prev, initialSectionId]));
      setEditing(false);
      onInitialSectionConsumed?.();
    }
  }, [initialSectionId, sections]);

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
              <h2 className="text-sm text-foreground">Playbook Content</h2>
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
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-subheading transition-all ${
                      active
                        ? "bg-primary/10 ring-2 ring-primary/30"
                        : "bg-muted/50 hover:bg-muted/80"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-overline font-mono ${color}`}>{count}</span>
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

  const sectionSkills = getSkillsForSection(current.id);

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

    try {
      // Directly update the section content
      await updateSection.mutateAsync({ id: current.id, content: editDraft });
      // Record as auto-approved staged edit (full content for review)
      await createEdit.mutateAsync({
        sectionId: current.id,
        before: current.content,
        after: editDraft,
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
            <h2 className="text-sm text-foreground">Playbook Content</h2>
            {isRefetching && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
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
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-subheading transition-all ${
                    active
                      ? "bg-primary/10 ring-2 ring-primary/30"
                      : "bg-muted/50 hover:bg-muted/80"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-overline font-mono ${color}`}>{count}</span>
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
                <span className="text-[11px] font-caption text-primary">{skillFilter.skillName}</span>
                {filterMode === "unlinked" && (
                  <span className="text-[11px] text-muted-foreground">— consider adding a new section</span>
                )}
              </div>
              <button
                onClick={() => onSkillFilterChange(null)}
                className="flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 text-[10px] font-caption text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                <X className="w-2.5 h-2.5" />
                Clear
              </button>
            </div>
          )}
          <AnimatePresence mode="wait">
            {savedFlash && (
              <motion.span key="saved" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-[10px] text-success font-subheading">
                <CheckCircle2 className="w-3 h-3" />
                Saved — staged for review
              </motion.span>
            )}
          </AnimatePresence>
          <button
            onClick={() => setChatPanelOpen((v) => !v)}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-[11px] font-subheading text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
            title={chatPanelOpen ? "Hide chat panel" : "Show chat panel"}
          >
            {chatPanelOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Side: Playbook Navigation & Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-56 border-r border-border flex-shrink-0 flex flex-col">
            <SkillFilterCombobox
              skillFilter={skillFilter}
              skillsFramework={skillsFramework}
              allSkills={allSkills}
              onSkillFilterChange={onSkillFilterChange}
            />
            <div className="flex-1 overflow-y-auto py-1">
              {sectionTree.map((node) => (
                <SectionTreeItem
                  key={node.id}
                  node={node}
                  currentId={currentId}
                  expandedSections={expandedSections}
                  headingsMap={headingsMap}
                  getSkillsForSection={getSkillsForSection}
                  onSelect={selectSection}
                  onToggle={toggleExpanded}
                  level={0}
                />
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-lg text-foreground">{current.title.replace(/^\u00A0+/, "")}</h3>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono bg-muted rounded px-2 py-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {current.lastUpdated}
                </div>
                {!editing ? (
                  <button
                    onClick={startEditing}
                    className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-[11px] font-subheading text-secondary-foreground hover:bg-secondary/80 transition-colors ml-auto"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      onClick={cancelEditing}
                      className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-[11px] font-caption text-muted-foreground hover:bg-muted/80 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={updateSection.isPending}
                      className="flex items-center gap-1 rounded-lg gradient-primary px-2.5 py-1 text-[11px] font-caption text-primary-foreground transition-opacity disabled:opacity-50"
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
                    const showToggle = skill.status !== "covered";
                    const badge = (
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-subheading border ${
                        skill.fulfilled
                          ? "bg-muted/30 border-border/40 text-muted-foreground"
                          : `${cfg.bg} border-transparent`
                      } ${showToggle ? "cursor-help" : ""}`}>
                        <Icon className={`w-3 h-3 ${skill.fulfilled ? "text-muted-foreground" : cfg.color}`} />
                        <span className={skill.fulfilled ? "line-through" : ""}>{skill.name}</span>
                        {skill.fulfilled && <span className="text-[10px] text-muted-foreground italic">Dismissed</span>}
                      </span>
                    );
                    if (!showToggle) return <span key={skill.id}>{badge}</span>;
                    return (
                      <HoverCard key={skill.id} openDelay={300} closeDelay={200}>
                        <HoverCardTrigger asChild>{badge}</HoverCardTrigger>
                        <HoverCardContent side="bottom" className="w-auto max-w-xs p-2 text-xs">
                          <div className="flex flex-col gap-1.5">
                            {skill.sectionNote && <p className="text-muted-foreground">{skill.sectionNote}</p>}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFulfilled.mutate({ skillId: skill.id, fulfilled: !skill.fulfilled });
                              }}
                              className="text-[11px] font-subheading text-foreground hover:text-primary transition-colors text-left"
                            >
                              {skill.fulfilled ? "Undo" : "Dismiss"}
                            </button>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    );
                  })}
                  {(() => {
                    const gaps = sectionSkills.filter((s) => s.status !== "covered" && s.sectionNote);
                    if (gaps.length === 0) return null;
                    return (
                      <button
                        onClick={() => {
                          const lines = gaps.map((s) => `- **${s.name}** (${s.status}): ${s.sectionNote}`).join("\n");
                          const text = `Help me improve this section. Here are the skill gaps:\n\n${lines}`;
                          chatPrefillCounter.current += 1;
                          setChatPrefill({ text, key: chatPrefillCounter.current });
                          if (!chatPanelOpen) setChatPanelOpen(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-subheading text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                      >
                        <Sparkles className="w-3 h-3" />
                        Improve with AI
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>

            {editing ? (
              <MarkdownEditor markdown={editDraft} onChange={setEditDraft} />
            ) : (
              <Markdown>{current.content}</Markdown>
            )}
          </div>
        </div>

        {/* Right Side: Collapsible Chat Panel */}
        <AnimatePresence initial={false}>
          {chatPanelOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="flex-shrink-0 border-l border-border overflow-hidden"
            >
              <ChatEditor
                currentSection={current.title}
                sectionId={current.id}
                isEmbedded
                prefillMessage={chatPrefill?.text}
                prefillKey={chatPrefill?.key}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
