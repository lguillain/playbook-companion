import { useState, useRef, useEffect, useMemo } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, ExternalLink, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useConnections, useStartOAuth } from "@/hooks/use-connections";
import { useImports, useStartImport, useStartConfluenceImport, useStartNotionImport } from "@/hooks/use-import";
import { usePlaybookSections, useResetPlaybook, useRemoveSource } from "@/hooks/use-playbook-sections";
import { useConfluenceSpaces, useConfluencePages } from "@/hooks/use-confluence-browse";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

import type { ConnectionRow, ImportRow, ConfluencePageSummary } from "@/lib/types";
import { PROVIDER_LABELS } from "@/lib/types";

// ── Confluence page-tree helpers ─────────────────────────────────────

type PageNode = ConfluencePageSummary & { children: PageNode[]; depth: number };

function buildPageTree(pages: ConfluencePageSummary[]): PageNode[] {
  const idSet = new Set(pages.map((p) => p.id));
  const byParent = new Map<string | null, ConfluencePageSummary[]>();
  for (const p of pages) {
    const key = p.parentId && idSet.has(p.parentId) ? p.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(p);
    byParent.set(key, list);
  }
  function build(parentId: string | null, depth: number): PageNode[] {
    return (byParent.get(parentId) ?? []).map((p) => ({
      ...p, depth, children: build(p.id, depth + 1),
    }));
  }
  return build(null, 0);
}

function flattenTree(nodes: PageNode[]): PageNode[] {
  const result: PageNode[] = [];
  for (const n of nodes) { result.push(n); result.push(...flattenTree(n.children)); }
  return result;
}

function getDescendantIds(node: PageNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) { ids.push(child.id); ids.push(...getDescendantIds(child)); }
  return ids;
}

