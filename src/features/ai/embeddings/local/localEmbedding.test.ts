import { afterEach, describe, expect, it, vi } from "vitest";

import { localEmbeddingProvider } from "./localEmbedding";
import type { EmbeddingWorkerRequest, EmbeddingWorkerResponse } from "./workerProtocol";

class FakeWorker {
  static instances: FakeWorker[] = [];
  static respondNext = true;
  onmessage: ((event: MessageEvent<EmbeddingWorkerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  respond = true;

  constructor() {
    this.respond = FakeWorker.respondNext;
    FakeWorker.respondNext = true;
    FakeWorker.instances.push(this);
  }

  postMessage(request: EmbeddingWorkerRequest) {
    if (request.type !== "embed" || !this.respond) return;
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          type: "result",
          id: request.id,
          modelId: "test-model",
          vectors: request.texts.map(() => new Float32Array([1, 0])),
          dimensions: 2,
        },
      } as MessageEvent<EmbeddingWorkerResponse>);
    });
  }

  terminate() {
    this.terminated = true;
  }
}

describe("local embedding worker client", () => {
  afterEach(async () => {
    await localEmbeddingProvider.disconnect();
    FakeWorker.instances = [];
    FakeWorker.respondNext = true;
    vi.unstubAllGlobals();
  });

  it("creates the worker on demand and returns vectors", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const results = await localEmbeddingProvider.embed(["one", "two"]);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ modelId: "test-model", dimensions: 2 });
    expect(results[0]?.vector).toEqual(new Float32Array([1, 0]));
  });

  it("terminates the worker and rejects when a request is cancelled", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.respondNext = false;
    const controller = new AbortController();
    const promise = localEmbeddingProvider.embed(["never responds"], {
      signal: controller.signal,
    });
    await Promise.resolve();
    const instance = FakeWorker.instances[0];
    if (!instance) throw new Error("expected worker instance");
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: "cancelled" });
    expect(instance.terminated).toBe(true);
  });
});
