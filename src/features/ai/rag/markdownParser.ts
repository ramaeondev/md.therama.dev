import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import type { Heading, RootContent } from "mdast";

export type MarkdownBlock = {
  kind: "paragraph" | "list" | "blockquote" | "code" | "table" | "other";
  headingPath: string[];
  markdown: string;
};

const parser = unified().use(remarkParse).use(remarkGfm);

type TreeLike = { value?: unknown; children?: TreeLike[] };

function inlineText(node: TreeLike): string {
  return (node.children ?? [])
    .map((child) => {
      if (typeof child.value === "string") return child.value;
      if (Array.isArray(child.children)) return inlineText(child);
      return "";
    })
    .join("")
    .trim();
}

function blockKind(node: RootContent): MarkdownBlock["kind"] {
  if (node.type === "paragraph") return "paragraph";
  if (node.type === "list") return "list";
  if (node.type === "blockquote") return "blockquote";
  if (node.type === "code") return "code";
  if (node.type === "table") return "table";
  return "other";
}

/** Extract source-preserving Markdown blocks and their enclosing heading paths. */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const tree = parser.parse(markdown);
  const headings: string[] = [];
  const blocks: MarkdownBlock[] = [];

  for (const node of tree.children) {
    if (node.type === "heading") {
      const heading = node as Heading;
      headings.length = Math.max(0, heading.depth - 1);
      headings.push(inlineText(heading as unknown as TreeLike));
      continue;
    }
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    const source =
      start !== undefined && end !== undefined ? markdown.slice(start, end).trim() : "";
    if (!source) continue;
    blocks.push({ kind: blockKind(node), headingPath: [...headings], markdown: source });
  }
  return blocks;
}
