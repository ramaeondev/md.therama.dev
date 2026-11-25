import { afterEach, describe, expect, it } from "vitest";

import { embeddingRegistry } from "../embeddings/registry";
import type { EmbeddingProvider } from "../embeddings/types";
import { retrieveChunks } from "./retriever";
import type { DocumentChunk } from "./types";
import type { RagStorageAdapter } from "./vectorStore";

const chunk = (
  id: string,
  documentId: string,
  content: string,
  vector: number[],
): DocumentChunk => ({
  id,
  workspaceId: "ws-current",
  documentId,
  documentTitle: `${documentId}.md`,
  folderId: null,
  headingPath: ["Sessions"],
  content,
  contentHash: id,
  chunkIndex: 0,
  chunkerVersion: 1,
  tokenEstimate: 10,
  embeddingProviderId: "local-transformers",
  embeddingModelId: "test-model",
  dimensions: vector.length,
  vector: new Float32Array(vector),
  createdAt: 1,
  updatedAt: 1,
});

describe("workspace retrieval", () => {
  const original = embeddingRegistry.resolve();
  afterEach(() => embeddingRegistry.register(original));

  it("ranks semantic matches, returns source metadata, and only reads the requested workspace", async () => {
    const provider: EmbeddingProvider = {
      id: "local-transformers",
      listModels: () => [{ id: "test-model", label: "Test", dimensions: 2, local: true }],
      embed: async () => [
        { vector: new Float32Array([1, 0]), modelId: "test-model", dimensions: 2 },
      ],
      disconnect: async () => {},
    };
    embeddingRegistry.register(provider);
    const storage: RagStorageAdapter = {
      getIndexState: async () => null,
      listIndexStates: async () => [],
      listChunks: async (workspaceId) =>
        workspaceId === "ws-current"
          ? [
              chunk("relevant", "doc-a", "Refresh tokens rotate after each session.", [1, 0]),
              chunk("other", "doc-b", "A recipe for apple pie.", [0, 1]),
            ]
          : [],
      saveIndexState: async () => {},
      replaceDocumentIndex: async () => {},
      updateDocumentTitle: async () => {},
      deleteDocument: async () => {},
      clearWorkspace: async () => {},
    };

    const results = await retrieveChunks(
      "ws-current",
      "refresh token session",
      { minimumScore: 0.1 },
      storage,
    );
    expect(results[0]).toMatchObject({
      chunkId: "relevant",
      documentId: "doc-a",
      headingPath: ["Sessions"],
    });
    expect(await retrieveChunks("ws-other", "refresh token session", {}, storage)).toEqual([]);
  });
});
