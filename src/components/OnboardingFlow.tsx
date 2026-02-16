import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Loader2, Upload, AlertCircle } from "lucide-react";
import { useHealthScore } from "@/hooks/use-health-score";
import { useStartOAuth } from "@/hooks/use-connections";
import { useStartImport, useStartNotionImport, useStartConfluenceImport } from "@/hooks/use-import";
import { useConfluenceSpaces, useConfluencePages } from "@/hooks/use-confluence-browse";
import { readFileAsBase64 } from "@/lib/pdf";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConfluencePageSummary } from "@/lib/types";

type PageNode = ConfluencePageSummary & { children: PageNode[]; depth: number };

function buildPageTree(pages: ConfluencePageSummary[]): PageNode[] {
  const idSet = new Set(pages.map((p) => p.id));
  const byParent = new Map<string | null, ConfluencePageSummary[]>();
  for (const p of pages) {
    // If parentId points outside this space's page list, treat as root
    const key = p.parentId && idSet.has(p.parentId) ? p.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(p);
    byParent.set(key, list);
  }

  function build(parentId: string | null, depth: number): PageNode[] {
    return (byParent.get(parentId) ?? []).map((p) => ({
      ...p,
      depth,
      children: build(p.id, depth + 1),
    }));
  }

  return build(null, 0);
}

function flattenTree(nodes: PageNode[]): PageNode[] {
  const result: PageNode[] = [];
  for (const n of nodes) {
    result.push(n);
    result.push(...flattenTree(n.children));
  }
  return result;
}

function getDescendantIds(node: PageNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.id);
    ids.push(...getDescendantIds(child));
  }
  return ids;
}

const sources = [
  { id: "notion", name: "Notion", icon: "N", desc: "Connect your Notion workspace", isOAuth: true },
  { id: "confluence", name: "Confluence", icon: "C", desc: "Link your Confluence space", isOAuth: true },
  { id: "pdf", name: "PDF Upload", icon: "P", desc: "Upload a playbook PDF", isOAuth: false },
];

type Step = "source" | "pick-space" | "pick-pages" | "analyzing" | "done";

