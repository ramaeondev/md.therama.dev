import { describe, expect, it } from "vitest";

import { chunkMarkdown } from "./chunker";
import { parseMarkdownBlocks } from "./markdownParser";

const source = {
  workspaceId: "ws-1",
  documentId: "doc-1",
  documentTitle: "Architecture.md",
  folderId: "folder-1",
  content: "",
};

describe("Markdown chunking", () => {
  it("retains nested heading paths and source Markdown blocks", () => {
    const markdown =
      "# Authentication\n\n## Sessions\n\nSessions use signed cookies.\n\n- Rotate keys\n- Revoke on logout\n\n### Storage\n\n```ts\nconst store = 'local';\n```\n";
    const blocks = parseMarkdownBlocks(markdown);
    expect(blocks.map((block) => block.headingPath)).toEqual([
      ["Authentication", "Sessions"],
      ["Authentication", "Sessions"],
      ["Authentication", "Sessions", "Storage"],
    ]);
    expect(blocks[1]?.markdown).toContain("- Revoke on logout");
    expect(blocks[2]?.kind).toBe("code");
  });

  it("is deterministic and includes every source block across its chunks", () => {
    const content = `# Design\n\n${Array.from({ length: 80 }, (_, index) => `Paragraph ${index} has distinct content to preserve.`).join("\n\n")}`;
    const chunks = chunkMarkdown({ ...source, content });
    expect(chunkMarkdown({ ...source, content })).toEqual(chunks);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.tokenEstimate <= 200)).toBe(true);
    for (let index = 0; index < 80; index += 1) {
      expect(chunks.some((chunk) => chunk.content.includes(`Paragraph ${index} `))).toBe(true);
    }
    expect(chunks.every((chunk) => chunk.headingPath.length > 0)).toBe(true);
  });

  it("preserves tables and handles empty and malformed Markdown", () => {
    const table = "| name | value |\n| --- | --- |\n| mode | local |";
    const chunks = chunkMarkdown({
      ...source,
      content: `# Config\n\n${table}\n\n\`\`\`unterminated`,
    });
    expect(chunks.some((chunk) => chunk.content.includes(table))).toBe(true);
    expect(chunkMarkdown({ ...source, content: "# Empty\n\n" })).toEqual([]);
  });
});
