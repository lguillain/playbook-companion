import { useState, useRef } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { useConnections, useStartOAuth } from "@/hooks/use-connections";
import { useImports, useStartImport, useStartConfluenceImport, useStartNotionImport } from "@/hooks/use-import";
import { usePlaybookSections, useResetPlaybook } from "@/hooks/use-playbook-sections";
import { readFileAsBase64 } from "@/lib/pdf";
import type { ConnectionRow, ImportRow } from "@/lib/types";

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
  const startImport = useStartImport();
  const notionImport = useStartNotionImport();
  const confluenceImport = useStartConfluenceImport();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetPlaybook = useResetPlaybook();

  const [uploading, setUploading] = useState(false);
  const [reimporting, setReimporting] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sectionCount = sections?.length ?? 0;
  const lastImport = imports?.[0] ?? null;

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      if (file.name.endsWith(".pdf")) {
        const { base64, mediaType } = await readFileAsBase64(file);
        await startImport.mutateAsync({ provider: "pdf", pdfBase64: base64, mediaType });
      } else {
        const text = await file.text();
        await startImport.mutateAsync({ provider: "pdf", content: text });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
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
        await confluenceImport.mutateAsync(undefined);
      }
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
      <div>
        <h2 className="text-lg font-bold text-foreground">Integrations</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect a source or upload a file to import your playbook.
          {sectionCount > 0 && (
            <span className="text-foreground font-medium"> {sectionCount} sections currently loaded.</span>
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
          <span className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
            P
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground">PDF / Text Upload</div>
            <div className="text-xs text-muted-foreground">Upload a .pdf, .txt, or .md file</div>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors gradient-primary text-primary-foreground disabled:opacity-50"
          >
            {uploading ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
            ) : (
              <><Upload className="w-3.5 h-3.5" /> Upload</>
            )}
          </button>
        </div>
      </div>

      {/* Import history */}
      {!importsLoading && imports && imports.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Import history</h3>
          <div className="space-y-2">
            {imports.slice(0, 5).map((imp: ImportRow) => {
              const meta = providerMeta[imp.provider] ?? { name: imp.provider, icon: "?" };
              return (
                <div key={imp.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
                  <span className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                    {meta.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-foreground">{meta.name}</span>
                    {imp.metadata && (imp.metadata as Record<string, unknown>).sections_created != null && (
                      <span className="text-xs text-muted-foreground ml-1.5">
                        &middot; {String((imp.metadata as Record<string, unknown>).sections_created)} sections
                      </span>
                    )}
                  </div>
                  <span className={`text-[11px] font-medium ${
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
              <h3 className="text-sm font-semibold text-foreground">Start over</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Wipe all playbook sections, staged edits, chat history, and connections.
              </p>
            </div>
            {confirmReset ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setConfirmReset(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors"
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
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
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
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors shrink-0"
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
      <span className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
        {meta.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{meta.name}</span>
          {connected && (
            <span className="flex items-center gap-1 text-[11px] text-success font-medium">
              <CheckCircle2 className="w-3 h-3" /> Connected
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {connected ? "Re-import to refresh your playbook content" : `Connect your ${meta.name} workspace`}
        </div>
      </div>
      {loading ? (
        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
      ) : connected ? (
        <button
          onClick={onReimport}
          disabled={reimporting}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors bg-muted hover:bg-muted/80 text-foreground disabled:opacity-50"
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
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors gradient-primary text-primary-foreground"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Connect
        </button>
      )}
    </div>
  );
}
