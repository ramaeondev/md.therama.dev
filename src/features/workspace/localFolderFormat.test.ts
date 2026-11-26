import { describe, expect, it } from "vitest";

import { createStarterState } from "./model";
import {
  documentRelativePath,
  isLocalWorkspaceManifest,
  isSafeRelativeMarkdownPath,
  manifestState,
  markdownContentHash,
  safePathSegment,
  toLocalWorkspaceManifest,
} from "./localFolderFormat";

describe("local Markdown folder format", () => {
  it("maps nested workspace documents to safe, stable Markdown paths", () => {
    const state = createStarterState();
    const document = state.documents.find((entry) => entry.id === "doc-project-brief");
    expect(document).toBeDefined();
    if (!document) return;
    const relativePath = documentRelativePath(state, document);
    expect(relativePath).toContain("My workspace--workspac");
    expect(relativePath).toMatch(/Guides\/Project brief\.md$/);
    expect(isSafeRelativeMarkdownPath(relativePath)).toBe(true);
  });

  it.each(["../secret.md", "/absolute.md", "folder\\file.md", "folder/../file.md", "folder/"]) (
    "rejects unsafe Markdown path %s",
    (path) => expect(isSafeRelativeMarkdownPath(path)).toBe(false),
  );

  it("normalizes file names without allowing path separators or control characters", () => {
    expect(safePathSegment("../Research/Notes?\u0000")).toBe("..-Research-Notes--");
    expect(safePathSegment("... ")).toBe("...");
    expect(safePathSegment("Cafe\u0301")).toBe("Café");
  });

  it("round-trips a manifest while document bodies remain in separate Markdown files", async () => {
    const state = createStarterState();
    const source = state.documents[0];
    expect(source).toBeDefined();
    if (!source) return;
    const { content, ...metadata } = source;
    const relativePath = documentRelativePath(state, source);
    const hash = await markdownContentHash(content);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    const manifest = toLocalWorkspaceManifest(
      state,
      [{ ...metadata, relativePath, contentHash: hash }],
      7,
    );
    expect(isLocalWorkspaceManifest(manifest)).toBe(true);
    expect(JSON.stringify(manifest)).not.toContain(content);
    const restored = manifestState(manifest, new Map([[source.id, content]]));
    expect(restored.documents[0]).toMatchObject({ id: source.id, content });
    expect(restored.activeWorkspaceId).toBe(state.activeWorkspaceId);
  });

  it("rejects unsupported manifest versions and malformed revisions", () => {
    const state = createStarterState();
    const invalidVersion = toLocalWorkspaceManifest(state, [], 1);
    const invalidRevision = { ...invalidVersion, revision: -1 };
    expect(isLocalWorkspaceManifest({ ...invalidVersion, version: 2 })).toBe(false);
    expect(isLocalWorkspaceManifest(invalidRevision)).toBe(false);
    expect(isLocalWorkspaceManifest({ ...invalidVersion, documents: "not-an-array" })).toBe(false);
  });

  it("rejects cyclic folder trees while deriving a document path", () => {
    const state = createStarterState();
    const document = state.documents[0];
    const folder = state.folders[0];
    expect(document).toBeDefined();
    expect(folder).toBeDefined();
    if (!document || !folder) return;
    state.folders = [{ ...folder, parentId: folder.id }];
    state.documents = [{ ...document, folderId: folder.id }];
    expect(() => documentRelativePath(state, state.documents[0]!)).toThrow("cycle");
  });
});
