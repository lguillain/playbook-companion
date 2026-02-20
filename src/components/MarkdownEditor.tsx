import { useRef, useCallback, type KeyboardEvent } from "react";

type MarkdownEditorProps = {
  markdown: string;
  onChange: (md: string) => void;
};

/** Insert `before` + `after` around the current selection (or at cursor). */
function wrapSelection(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  onChange: (v: string) => void,
) {
  const { selectionStart: s, selectionEnd: e, value } = textarea;
  const selected = value.slice(s, e);
  const replacement = `${before}${selected}${after}`;
  const next = value.slice(0, s) + replacement + value.slice(e);
  onChange(next);
  // Restore cursor inside the wrapper
  requestAnimationFrame(() => {
    textarea.selectionStart = s + before.length;
    textarea.selectionEnd = s + before.length + selected.length;
    textarea.focus();
  });
}

/** Insert text at the start of each selected line. */
function prefixLines(
  textarea: HTMLTextAreaElement,
  prefix: string,
  onChange: (v: string) => void,
) {
  const { selectionStart: s, selectionEnd: e, value } = textarea;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  const lineEnd = value.indexOf("\n", e);
  const block = value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  const prefixed = block
    .split("\n")
    .map((l) => `${prefix}${l}`)
    .join("\n");
  const next = value.slice(0, lineStart) + prefixed + (lineEnd === -1 ? "" : value.slice(lineEnd));
  onChange(next);
}

export const MarkdownEditor = ({ markdown, onChange }: MarkdownEditorProps) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = ref.current;
      if (!ta) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "b") {
        e.preventDefault();
        wrapSelection(ta, "**", "**", onChange);
      } else if (e.key === "i") {
        e.preventDefault();
        wrapSelection(ta, "_", "_", onChange);
      } else if (e.key === "k") {
        e.preventDefault();
        const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        wrapSelection(ta, "[", `](${sel ? "" : "url"})`, onChange);
      } else if (e.key === "e") {
        e.preventDefault();
        wrapSelection(ta, "`", "`", onChange);
      } else if (e.shiftKey && e.key === "8") {
        e.preventDefault();
        prefixLines(ta, "- ", onChange);
      }
    },
    [onChange],
  );

  /** Handle Tab for indentation instead of focus change. */
  const handleTab = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      const ta = ref.current;
      if (!ta) return;
      const { selectionStart: s, selectionEnd: end, value } = ta;
      const next = value.slice(0, s) + "  " + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + 2;
        ta.focus();
      });
    },
    [onChange],
  );

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-1 px-3 py-1.5 bg-muted/50 border-b border-border">
        <ToolbarBtn label="Bold" shortcut="B" onClick={() => ref.current && wrapSelection(ref.current, "**", "**", onChange)} />
        <ToolbarBtn label="Italic" shortcut="I" onClick={() => ref.current && wrapSelection(ref.current, "_", "_", onChange)} />
        <ToolbarBtn label="Code" shortcut="E" onClick={() => ref.current && wrapSelection(ref.current, "`", "`", onChange)} />
        <ToolbarBtn label="Link" shortcut="K" onClick={() => ref.current && wrapSelection(ref.current, "[", "](url)", onChange)} />
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarBtn label="H2" onClick={() => ref.current && prefixLines(ref.current, "## ", onChange)} />
        <ToolbarBtn label="H3" onClick={() => ref.current && prefixLines(ref.current, "### ", onChange)} />
        <ToolbarBtn label="List" onClick={() => ref.current && prefixLines(ref.current, "- ", onChange)} />
      </div>
      <textarea
        ref={ref}
        value={markdown}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { handleKey(e); handleTab(e); }}
        className="w-full min-h-[300px] bg-card p-4 text-sm text-foreground font-mono leading-relaxed resize-y outline-none focus:ring-2 focus:ring-primary/30 transition-all"
        spellCheck
      />
    </div>
  );
};

function ToolbarBtn({ label, shortcut, onClick }: { label: string; shortcut?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={shortcut ? `${label} (Cmd+${shortcut})` : label}
      className="px-2 py-1 text-[11px] font-caption text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
    >
      {label}
    </button>
  );
}