export const OnboardingFlow = ({ onComplete }: { onComplete: () => void }) => {
  const { data: health } = useHealthScore();
  const gapCount = health ? health.missing + health.partial : 0;
  const startOAuth = useStartOAuth();
  const startImport = useStartImport();
  const notionImport = useStartNotionImport();
  const confluenceImport = useStartConfluenceImport();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("source");
  const [selected, setSelected] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Confluence picker state
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const spacesQuery = useConfluenceSpaces(step === "pick-space");
  const pagesQuery = useConfluencePages(step === "pick-pages" ? selectedSpaceId : null);

  const pageTree = useMemo(() => buildPageTree(pagesQuery.data ?? []), [pagesQuery.data]);
  const flatPages = useMemo(() => flattenTree(pageTree), [pageTree]);
  const nodeById = useMemo(() => {
    const map = new Map<string, PageNode>();
    for (const n of flatPages) map.set(n.id, n);
    return map;
  }, [flatPages]);

  // Handle OAuth redirect: detect ?connected=notion|confluence in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedProvider = params.get("connected");
    const oauthError = params.get("error");

    // Clean up the URL query params
    if (connectedProvider || oauthError) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (oauthError) {
      setImportError(`OAuth failed: ${oauthError.replace(/_/g, " ")}`);
      return;
    }

    if (connectedProvider === "notion") {
      // OAuth succeeded — kick off the Notion import automatically
      setStep("analyzing");
      notionImport.mutate(undefined, {
        onSuccess: () => setStep("done"),
        onError: (err) => {
          setImportError(err.message);
          setStep("source");
        },
      });
    }

    if (connectedProvider === "confluence") {
      // OAuth succeeded — go to space picker instead of importing immediately
      setStep("pick-space");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    if (!selected) return;
    setImportError(null);

    const source = sources.find((s) => s.id === selected);
    if (!source) return;

    if (source.isOAuth) {
      try {
        await startOAuth(selected as "notion" | "confluence");
        // This will redirect the browser — won't reach here
      } catch (err) {
        setImportError(
          `Could not start ${source.name} OAuth. Make sure the edge functions are running (supabase functions serve).`
        );
      }
    } else if (selected === "pdf") {
      fileInputRef.current?.click();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep("analyzing");

    try {
      if (file.name.endsWith(".pdf")) {
        const { base64, mediaType } = await readFileAsBase64(file);
        await startImport.mutateAsync({ provider: "pdf", pdfBase64: base64, mediaType });
      } else {
        const text = await file.text();
        await startImport.mutateAsync({ provider: "pdf", content: text });
      }
      setStep("done");
    } catch (err) {
      setImportError((err as Error).message);
      setStep("source");
    }
  };

  const handleSpaceSelect = (spaceId: string) => {
    setSelectedSpaceId(spaceId);
    setSelectedPageIds(new Set());
    setExpandedIds(new Set());
    setStep("pick-pages");
  };

  const togglePage = (pageId: string) => {
    const node = nodeById.get(pageId);
    if (!node) return;
    const descendants = getDescendantIds(node);
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
        for (const id of descendants) next.delete(id);
      } else {
        next.add(pageId);
        for (const id of descendants) next.add(id);
      }
      return next;
    });
  };

  const toggleExpand = (pageId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pages = pagesQuery.data ?? [];
    if (selectedPageIds.size === pages.length) {
      setSelectedPageIds(new Set());
    } else {
      setSelectedPageIds(new Set(pages.map((p) => p.id)));
    }
  };

  const renderPageNodes = (nodes: PageNode[]): React.ReactNode =>
    nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isExpanded = expandedIds.has(node.id);

      return (
        <div key={node.id}>
          <div
            className="flex items-center gap-2 rounded-lg py-2 hover:bg-muted/50 transition-colors"
            style={{ paddingLeft: `${node.depth * 20 + 12}px`, paddingRight: 12 }}
          >
            {hasChildren ? (
              <button
                onClick={() => toggleExpand(node.id)}
                className="w-5 h-5 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
              </button>
            ) : (
              <span className="w-5" />
            )}
            <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
              <Checkbox
                checked={selectedPageIds.has(node.id)}
                onCheckedChange={() => togglePage(node.id)}
              />
              <span className="text-sm text-foreground truncate">{node.title}</span>
              {hasChildren && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {node.children.length}
                </span>
              )}
            </label>
          </div>
          {hasChildren && isExpanded && renderPageNodes(node.children)}
        </div>
      );
    });

  const handleConfluenceImport = () => {
    setImportError(null);
    setStep("analyzing");
    confluenceImport.mutate([...selectedPageIds], {
      onSuccess: () => setStep("done"),
      onError: (err) => {
        setImportError(err.message);
        setStep("pick-pages");
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-card"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md"
          className="hidden"
          onChange={handleFileUpload}
        />

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
                    <span className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">{src.icon}</span>
                    <div className="text-left">
                      <div className="text-sm font-semibold text-foreground">{src.name}</div>
                      <div className="text-xs text-muted-foreground">{src.desc}</div>
                    </div>
                    {selected === src.id && <CheckCircle2 className="w-5 h-5 text-primary ml-auto" />}
                  </button>
                ))}
              </div>

              {importError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-3">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-destructive">{importError}</p>
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={!selected}
                className="w-full flex items-center justify-center gap-2 rounded-xl gradient-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-30 transition-opacity"
              >
                {selected === "pdf" ? (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload & Analyze
                  </>
                ) : (
                  <>
                    Connect & Analyze
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </motion.div>
          )}

          {step === "pick-space" && (
            <motion.div key="pick-space" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button
                onClick={() => setStep("source")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                Back
              </button>

              <h2 className="text-2xl font-bold text-foreground mb-1">Select a space</h2>
              <p className="text-sm text-muted-foreground mb-6">Choose the Confluence space that contains your playbook</p>

              {spacesQuery.isLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              )}

              {spacesQuery.error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-destructive">{(spacesQuery.error as Error).message}</p>
                </div>
              )}

              {spacesQuery.data && (
                <div className="max-h-72 overflow-y-auto pr-1">
                  <div className="space-y-2">
                    {spacesQuery.data.map((space) => (
                      <button
                        key={space.id}
                        onClick={() => handleSpaceSelect(space.id)}
                        className="w-full flex items-center gap-4 rounded-xl p-4 border border-border bg-muted/30 hover:border-muted-foreground/30 transition-all text-left"
                      >
                        <span className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary uppercase">
                          {space.key.slice(0, 2)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-foreground truncate">{space.name}</div>
                          <div className="text-xs text-muted-foreground">{space.key}</div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {step === "pick-pages" && (
            <motion.div key="pick-pages" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button
                onClick={() => {
                  setStep("pick-space");
                  setSelectedSpaceId(null);
                  setSelectedPageIds(new Set());
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                Back
              </button>

              <h2 className="text-2xl font-bold text-foreground mb-1">Select pages</h2>
              <p className="text-sm text-muted-foreground mb-4">Choose which pages contain your sales playbook</p>

              {pagesQuery.isLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              )}

              {pagesQuery.error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-3">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-destructive">{(pagesQuery.error as Error).message}</p>
                </div>
              )}

              {importError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-3">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-destructive">{importError}</p>
                </div>
              )}

              {pagesQuery.data && pagesQuery.data.length > 0 && (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <Checkbox
                      checked={selectedPageIds.size === pagesQuery.data.length}
                      onCheckedChange={toggleSelectAll}
                    />
                    <span className="text-xs text-muted-foreground">
                      Select all ({pagesQuery.data.length} pages)
                    </span>
                  </div>

                  <div className="max-h-60 overflow-y-auto pr-1 mb-4">
                    <div className="space-y-0.5">
                      {renderPageNodes(pageTree)}
                    </div>
                  </div>

                  <button
                    onClick={handleConfluenceImport}
                    disabled={selectedPageIds.size === 0}
                    className="w-full flex items-center justify-center gap-2 rounded-xl gradient-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-30 transition-opacity"
                  >
                    Import {selectedPageIds.size} {selectedPageIds.size === 1 ? "page" : "pages"}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}

              {pagesQuery.data && pagesQuery.data.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No pages found in this space.</p>
              )}
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
