import { deterministicId } from "./contentHash";
import { parseMarkdownBlocks, type MarkdownBlock } from "./markdownParser";
import { CHUNKER_VERSION, type MarkdownSource } from "./types";

// MiniLM's sentence-transformers configuration truncates at 256 word pieces.
// Keep generous headroom for document title and heading metadata prepended at
// embedding time. Counts here are approximate, so this is a conservative cap.
const TARGET_TOKENS = 160;
const MAX_TOKENS = 200;
const OVERLAP_TOKENS = 32;
const CHARS_PER_TOKEN = 4;

export type DraftChunk = {
  id: string;
  headingPath: string[];
  content: string;
  chunkIndex: number;
  tokenEstimate: number;
  chunkerVersion: number;
};

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / CHARS_PER_TOKEN));
}

function splitOversizedBlock(block: MarkdownBlock): string[] {
  const maxChars = (MAX_TOKENS - OVERLAP_TOKENS) * CHARS_PER_TOKEN;
  if (block.markdown.length <= maxChars) return [block.markdown];
  const lines = block.markdown.split("\n");
  const pieces: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current && current.length + line.length + 1 > maxChars) {
      pieces.push(current);
      current = "";
    }
    if (line.length > maxChars) {
      if (current) pieces.push(current);
      for (let offset = 0; offset < line.length; offset += maxChars) {
        pieces.push(line.slice(offset, offset + maxChars));
      }
      current = "";
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) pieces.push(current);
  return pieces.filter(Boolean);
}

function sameHeadingPath(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((heading, index) => heading === right[index]);
}

export function chunkMarkdown(source: MarkdownSource): DraftChunk[] {
  const blocks = parseMarkdownBlocks(source.content).flatMap((block) =>
    splitOversizedBlock(block).map((markdown) => ({ ...block, markdown })),
  );
  const groups: Array<{ headingPath: string[]; content: string }> = [];
  let current: { headingPath: string[]; blocks: string[] } | undefined;

  const flush = () => {
    if (!current?.blocks.length) return;
    groups.push({ headingPath: current.headingPath, content: current.blocks.join("\n\n") });
    current = undefined;
  };

  for (const block of blocks) {
    const prospective = current
      ? `${current.blocks.join("\n\n")}\n\n${block.markdown}`
      : block.markdown;
    if (
      current &&
      (!sameHeadingPath(current.headingPath, block.headingPath) ||
        estimateTokens(prospective) > TARGET_TOKENS)
    )
      flush();
    if (!current) current = { headingPath: block.headingPath, blocks: [block.markdown] };
    else current.blocks.push(block.markdown);
    if (estimateTokens(current.blocks.join("\n\n")) >= MAX_TOKENS) flush();
  }
  flush();

  const output: DraftChunk[] = [];
  let prior: DraftChunk | undefined;
  for (const group of groups) {
    let content = group.content;
    if (prior && sameHeadingPath(prior.headingPath, group.headingPath)) {
      const overlap = prior.content.slice(-OVERLAP_TOKENS * CHARS_PER_TOKEN).trim();
      if (overlap && !content.startsWith(overlap)) content = `${overlap}\n${content}`;
    }
    const chunkIndex = output.length;
    const id = deterministicId(
      source.workspaceId,
      source.documentId,
      String(CHUNKER_VERSION),
      String(chunkIndex),
      content,
    );
    const chunk = {
      id,
      headingPath: group.headingPath,
      content,
      chunkIndex,
      tokenEstimate: estimateTokens(content),
      chunkerVersion: CHUNKER_VERSION,
    };
    output.push(chunk);
    prior = chunk;
  }
  return output;
}
