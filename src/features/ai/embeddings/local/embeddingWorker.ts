import { pipeline } from "@huggingface/transformers";

import type { EmbeddingProgress } from "../../rag/types";
import type { EmbeddingWorkerRequest, EmbeddingWorkerResponse } from "./workerProtocol";

const MODEL_ID = "onnx-community/all-MiniLM-L6-v2-ONNX";
const MODEL_REVISION = "aff7a1d";
const VERSIONED_MODEL_ID = `${MODEL_ID}@${MODEL_REVISION}`;
const BATCH_SIZE = 8;

type TensorResult = { tolist(): unknown };
type FeaturePipeline = ((
  texts: string | string[],
  options?: { pooling?: "mean"; normalize?: boolean },
) => Promise<TensorResult>) & { dispose?: () => Promise<void> | void };
type WorkerScope = {
  onmessage: ((event: MessageEvent<EmbeddingWorkerRequest>) => void) | null;
  postMessage(message: EmbeddingWorkerResponse, transfer?: Transferable[]): void;
};

const scope = self as unknown as WorkerScope;
let pipelinePromise: Promise<FeaturePipeline> | undefined;

function sendProgress(id: number, progress: EmbeddingProgress) {
  scope.postMessage({ type: "progress", id, progress });
}

async function getPipeline(requestId: number): Promise<FeaturePipeline> {
  if (!pipelinePromise) {
    pipelinePromise = pipeline("feature-extraction", MODEL_ID, {
      revision: MODEL_REVISION,
      progress_callback: (event: {
        status?: string;
        loaded?: number;
        total?: number;
        progress?: number;
        file?: string;
      }) => {
        sendProgress(requestId, {
          phase: "loading-model",
          ...(event.loaded !== undefined ? { loaded: event.loaded } : {}),
          ...(event.total !== undefined ? { total: event.total } : {}),
          ...(event.progress !== undefined ? { progress: event.progress / 100 } : {}),
          message: event.file ?? event.status ?? "Downloading local model…",
        });
      },
    }) as unknown as Promise<FeaturePipeline>;
    pipelinePromise.catch(() => {
      pipelinePromise = undefined;
    });
  }
  sendProgress(requestId, {
    phase: "loading-model",
    progress: 0,
    message: "Loading local embedding model…",
  });
  return pipelinePromise;
}

function vectorsFrom(result: unknown, count: number): Float32Array[] {
  if (!Array.isArray(result) || result.length !== count) throw new Error("invalid_vector");
  const vectors = result.map((row) => {
    if (!Array.isArray(row) || row.length === 0) throw new Error("invalid_vector");
    const vector = Float32Array.from(row.map(Number));
    if (vector.some((value) => !Number.isFinite(value))) throw new Error("invalid_vector");
    return vector;
  });
  const dimensions = vectors[0]?.length ?? 0;
  if (vectors.some((vector) => vector.length !== dimensions)) throw new Error("invalid_vector");
  return vectors;
}

async function embed(id: number, texts: string[]) {
  let model: FeaturePipeline;
  try {
    model = await getPipeline(id);
  } catch {
    scope.postMessage({
      type: "error",
      id,
      code: "model_load_failed",
      message:
        "The local embedding model could not be loaded. Check your connection and try again.",
    });
    return;
  }
  try {
    const vectors: Float32Array[] = [];
    for (let offset = 0; offset < texts.length; offset += BATCH_SIZE) {
      const batch = texts.slice(offset, offset + BATCH_SIZE);
      sendProgress(id, {
        phase: "embedding",
        loaded: offset,
        total: texts.length,
        progress: offset / texts.length,
        message: `Embedding ${offset + 1}–${offset + batch.length} of ${texts.length}`,
      });
      const result = await model(batch, { pooling: "mean", normalize: true });
      vectors.push(...vectorsFrom(result.tolist(), batch.length));
    }
    const dimensions = vectors[0]?.length ?? 0;
    sendProgress(id, {
      phase: "embedding",
      loaded: texts.length,
      total: texts.length,
      progress: 1,
      message: "Embeddings ready",
    });
    scope.postMessage(
      { type: "result", id, modelId: VERSIONED_MODEL_ID, vectors, dimensions },
      vectors.map((vector) => vector.buffer),
    );
  } catch (error) {
    const code =
      error instanceof Error && error.message === "invalid_vector"
        ? "invalid_vector"
        : "embedding_failed";
    scope.postMessage({
      type: "error",
      id,
      code,
      message:
        code === "invalid_vector"
          ? "The local model returned an invalid vector."
          : "The local model could not process this text.",
    });
  }
}

scope.onmessage = (event) => {
  if (event.data.type === "dispose") {
    void pipelinePromise?.then((loaded) => loaded.dispose?.()).catch(() => undefined);
    pipelinePromise = undefined;
    return;
  }
  void embed(event.data.id, event.data.texts);
};
