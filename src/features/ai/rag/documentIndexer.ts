import { embeddingRegistry } from "../embeddings/registry";
import { EmbeddingError } from "../embeddings/errors";
import { contentHash } from "./contentHash";
import { chunkMarkdown } from "./chunker";
import { indexedDbRagStorage, documentIndexId, type RagStorageAdapter } from "./vectorStore";
import {
  CHUNKER_VERSION,
  type DocumentChunk,
  type DocumentIndexState,
  type EmbeddingProgress,
  type IndexProgress,
  type MarkdownSource,
} from "./types";

export type IndexOptions = {
  signal?: AbortSignal;
  force?: boolean;
  onProgress?: (progress: IndexProgress) => void;
};

const DEFAULT_PROVIDER = "local-transformers";

function baseState(source: MarkdownSource, hash: string, modelId: string): DocumentIndexState {
  return {
    id: documentIndexId(source.workspaceId, source.documentId),
    workspaceId: source.workspaceId,
    documentId: source.documentId,
    documentTitle: source.documentTitle,
    folderId: source.folderId,
    contentHash: hash,
    chunkerVersion: CHUNKER_VERSION,
    embeddingProviderId: DEFAULT_PROVIDER,
    embeddingModelId: modelId,
    status: "pending",
    chunkCount: 0,
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new EmbeddingError("cancelled", "Indexing was cancelled.");
}

export async function indexDocument(
  source: MarkdownSource,
  options: IndexOptions = {},
  storage: RagStorageAdapter = indexedDbRagStorage,
): Promise<{ indexed: boolean; chunkCount: number }> {
  const provider = embeddingRegistry.resolve(DEFAULT_PROVIDER);
  const model = provider.listModels()[0];
  if (!model) throw new Error("No local embedding model is available.");
  const hash = await contentHash(`${CHUNKER_VERSION}\n${source.content}`);
  const existing = await storage.getIndexState(source.workspaceId, source.documentId);
  if (
    !options.force &&
    existing?.contentHash === hash &&
    existing.chunkerVersion === CHUNKER_VERSION &&
    existing.embeddingProviderId === provider.id &&
    existing.embeddingModelId === model.id &&
    existing.status === "indexed"
  ) {
    if (existing.documentTitle !== source.documentTitle || existing.folderId !== source.folderId) {
      await storage.updateDocumentTitle(
        source.workspaceId,
        source.documentId,
        source.documentTitle,
        source.folderId,
      );
    }
    options.onProgress?.({
      workspaceId: source.workspaceId,
      documentId: source.documentId,
      completed: 1,
      total: 1,
      phase: "complete",
      message: "Already up to date",
    });
    return { indexed: false, chunkCount: existing.chunkCount };
  }

  const state = { ...baseState(source, hash, model.id), status: "indexing" as const };
  await storage.saveIndexState(state);
  const report = (
    phase: IndexProgress["phase"],
    completed: number,
    total: number,
    message?: string,
  ) =>
    options.onProgress?.({
      workspaceId: source.workspaceId,
      documentId: source.documentId,
      completed,
      total,
      phase,
      ...(message ? { message } : {}),
    });

  try {
    throwIfAborted(options.signal);
    report("parsing", 0, 1, "Parsing Markdown");
    const drafts = chunkMarkdown(source);
    throwIfAborted(options.signal);
    let vectors: Awaited<ReturnType<typeof provider.embed>> = [];
    if (drafts.length) {
      const embeddingTexts = drafts.map((chunk) => {
        const location = chunk.headingPath.length
          ? `Heading: ${chunk.headingPath.join(" > ")}\n\n`
          : "";
        return `${source.documentTitle}\n${location}${chunk.content}`;
      });
      report("embedding", 0, embeddingTexts.length, "Generating local embeddings");
      vectors = await provider.embed(embeddingTexts, {
        ...(options.signal ? { signal: options.signal } : {}),
        onProgress: (progress: EmbeddingProgress) => {
          const completed = progress.loaded ?? 0;
          report("embedding", completed, progress.total ?? embeddingTexts.length, progress.message);
        },
      });
    }
    throwIfAborted(options.signal);
    const now = Date.now();
    const chunks: DocumentChunk[] = await Promise.all(
      drafts.map(async (draft, index) => {
        const embedded = vectors[index];
        if (
          !embedded ||
          embedded.dimensions !== embedded.vector.length ||
          embedded.vector.some((value) => !Number.isFinite(value))
        ) {
          throw new EmbeddingError(
            "invalid_vector",
            "The embedding provider returned an invalid vector.",
          );
        }
        return {
          ...draft,
          workspaceId: source.workspaceId,
          documentId: source.documentId,
          documentTitle: source.documentTitle,
          folderId: source.folderId,
          contentHash: await contentHash(draft.content),
          embeddingProviderId: provider.id,
          embeddingModelId: embedded.modelId,
          dimensions: embedded.dimensions,
          vector: embedded.vector,
          createdAt: now,
          updatedAt: now,
        };
      }),
    );
    throwIfAborted(options.signal);
    report("saving", 0, chunks.length, "Saving workspace index");
    await storage.replaceDocumentIndex(
      { ...state, status: "indexed", chunkCount: chunks.length, indexedAt: now },
      chunks,
    );
    report("complete", chunks.length, chunks.length, "Index ready");
    return { indexed: true, chunkCount: chunks.length };
  } catch (error) {
    const errorCode = error instanceof EmbeddingError ? error.code : "index_failed";
    if (errorCode !== "cancelled") {
      await storage.saveIndexState({ ...state, status: "failed", errorCode });
    }
    report(
      "failed",
      0,
      1,
      errorCode === "cancelled" ? "Indexing cancelled" : "Indexing failed; retry is available",
    );
    throw error;
  }
}
