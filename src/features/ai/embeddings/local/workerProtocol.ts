import type { EmbeddingProgress } from "../../rag/types";

export type EmbeddingWorkerRequest =
  { type: "embed"; id: number; texts: string[] } | { type: "dispose" };

export type EmbeddingWorkerResponse =
  | { type: "progress"; id: number; progress: EmbeddingProgress }
  | { type: "result"; id: number; modelId: string; vectors: Float32Array[]; dimensions: number }
  | { type: "error"; id: number; code: string; message: string };
