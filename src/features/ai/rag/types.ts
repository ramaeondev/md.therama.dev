export type IndexStatus = "pending" | "indexing" | "indexed" | "failed";

export type MarkdownSource = {
  workspaceId: string;
  documentId: string;
  documentTitle: string;
  folderId: string | null;
  content: string;
};

export type DocumentChunk = {
  id: string;
  workspaceId: string;
  documentId: string;
  documentTitle: string;
  folderId: string | null;
  headingPath: string[];
  content: string;
  contentHash: string;
  chunkIndex: number;
  chunkerVersion: number;
  tokenEstimate: number;
  embeddingProviderId: string;
  embeddingModelId: string;
  dimensions: number;
  vector: Float32Array;
  createdAt: number;
  updatedAt: number;
};

export type DocumentIndexState = {
  id: string;
  workspaceId: string;
  documentId: string;
  documentTitle: string;
  folderId: string | null;
  contentHash: string;
  chunkerVersion: number;
  embeddingProviderId: string;
  embeddingModelId: string;
  status: IndexStatus;
  chunkCount: number;
  indexedAt?: number;
  errorCode?: string;
};

export type EmbeddingProgress = {
  phase: "loading-model" | "embedding";
  loaded?: number;
  total?: number;
  progress?: number;
  message?: string;
};

export type RetrievalSource = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  headingPath: string[];
  score: number;
  excerpt: string;
};

export type RetrievalResult = {
  context: string;
  sources: RetrievalSource[];
};

export type IndexProgress = {
  workspaceId: string;
  documentId: string;
  completed: number;
  total: number;
  phase: "queued" | "parsing" | "embedding" | "saving" | "complete" | "failed";
  message?: string;
};

export const CHUNKER_VERSION = 1;
