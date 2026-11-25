import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import { deleteAppDatabase, resetAppDatabaseConnection } from "@/lib/indexedDb";
import { indexedDbRagStorage } from "./vectorStore";
import type { DocumentChunk, DocumentIndexState } from "./types";

const state = (workspaceId: string, documentId: string): DocumentIndexState => ({
  id: `${workspaceId}:${documentId}`,
  workspaceId,
  documentId,
  documentTitle: `${documentId}.md`,
  folderId: null,
  contentHash: "hash",
  chunkerVersion: 1,
  embeddingProviderId: "local-transformers",
  embeddingModelId: "model",
  status: "indexed",
  chunkCount: 1,
  indexedAt: 1,
});

const chunk = (workspaceId: string, documentId: string, id: string): DocumentChunk => ({
  id,
  workspaceId,
  documentId,
  documentTitle: `${documentId}.md`,
  folderId: null,
  headingPath: ["Heading"],
  content: "Chunk content",
  contentHash: "chunk-hash",
  chunkIndex: 0,
  chunkerVersion: 1,
  tokenEstimate: 3,
  embeddingProviderId: "local-transformers",
  embeddingModelId: "model",
  dimensions: 2,
  vector: new Float32Array([1, 0]),
  createdAt: 1,
  updatedAt: 1,
});

describe("IndexedDB RAG storage", () => {
  beforeEach(async () => {
    resetAppDatabaseConnection();
    await deleteAppDatabase();
  });

  it("atomically replaces document chunks and isolates workspace reads", async () => {
    await indexedDbRagStorage.replaceDocumentIndex(state("ws-a", "doc-a"), [
      chunk("ws-a", "doc-a", "old"),
    ]);
    await indexedDbRagStorage.replaceDocumentIndex(state("ws-b", "doc-b"), [
      chunk("ws-b", "doc-b", "other"),
    ]);
    await indexedDbRagStorage.replaceDocumentIndex(state("ws-a", "doc-a"), [
      chunk("ws-a", "doc-a", "new"),
    ]);

    expect((await indexedDbRagStorage.listChunks("ws-a")).map((entry) => entry.id)).toEqual([
      "new",
    ]);
    expect((await indexedDbRagStorage.listChunks("ws-b")).map((entry) => entry.id)).toEqual([
      "other",
    ]);
    expect(await indexedDbRagStorage.getIndexState("ws-a", "doc-a")).toMatchObject({
      status: "indexed",
      chunkCount: 1,
    });
  });

  it("updates title metadata and removes only the requested document", async () => {
    await indexedDbRagStorage.replaceDocumentIndex(state("ws-a", "doc-a"), [
      chunk("ws-a", "doc-a", "a"),
    ]);
    await indexedDbRagStorage.replaceDocumentIndex(state("ws-a", "doc-b"), [
      chunk("ws-a", "doc-b", "b"),
    ]);
    await indexedDbRagStorage.updateDocumentTitle("ws-a", "doc-a", "Renamed.md");
    expect(
      (await indexedDbRagStorage.listChunks("ws-a")).find((entry) => entry.id === "a")
        ?.documentTitle,
    ).toBe("Renamed.md");
    await indexedDbRagStorage.deleteDocument("ws-a", "doc-a");
    expect((await indexedDbRagStorage.listChunks("ws-a")).map((entry) => entry.id)).toEqual(["b"]);
  });
});
