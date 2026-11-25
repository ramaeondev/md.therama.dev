import { EmbeddingError } from "../errors";
import type { EmbeddingOptions, EmbeddingProvider, EmbeddingResult } from "../types";
import type { EmbeddingWorkerResponse } from "./workerProtocol";

const MODEL_ID = "onnx-community/all-MiniLM-L6-v2-ONNX";
const MODEL_REVISION = "aff7a1d";
const VERSIONED_MODEL_ID = `${MODEL_ID}@${MODEL_REVISION}`;

type PendingRequest = {
  resolve: (results: EmbeddingResult[]) => void;
  reject: (error: unknown) => void;
  onProgress?: EmbeddingOptions["onProgress"];
  signal?: AbortSignal;
  abort?: () => void;
};

let worker: Worker | undefined;
let nextRequestId = 0;
let queue: Promise<unknown> = Promise.resolve();
const pending = new Map<number, PendingRequest>();

function errorFromCode(code: string, message: string): EmbeddingError {
  if (code === "invalid_vector") return new EmbeddingError("invalid_vector", message);
  if (code === "cancelled") return new EmbeddingError("cancelled", message);
  if (code === "model_load_failed") return new EmbeddingError("model_load_failed", message);
  return new EmbeddingError("embedding_failed", message);
}

function settlePending(error: EmbeddingError) {
  for (const request of pending.values()) {
    if (request.abort && request.signal) request.signal.removeEventListener("abort", request.abort);
    request.reject(error);
  }
  pending.clear();
}

function terminateWorker(error?: EmbeddingError) {
  worker?.terminate();
  worker = undefined;
  if (error) settlePending(error);
}

function ensureWorker(): Worker {
  if (worker) return worker;
  const instance = new Worker(new URL("./embeddingWorker.ts", import.meta.url), { type: "module" });
  instance.onmessage = (event: MessageEvent<EmbeddingWorkerResponse>) => {
    const message = event.data;
    if (message.type === "progress") {
      pending.get(message.id)?.onProgress?.(message.progress);
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (request.abort && request.signal) request.signal.removeEventListener("abort", request.abort);
    if (message.type === "error") {
      request.reject(errorFromCode(message.code, message.message));
      return;
    }
    request.resolve(
      message.vectors.map((vector) => ({
        vector,
        modelId: message.modelId,
        dimensions: message.dimensions,
      })),
    );
  };
  instance.onerror = () => {
    terminateWorker(
      new EmbeddingError("embedding_failed", "The local embedding worker stopped unexpectedly."),
    );
  };
  worker = instance;
  return instance;
}

function embedInWorker(texts: string[], options: EmbeddingOptions): Promise<EmbeddingResult[]> {
  if (options.signal?.aborted) {
    return Promise.reject(new EmbeddingError("cancelled", "Embedding was cancelled."));
  }
  const id = ++nextRequestId;
  const instance = ensureWorker();
  return new Promise((resolve, reject) => {
    const request: PendingRequest = {
      resolve,
      reject,
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    };
    if (options.signal) {
      request.abort = () => {
        terminateWorker(new EmbeddingError("cancelled", "Embedding was cancelled."));
      };
      options.signal.addEventListener("abort", request.abort, { once: true });
    }
    pending.set(id, request);
    instance.postMessage({ type: "embed", id, texts });
  });
}

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const task = queue.then(work, work);
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export const localEmbeddingProvider: EmbeddingProvider = {
  id: "local-transformers",
  listModels() {
    return [{ id: VERSIONED_MODEL_ID, label: "MiniLM L6 (local)", dimensions: 384, local: true }];
  },
  async embed(texts, options = {}): Promise<EmbeddingResult[]> {
    if (!texts.length) return [];
    return serialize(() => embedInWorker(texts, options));
  },
  async disconnect() {
    worker?.postMessage({ type: "dispose" });
    terminateWorker(new EmbeddingError("cancelled", "The embedding provider was disconnected."));
  },
};
