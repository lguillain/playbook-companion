import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownProps = {
  children: string;
  className?: string;
};

/** Extract plain text from React children so we can generate a slug. */
function childrenToText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!isValidElement(node)) return "";
  return Children.toArray((node.props as { children?: ReactNode }).children)
    .map(childrenToText)
    .join("");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export const Markdown = ({ children, className = "" }: MarkdownProps) => {
  // Track slug counts for deduplication within a single render
  const slugCounts = new Map<string, number>();
  function uniqueSlug(text: string): string {
    let slug = slugify(text);
    const count = slugCounts.get(slug) ?? 0;
    slugCounts.set(slug, count + 1);
    if (count > 0) slug = `${slug}-${count + 1}`;
    return slug;
  }

  return (
    <div className={`text-sm leading-relaxed ${className}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => {
          const id = uniqueSlug(childrenToText(children));
          return <h1 id={id} className="text-lg text-foreground mt-5 mb-2">{children}</h1>;
        },
        h2: ({ children }) => {
          const id = uniqueSlug(childrenToText(children));
          return <h2 id={id} className="text-base text-foreground mt-4 mb-2">{children}</h2>;
        },
        h3: ({ children }) => {
          const id = uniqueSlug(childrenToText(children));
          return <h3 id={id} className="text-sm text-foreground mt-3 mb-1.5">{children}</h3>;
        },
        h4: ({ children }) => {
          const id = uniqueSlug(childrenToText(children));
          return <h4 id={id} className="text-sm text-foreground mt-2 mb-1">{children}</h4>;
        },
        p: ({ children }) => (
          <p className="text-sm text-secondary-foreground leading-relaxed mb-2">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="list-disc ml-4 mb-2 space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal ml-4 mb-2 space-y-0.5">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-sm text-secondary-foreground">{children}</li>
        ),
        strong: ({ children }) => (
          <strong className="font-subheading text-foreground">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary pl-3 text-sm text-muted-foreground italic my-2">
            {children}
          </blockquote>
        ),
        code: ({ children }) => (
          <code className="rounded bg-muted/50 px-1.5 py-0.5 text-xs font-mono text-foreground">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="rounded-lg bg-muted/50 border border-border p-3 my-2 overflow-x-auto text-xs font-mono text-foreground">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-3 rounded-lg border border-border">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted/50">{children}</thead>
        ),
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr className="border-b border-border/50 last:border-b-0">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="text-left px-3 py-2 font-subheading text-foreground border-b border-border">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-secondary-foreground">{children}</td>
        ),
        hr: () => <hr className="border-border my-4" />,
        a: ({ href, children }) => {
          const safeHref = href && /^javascript:/i.test(href) ? undefined : href;
          return (
            <a href={safeHref} className="text-primary underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
      }}
    >
      {children}
    </ReactMarkdown>
    </div>
  );
};
