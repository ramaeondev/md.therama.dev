import { afterEach, describe, expect, it, vi } from "vitest";

import { embeddingRegistry } from "../embeddings/registry";
import type { EmbeddingProvider } from "../embeddings/types";
import { indexDocument } from "./documentIndexer";
import type { DocumentChunk, DocumentIndexState, MarkdownSource } from "./types";
import type { RagStorageAdapter } from "./vectorStore";

const source: MarkdownSource = {
  workspaceId: "ws-index",
  documentId: "doc-index",
  documentTitle: "Notes.md",
  folderId: null,
  content: "# Security\n\nUse rotating refresh tokens.",
};

function storageFixture(): RagStorageAdapter & {
  chunks: DocumentChunk[];
  state: DocumentIndexState | null;
} {
  const store = {
    chunks: [] as DocumentChunk[],
    state: null as DocumentIndexState | null,
    async getIndexState() {
      return this.state;
    },
    async listIndexStates() {
      return this.state ? [this.state] : [];
    },
    async listChunks() {
      return this.chunks;
    },
    async saveIndexState(state: DocumentIndexState) {
      this.state = state;
    },
    async replaceDocumentIndex(state: DocumentIndexState, chunks: DocumentChunk[]) {
      this.state = state;
      this.chunks = chunks;
    },
    async updateDocumentTitle(_workspaceId: string, _documentId: string, title: string) {
      this.chunks = this.chunks.map((chunk) => ({ ...chunk, documentTitle: title }));
      if (this.state) this.state = { ...this.state, documentTitle: title };
    },
    async deleteDocument() {
      this.chunks = [];
      this.state = null;
    },
    async clearWorkspace() {
      this.chunks = [];
      this.state = null;
    },
  };
  return store;
}

describe("document indexing", () => {
  const realProvider = embeddingRegistry.resolve();
  afterEach(() => embeddingRegistry.register(realProvider));

  it("embeds and atomically stores chunks, then skips unchanged content", async () => {
    const embed = vi.fn(async (texts: string[]) =>
      texts.map(() => ({
        vector: new Float32Array([1, 0]),
        modelId: "test-model",
        dimensions: 2,
      })),
    );
    const provider: EmbeddingProvider = {
      id: "local-transformers",
      listModels: () => [{ id: "test-model", label: "Test", dimensions: 2, local: true }],
      embed,
      disconnect: async () => {},
    };
    embeddingRegistry.register(provider);
    const storage = storageFixture();

    const first = await indexDocument(source, {}, storage);
    const second = await indexDocument(source, {}, storage);

    expect(first).toEqual({ indexed: true, chunkCount: 1 });
    expect(second).toEqual({ indexed: false, chunkCount: 1 });
    expect(embed).toHaveBeenCalledTimes(1);
    expect(storage.state?.status).toBe("indexed");
    expect(storage.chunks[0]?.headingPath).toEqual(["Security"]);
  });

  it("keeps the previous chunk set when re-embedding fails", async () => {
    const storage = storageFixture();
    const provider: EmbeddingProvider = {
      id: "local-transformers",
      listModels: () => [{ id: "test-model", label: "Test", dimensions: 2, local: true }],
      embed: async () => {
        throw new Error("model unavailable");
      },
      disconnect: async () => {},
    };
    embeddingRegistry.register(provider);
    await expect(indexDocument(source, {}, storage)).rejects.toThrow("model unavailable");
    expect(storage.chunks).toEqual([]);
    expect(storage.state?.status).toBe("failed");
  });
});
