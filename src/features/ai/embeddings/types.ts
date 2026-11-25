import type { EmbeddingProgress } from "../rag/types";

export type EmbeddingModel = {
  id: string;
  label: string;
  dimensions?: number;
  local: boolean;
};

export type EmbeddingResult = {
  vector: Float32Array;
  modelId: string;
  dimensions: number;
};

export type EmbeddingOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: EmbeddingProgress) => void;
};

export interface EmbeddingProvider {
  readonly id: string;
  listModels(): EmbeddingModel[];
  embed(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult[]>;
  disconnect(): Promise<void>;
}
