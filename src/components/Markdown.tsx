import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownProps = {
  children: string;
  className?: string;
};

export const Markdown = ({ children, className = "" }: MarkdownProps) => {
  return (
    <div className={`text-sm leading-relaxed ${className}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-lg font-bold text-foreground mt-5 mb-2">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold text-foreground mt-4 mb-2">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold text-foreground mt-3 mb-1.5">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-sm font-semibold text-foreground mt-2 mb-1">{children}</h4>
        ),
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
          <strong className="font-semibold text-foreground">{children}</strong>
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
          <th className="text-left px-3 py-2 font-semibold text-foreground border-b border-border">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-secondary-foreground">{children}</td>
        ),
        hr: () => <hr className="border-border my-4" />,
        a: ({ href, children }) => (
          <a href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
    </div>
  );
};
