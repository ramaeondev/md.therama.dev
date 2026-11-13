import { useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownPreviewProps = { content: string };
type Heading = { id: string; text: string; level: number };

export function getMarkdownHeadings(content: string): Heading[] {
  return content
    .split("\n")
    .flatMap((line) => {
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (!match) return [];
      const hashes = match[1] ?? "#";
      const text = (match[2] ?? "").replace(/[`*_~]/g, "");
      return [{ id: slugify(text), text, level: hashes.length }];
    });
}

function slugify(text: string) {
  return text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-");
}

function MermaidBlock({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const current = ref.current;
    if (!current) return;
    void import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "dark" });
      const id = `mermaid-${crypto.randomUUID()}`;
      try {
        const { svg } = await mermaid.render(id, source);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        if (!cancelled && ref.current) {
          ref.current.textContent = "Diagram could not be rendered.";
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  return <div ref={ref} className="mermaid-preview my-5 overflow-x-auto rounded-md border border-border bg-card p-4 text-xs" />;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const headings = useMemo(() => getMarkdownHeadings(content), [content]);
  let headingIndex = 0;

  return (
    <article className="markdown-prose mx-auto w-full max-w-3xl px-7 py-8 md:px-10 md:py-10">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 id={headings[headingIndex++]?.id}>{children}</h1>,
          h2: ({ children }) => <h2 id={headings[headingIndex++]?.id}>{children}</h2>,
          h3: ({ children }) => <h3 id={headings[headingIndex++]?.id}>{children}</h3>,
          h4: ({ children }) => <h4 id={headings[headingIndex++]?.id}>{children}</h4>,
          h5: ({ children }) => <h5 id={headings[headingIndex++]?.id}>{children}</h5>,
          h6: ({ children }) => <h6 id={headings[headingIndex++]?.id}>{children}</h6>,
          code: ({ className, children }) => {
            const source = String(children).replace(/\n$/, "");
            return className?.includes("language-mermaid") ? (
              <MermaidBlock source={source} />
            ) : (
              <code className={className}>{children}</code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}