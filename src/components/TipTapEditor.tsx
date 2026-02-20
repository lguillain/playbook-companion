import { useEffect, useCallback } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { tiptapToMarkdown } from "@/lib/tiptap-serialize";

type TipTapEditorProps = {
  markdown: string;
  onChange: (md: string) => void;
  /** Called with TipTap JSON on every change (for JSON storage) */
  onJsonChange?: (json: Record<string, unknown>) => void;
  /** Called once after editor initializes with the normalized markdown baseline.
   *  Use this as the "before" for diffs to avoid phantom character changes. */
  onReady?: (normalizedMarkdown: string) => void;
};

/**
 * Get markdown from the editor, falling back to our custom serializer
 * when the npm tiptap-markdown package outputs `[table]` placeholders.
 */
function getMarkdown(editor: Editor): string {
  const md: string = editor.storage.markdown.getMarkdown();
  if (md.includes("[table]")) {
    return tiptapToMarkdown(editor.getJSON());
  }
  return md;
}

export const TipTapEditor = ({ markdown, onChange, onJsonChange, onReady }: TipTapEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: { HTMLAttributes: { class: "tiptap-code-block" } },
      }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "tiptap-link" } }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({ placeholder: "Start writing..." }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: markdown,
    onCreate: ({ editor }) => {
      // Capture the normalized markdown baseline after TipTap parses the input.
      // This ensures both "before" and "after" go through the same serializer,
      // preventing phantom diffs on special characters (→, —, "", etc.).
      onReady?.(getMarkdown(editor));
    },
    onUpdate: ({ editor }) => {
      onChange(getMarkdown(editor));
      onJsonChange?.(editor.getJSON() as Record<string, unknown>);
    },
    editorProps: {
      attributes: {
        class: "tiptap-editor-content",
      },
    },
  });

  // Sync external markdown changes (e.g. parent resets content)
  useEffect(() => {
    if (!editor) return;
    const current = getMarkdown(editor);
    if (current !== markdown) {
      editor.commands.setContent(markdown);
    }
  }, [markdown, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href;
    const url = window.prompt("URL", prev);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-muted/50 border-b border-border flex-wrap">
        <ToolbarBtn
          label="Bold"
          shortcut="B"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarBtn
          label="Italic"
          shortcut="I"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarBtn
          label="Code"
          shortcut="E"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
        <ToolbarBtn
          label="Link"
          shortcut="K"
          active={editor.isActive("link")}
          onClick={setLink}
        />
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarBtn
          label="H2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarBtn
          label="H3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        />
        <ToolbarBtn
          label="List"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarBtn
          label="1. List"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarBtn
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  );
};

function ToolbarBtn({
  label,
  shortcut,
  active,
  onClick,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={shortcut ? `${label} (Cmd+${shortcut})` : label}
      className={`px-2 py-1 text-[11px] font-caption rounded transition-colors ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}