const providerMeta: Record<string, { name: string; icon: string }> = {
  confluence: { name: "Confluence", icon: "C" },
  notion: { name: "Notion", icon: "N" },
  pdf: { name: "PDF Upload", icon: "P" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export const IntegrationsPanel = () => {
  const { data: connections, isLoading: connectionsLoading } = useConnections();
  const { data: imports, isLoading: importsLoading } = useImports();
  const { data: sections } = usePlaybookSections();
  const startOAuth = useStartOAuth();
  const [importPhase, setImportPhase] = useState<"extracting" | "analyzing">("extracting");
  const [importing, setImporting] = useState(false);

  const startImport = useStartImport(setImportPhase);
  const notionImport = useStartNotionImport();
  const confluenceImport = useStartConfluenceImport();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetPlaybook = useResetPlaybook();
  const removeSource = useRemoveSource();

  const [uploading, setUploading] = useState(false);
  const [reimporting, setReimporting] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRemoveProvider, setConfirmRemoveProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Confluence page picker state
  const [confluencePicker, setConfluencePicker] = useState<null | "pick-space" | "pick-pages">(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const spacesQuery = useConfluenceSpaces(confluencePicker === "pick-space");
  const pagesQuery = useConfluencePages(confluencePicker === "pick-pages" ? selectedSpaceId : null);

  const pageTree = useMemo(() => buildPageTree(pagesQuery.data ?? []), [pagesQuery.data]);
  const flatPages = useMemo(() => flattenTree(pageTree), [pageTree]);
  const nodeById = useMemo(() => {
    const map = new Map<string, PageNode>();
    for (const n of flatPages) map.set(n.id, n);
    return map;
  }, [flatPages]);

  // Handle OAuth redirect: ?connected=confluence
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedProvider = params.get("connected");
    if (connectedProvider === "confluence") {
      window.history.replaceState({}, "", window.location.pathname);
      setConfluencePicker("pick-space");
    }
  }, []);

  const sectionCount = sections?.length ?? 0;
  const lastImport = imports?.[0] ?? null;

  // Compute active sources from loaded sections
  const activeSources = (() => {
    if (!sections || sections.length === 0) return [];
    const counts = new Map<string, number>();
    for (const s of sections) {
      counts.set(s.provider, (counts.get(s.provider) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([provider, count]) => ({
      provider,
      label: PROVIDER_LABELS[provider] ?? provider,
      count,
    }));
  })();

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    setImporting(true);
    setImportPhase("extracting");
    try {
      if (file.name.endsWith(".pdf")) {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), "")
        );
        await startImport.mutateAsync({ provider: "pdf", pdfBase64: base64 });
      } else {
        const text = await file.text();
        await startImport.mutateAsync({ provider: "pdf", content: text });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReimport = async (provider: string) => {
    setError(null);
    setReimporting(provider);
    try {
      if (provider === "notion") {
        await notionImport.mutateAsync();
      } else if (provider === "confluence") {
        // Re-import uses the same pages as last time (backend falls back to last import's pageIds)
        await confluenceImport.mutateAsync(undefined);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReimporting(null);
    }
  };

  const handleSpaceSelect = (spaceId: string) => {
    setSelectedSpaceId(spaceId);
    setSelectedPageIds(new Set());
    setExpandedIds(new Set());
    setConfluencePicker("pick-pages");
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

  const handleConfluenceImport = async () => {
    setError(null);
    setConfluencePicker(null);
    setReimporting("confluence");
    try {
      await confluenceImport.mutateAsync([...selectedPageIds]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReimporting(null);
    }
  };

  const handleConnect = async (provider: "notion" | "confluence") => {
    setError(null);
    try {
      await startOAuth(provider);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const connectedProviders = new Set((connections ?? []).map((c: ConnectionRow) => c.provider));

  return (
    <div className="max-w-2xl space-y-6">
      <AnimatePresence>
        {importing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-card text-center">
              <Loader2 className="w-10 h-10 text-primary mx-auto mb-4 animate-spin" />
              <h2 className="text-xl text-foreground mb-2">
                {importPhase === "extracting" ? "Extracting content" : "Analyzing your playbook"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {importPhase === "extracting"
                  ? "Reading and converting your document to structured content…"
                  : "Mapping sections to skills framework…"}
              </p>
              <div className="mt-6 space-y-2">
                <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
                  {importPhase === "extracting" ? (
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 text-success" />
                  )}
                  Extracting content
                </div>
                <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
                  {importPhase === "analyzing" ? (
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  ) : (
                    <span className="w-3 h-3 rounded-full border border-muted-foreground/30" />
                  )}
                  Mapping skills
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">This can take up to 5 minutes</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confluence space / page picker modal */}
      <AnimatePresence>
        {confluencePicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-card">
              {confluencePicker === "pick-space" && (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-xl text-foreground">Select a space</h2>
                    <button onClick={() => setConfluencePicker(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                  </div>
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
                            <span className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-overline text-primary uppercase">
                              {space.key.slice(0, 2)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-subheading text-foreground truncate">{space.name}</div>
                              <div className="text-xs text-muted-foreground">{space.key}</div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {confluencePicker === "pick-pages" && (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <button
                      onClick={() => { setConfluencePicker("pick-space"); setSelectedSpaceId(null); setSelectedPageIds(new Set()); }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="w-3 h-3" /> Back
                    </button>
                    <button onClick={() => setConfluencePicker(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                  </div>

                  <h2 className="text-xl text-foreground mb-1 mt-3">Select pages</h2>
                  <p className="text-sm text-muted-foreground mb-4">Choose which pages to import. Unpublished edits on existing Confluence sections will be lost.</p>

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
                          <ConfluencePageNodes
                            nodes={pageTree}
                            selectedPageIds={selectedPageIds}
                            expandedIds={expandedIds}
                            onTogglePage={togglePage}
                            onToggleExpand={toggleExpand}
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleConfluenceImport}
                        disabled={selectedPageIds.size === 0}
                        className="w-full flex items-center justify-center gap-2 rounded-xl gradient-primary py-3 text-sm font-subheading text-primary-foreground disabled:opacity-30 transition-opacity"
                      >
                        Import {selectedPageIds.size} {selectedPageIds.size === 1 ? "page" : "pages"}
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {pagesQuery.data && pagesQuery.data.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">No pages found in this space.</p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <h2 className="text-lg text-foreground">Integrations</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Importing from a new source adds to your playbook without affecting other sources.
          {sectionCount > 0 && (
            <span className="text-foreground font-subheading"> {sectionCount} sections currently loaded.</span>
          )}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md"
        className="hidden"
        onChange={handlePdfUpload}
      />

      {/* Source cards */}
      <div className="space-y-3">
        {/* Confluence */}
        <SourceCard
          provider="confluence"
          connected={connectedProviders.has("confluence")}
          loading={connectionsLoading}
          reimporting={reimporting === "confluence"}
          onConnect={() => handleConnect("confluence")}
          onReimport={() => handleReimport("confluence")}
        />

        {/* Notion */}
        <SourceCard
          provider="notion"
          connected={connectedProviders.has("notion")}
          loading={connectionsLoading}
          reimporting={reimporting === "notion"}
          onConnect={() => handleConnect("notion")}
          onReimport={() => handleReimport("notion")}
        />

        {/* PDF upload */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
          <span className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-overline text-primary shrink-0">
            P
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-foreground">PDF / Text Upload</div>
            <div className="text-xs text-muted-foreground">Upload a .pdf, .txt, or .md file</div>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-subheading transition-colors gradient-primary text-primary-foreground disabled:opacity-50"
          >
            {uploading ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
            ) : (
              <><Upload className="w-3.5 h-3.5" /> Upload</>
            )}
          </button>
        </div>
      </div>

      {/* Active sources */}
      {activeSources.length > 0 && (
        <div>
          <h3 className="text-sm text-foreground mb-3">Active sources</h3>
          <div className="space-y-2">
            {activeSources.map((src) => {
              const meta = providerMeta[src.provider] ?? { name: src.provider, icon: "?" };
              const isConfirming = confirmRemoveProvider === src.provider;
              return (
                <div key={src.provider} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
                  <span className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-[11px] font-overline text-primary shrink-0">
                    {meta.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-subheading text-foreground">{src.label}</span>
                    <span className="text-xs text-muted-foreground ml-1.5">
                      &middot; {src.count} section{src.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {isConfirming ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setConfirmRemoveProvider(null)}
                        className="rounded-lg px-2 py-1 text-[11px] font-subheading bg-muted hover:bg-muted/80 text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          setError(null);
                          try {
                            await removeSource.mutateAsync(src.provider);
                            setConfirmRemoveProvider(null);
                          } catch (err) {
                            setError((err as Error).message);
                          }
                        }}
                        disabled={removeSource.isPending}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-subheading bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                      >
                        {removeSource.isPending ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Removing...</>
                        ) : (
                          <><Trash2 className="w-3 h-3" /> Confirm</>
                        )}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemoveProvider(src.provider)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-subheading text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Import history */}
      {!importsLoading && imports && imports.length > 0 && (
        <div>
          <h3 className="text-sm text-foreground mb-3">Import history</h3>
          <div className="space-y-2">
            {imports.slice(0, 5).map((imp: ImportRow) => {
              const meta = providerMeta[imp.provider] ?? { name: imp.provider, icon: "?" };
              return (
                <div key={imp.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
                  <span className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-[11px] font-overline text-primary shrink-0">
                    {meta.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-subheading text-foreground">{meta.name}</span>
                    {imp.metadata && (imp.metadata as Record<string, unknown>).sections_created != null && (
                      <span className="text-xs text-muted-foreground ml-1.5">
                        &middot; {String((imp.metadata as Record<string, unknown>).sections_created)} sections
                      </span>
                    )}
                  </div>
                  <span className={`text-[11px] font-subheading ${
                    imp.status === "completed" ? "text-success" :
                    imp.status === "failed" ? "text-destructive" :
                    "text-muted-foreground"
                  }`}>
                    {imp.status === "completed" ? "Completed" :
                     imp.status === "failed" ? "Failed" :
                     imp.status === "processing" ? "Processing..." :
                     "Pending"}
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {timeAgo(imp.started_at)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Restart / wipe */}
      {sectionCount > 0 && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm text-foreground">Start over</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Wipe all playbook sections, staged edits, chat history, and connections.
              </p>
            </div>
            {confirmReset ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setConfirmReset(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-subheading bg-muted hover:bg-muted/80 text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setError(null);
                    try {
                      await resetPlaybook.mutateAsync();
                      setConfirmReset(false);
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                  disabled={resetPlaybook.isPending}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-subheading bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {resetPlaybook.isPending ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Wiping...</>
                  ) : (
                    <><Trash2 className="w-3.5 h-3.5" /> Confirm wipe</>
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-subheading bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" /> Restart
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function SourceCard({
  provider,
  connected,
  loading,
  reimporting,
  onConnect,
  onReimport,
}: {
  provider: string;
  connected: boolean;
  loading: boolean;
  reimporting: boolean;
  onConnect: () => void;
  onReimport: () => void;
}) {
  const meta = providerMeta[provider] ?? { name: provider, icon: "?" };

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
      <span className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-overline text-primary shrink-0">
        {meta.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">{meta.name}</span>
          {connected && (
            <span className="flex items-center gap-1 text-[11px] text-success font-subheading">
              <CheckCircle2 className="w-3 h-3" /> Connected
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {connected ? `Re-import to refresh ${meta.name} sections. Unpublished edits on those sections will be lost.` : `Connect your ${meta.name} workspace`}
        </div>
      </div>
      {loading ? (
        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
      ) : connected ? (
        <button
          onClick={onReimport}
          disabled={reimporting}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-subheading transition-colors bg-muted hover:bg-muted/80 text-foreground disabled:opacity-50"
        >
          {reimporting ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing...</>
          ) : (
            <><RefreshCw className="w-3.5 h-3.5" /> Re-import</>
          )}
        </button>
      ) : (
        <button
          onClick={onConnect}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-subheading transition-colors gradient-primary text-primary-foreground"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Connect
        </button>
      )}
    </div>
  );
}

function ConfluencePageNodes({
  nodes,
  selectedPageIds,
  expandedIds,
  onTogglePage,
  onToggleExpand,
}: {
  nodes: PageNode[];
  selectedPageIds: Set<string>;
  expandedIds: Set<string>;
  onTogglePage: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
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
                  onClick={() => onToggleExpand(node.id)}
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
                  onCheckedChange={() => onTogglePage(node.id)}
                />
                <span className="text-sm text-foreground truncate">{node.title}</span>
                {hasChildren && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {node.children.length}
                  </span>
                )}
              </label>
            </div>
            {hasChildren && isExpanded && (
              <ConfluencePageNodes
                nodes={node.children}
                selectedPageIds={selectedPageIds}
                expandedIds={expandedIds}
                onTogglePage={onTogglePage}
                onToggleExpand={onToggleExpand}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
