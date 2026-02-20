import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Markdown } from "tiptap-markdown";
import { slugify } from "@/lib/extract-headings";

type TipTapViewerProps = {
  /** Markdown string content (used when contentJson is not provided) */
  content: string;
  /** TipTap JSON content (preferred when available) */
  contentJson?: Record<string, unknown> | null;
  className?: string;
};

export const TipTapViewer = ({ content, contentJson, className = "" }: TipTapViewerProps) => {
  // Track the effective content to detect changes
  const contentRef = useRef({ content, contentJson });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: { HTMLAttributes: { class: "tiptap-code-block" } },
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          class: "tiptap-link",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Markdown.configure({ html: false }),
    ],
    // Initialize with JSON if available, otherwise markdown string
    content: contentJson ?? content,
    editable: false,
    editorProps: {
      attributes: {
        class: "tiptap-viewer-content",
      },
    },
  });

  // Sync when content props change
  useEffect(() => {
    if (!editor) return;
    const prev = contentRef.current;
    if (prev.content === content && prev.contentJson === contentJson) return;
    contentRef.current = { content, contentJson };

    if (contentJson) {
      editor.commands.setContent(contentJson);
    } else {
      editor.commands.setContent(content);
    }
  }, [content, contentJson, editor]);

  // Add id attributes to headings for in-page navigation (matching extract-headings slugify)
  useEffect(() => {
    if (!editor) return;
    const el = editor.options.element;
    const headings = el.querySelectorAll("h1, h2, h3, h4, h5, h6");
    const slugCounts = new Map<string, number>();
    headings.forEach((heading) => {
      const text = (heading.textContent ?? "").replace(/\*\*/g, "").replace(/`/g, "").trim();
      let slug = slugify(text);
      const count = slugCounts.get(slug) ?? 0;
      slugCounts.set(slug, count + 1);
      if (count > 0) slug = `${slug}-${count + 1}`;
      heading.id = slug;
    });
  }, [editor, content, contentJson]);

  if (!editor) return null;

  return (
    <div className={`text-sm leading-relaxed ${className}`}>
      <EditorContent editor={editor} />
    </div>
  );
};
