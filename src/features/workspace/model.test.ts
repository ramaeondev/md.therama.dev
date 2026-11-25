import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createMarkdownDocument,
  createStarterState,
  createWorkspaceBundle,
  duplicateMarkdownDocument,
} from "./model";
import { indexedDbStorage } from "./storage";

describe("local workspace foundation", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("markdown-ai-workspace");
  });

  it("starts with a local sample workspace and starter Markdown documents", () => {
    const state = createStarterState();
    expect(state.workspaces).toHaveLength(1);
    expect(state.documents.map((document) => document.title)).toContain("Welcome.md");
    expect(state.folders.some((folder) => folder.parentId !== null)).toBe(true);
  });

  it("creates Markdown documents in the requested workspace and folder", () => {
    const document = createMarkdownDocument(
      "workspace-a",
      "folder-a",
      "Design notes.md",
      "2026-11-13T00:00:00.000Z",
    );
    expect(document.title).toBe("Design notes.md");
    expect(document.workspaceId).toBe("workspace-a");
    expect(document.folderId).toBe("folder-a");
    expect(document.content).toContain("# Design notes");
  });

  it("duplicates a document without changing its source", () => {
    const original = createMarkdownDocument("workspace-a", null, "Notes");
    original.content = "Keep my original text";
    const duplicate = duplicateMarkdownDocument(original);
    expect(duplicate.id).not.toBe(original.id);
    expect(duplicate.title).toBe("Notes copy.md");
    expect(duplicate.content).toBe(original.content);
    expect(original.title).toBe("Notes.md");
  });

  it("round-trips open tabs, documents, and preferences through IndexedDB", async () => {
    const state = createStarterState();
    state.openDocumentIds = ["doc-welcome", "doc-project-brief"];
    state.activeDocumentId = "doc-project-brief";
    state.preferences.theme = "light";
    state.preferences.aiProviderId = "gemini";
    state.preferences.aiModelId = "gemini-2.5-flash";
    await indexedDbStorage.save(state);
    const restored = await indexedDbStorage.load();
    expect(restored?.activeDocumentId).toBe("doc-project-brief");
    expect(restored?.openDocumentIds).toEqual(["doc-welcome", "doc-project-brief"]);
    expect(restored?.documents).toHaveLength(3);
    expect(restored?.preferences.theme).toBe("light");
    expect(restored?.preferences.aiProviderId).toBe("gemini");
    expect(restored?.preferences.aiModelId).toBe("gemini-2.5-flash");
  });

  it("exports only the selected workspace and its contents", () => {
    const state = createStarterState();
    const bundle = createWorkspaceBundle(state, "workspace-starter");
    expect(bundle?.format).toBe("markdown-ai-workspace");
    expect(bundle?.documents).toHaveLength(3);
    expect(bundle?.folders).toHaveLength(3);
    expect(createWorkspaceBundle(state, "missing-workspace")).toBeNull();
  });
});
