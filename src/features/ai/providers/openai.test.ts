import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeProviderError, ProviderError } from "./errors";
import { openaiProvider } from "./openai";
import { createOpenAiCompatibleProvider } from "./openaiCompatible";
import {
  classifyModelId,
  prettifyModelId,
  supportsSamplingParameters,
} from "./shared/modelCatalog";
import { normalizeBaseUrl } from "./shared/openAiCompatible";
import { SseParser } from "./shared/sseParser";
import type { ProviderRequest } from "./types";

const key = "sk-test-secret-value";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sseResponse(chunks: string[]) {
  const encoded = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoded.encode(chunk));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

const request: ProviderRequest = {
  model: "gpt-4.1-mini",
  messages: [
    { role: "user", content: "Earlier question" },
    { role: "assistant", content: "Earlier answer" },
    { role: "user", content: "Explain this note" },
  ],
};

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe("OpenAI provider adapter", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("refuses to create a session without a key", () => {
    expect(() => openaiProvider.initialize({ apiKey: "   " })).toThrowError(
      expect.objectContaining({ code: "invalid_api_key" }),
    );
  });

  it("declares the same capabilities as the existing provider contract", () => {
    expect(openaiProvider.descriptor.id).toBe("openai");
    expect(openaiProvider.descriptor.capabilities).toEqual([
      "model_discovery",
      "text_generation",
      "streaming",
    ]);
  });

  it("discovers models with a Bearer token and classifies chat support honestly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        object: "list",
        data: [
          { id: "gpt-4.1-mini", object: "model", owned_by: "openai" },
          { id: "text-embedding-3-small", object: "model", owned_by: "openai" },
          { id: "whisper-1", object: "model", owned_by: "openai" },
          { id: "some-new-model", object: "model", owned_by: "openai" },
          { id: "meta-llama/llama-3-70b", object: "model", owned_by: "meta" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = openaiProvider.initialize({ apiKey: key });
    const models = await session.listModels();

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/models");
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      `Bearer ${key}`,
    );

    // Non-chat models are excluded rather than advertised as text models.
    expect(models.map((model) => model.id)).not.toContain("text-embedding-3-small");
    expect(models.map((model) => model.id)).not.toContain("whisper-1");

    const known = models.find((model) => model.id === "gpt-4.1-mini");
    expect(known).toMatchObject({
      providerId: "openai",
      source: "discovered",
      availability: "available",
      capabilities: { textGeneration: true, streaming: true },
    });
    // No context window or token limits are invented from discovery metadata.
    expect(known?.contextWindowTokens).toBeUndefined();
    expect(known?.maxOutputTokens).toBeUndefined();

    // An unrecognised model is listed but never claimed as chat-capable.
    const unknown = models.find((model) => model.id === "some-new-model");
    expect(unknown).toMatchObject({
      availability: "unknown",
      capabilities: { textGeneration: false },
    });

    // Chat-capable models come first.
    expect(models[0]?.capabilities.textGeneration).toBe(true);
  });

  it("reports a connection from the discovered chat models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [{ id: "gpt-4.1" }, { id: "gpt-4.1-mini" }, { id: "text-embedding-3-large" }],
        }),
      ),
    );
    const session = openaiProvider.initialize({ apiKey: key });
    const connection = await session.testConnection();
    expect(connection).toMatchObject({
      providerId: "openai",
      connected: true,
      availableModelCount: 2,
    });
    expect(typeof connection.checkedAt).toBe("string");
  });

  it("maps the common request onto Chat Completions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: "A clear summary." }, finish_reason: "stop" }],
        usage: { prompt_tokens: 21, completion_tokens: 6, total_tokens: 27 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = openaiProvider.initialize({ apiKey: key });
    const result = await session.generateText({
      ...request,
      systemInstruction: "Use the note as context.",
      temperature: 0.2,
      maxOutputTokens: 256,
    });

    expect(result).toEqual({
      text: "A clear summary.",
      model: "gpt-4.1-mini",
      usage: { inputTokens: 21, outputTokens: 6, totalTokens: 27, source: "provider_reported" },
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      model: string;
      stream?: boolean;
      messages: Array<{ role: string; content: string }>;
      temperature?: number;
      max_tokens?: number;
    };
    expect(body.model).toBe("gpt-4.1-mini");
    expect(body.stream).toBeUndefined();
    expect(body.messages[0]).toEqual({ role: "system", content: "Use the note as context." });
    // Conversation history is preserved in order with the shared role names.
    expect(body.messages.slice(1)).toEqual([
      { role: "user", content: "Earlier question" },
      { role: "assistant", content: "Earlier answer" },
      { role: "user", content: "Explain this note" },
    ]);
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(256);
  });

  it("omits sampling parameters that reasoning models reject", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: "Reasoned." } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const session = openaiProvider.initialize({ apiKey: key });
    await session.generateText({
      ...request,
      model: "o4-mini",
      temperature: 0.5,
      maxOutputTokens: 100,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body["model"]).toBe("o4-mini");
    expect(body["temperature"]).toBeUndefined();
    expect(body["max_tokens"]).toBeUndefined();
  });

  it("normalizes an unavailable model into the shared unsupported_model code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              message: `The model 'nope' does not exist for key ${key}`,
              type: "invalid_request_error",
              code: "model_not_found",
            },
          },
          404,
        ),
      ),
    );
    const session = openaiProvider.initialize({ apiKey: key });
    const call = session.generateText({ ...request, model: "nope" });
    await expect(call).rejects.toMatchObject({ code: "unsupported_model" });
    await expect(session.generateText({ ...request, model: "nope" })).rejects.not.toThrow(key);
  });

  it.each([
    [
      401,
      { error: { message: "Incorrect API key provided", code: "invalid_api_key" } },
      "invalid_api_key",
    ],
    [
      403,
      { error: { message: "You do not have access", code: "permission_denied" } },
      "invalid_api_key",
    ],
    [
      429,
      { error: { message: "Rate limit reached", code: "rate_limit_exceeded" } },
      "rate_limited",
    ],
    [
      429,
      { error: { message: "You exceeded your current quota", code: "insufficient_quota" } },
      "quota_exceeded",
    ],
    [
      400,
      { error: { message: "Invalid value for 'temperature'", code: "invalid_value" } },
      "invalid_request",
    ],
    [503, { error: { message: "The server is overloaded" } }, "provider_unavailable"],
  ] as const)("maps HTTP %s into %s", async (status, body, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body, status)));
    const session = openaiProvider.initialize({ apiKey: key });
    await expect(session.listModels()).rejects.toMatchObject({ code: expected });
  });

  it("distinguishes an exhausted quota from a plain rate limit even on the same status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              message: "You exceeded your current quota",
              type: "insufficient_quota",
              code: "insufficient_quota",
            },
          },
          429,
        ),
      ),
    );
    const session = openaiProvider.initialize({ apiKey: key });
    const error = await session.listModels().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("quota_exceeded");
    expect((error as ProviderError).retryable).toBe(false);
  });

  it("turns a network failure into network_error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const session = openaiProvider.initialize({ apiKey: key });
    await expect(session.listModels()).rejects.toMatchObject({ code: "network_error" });
  });

  it("requests streaming with usage reporting enabled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse(['data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n', "data: [DONE]\n\n"]),
      );
    vi.stubGlobal("fetch", fetchMock);
    const session = openaiProvider.initialize({ apiKey: key });
    await collect(session.streamText(request));

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      stream?: boolean;
      stream_options?: { include_usage?: boolean };
    };
    expect(body.stream).toBe(true);
    expect(body.stream_options?.include_usage).toBe(true);
  });

  it("streams text deltas as normalized events", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
            "data: [DONE]\n\n",
          ]),
        ),
    );
    const session = openaiProvider.initialize({ apiKey: key });
    const events = await collect(session.streamTextEvents!(request));
    expect(events).toEqual([
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
    ]);
  });

  it("emits usage from the final usage-only chunk with an empty choices array", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"there"},"finish_reason":"stop"}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":20,"completion_tokens":7,"total_tokens":27}}\n\n',
            "data: [DONE]\n\n",
          ]),
        ),
    );
    const session = openaiProvider.initialize({ apiKey: key });
    const events = await collect(session.streamTextEvents!(request));

    expect(events).toEqual([
      { type: "text", text: "Hello " },
      { type: "text", text: "there" },
      {
        type: "usage",
        usage: { inputTokens: 20, outputTokens: 7, totalTokens: 27, source: "provider_reported" },
      },
    ]);
  });

  it("emits no usage event when the stream reports none", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'data: {"choices":[{"delta":{"content":"plain"}}]}\n\n',
            "data: [DONE]\n\n",
          ]),
        ),
    );
    const session = openaiProvider.initialize({ apiKey: key });
    const events = await collect(session.streamTextEvents!(request));
    expect(events).toEqual([{ type: "text", text: "plain" }]);
  });

  it("ignores reasoning deltas and never mixes them into the answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'data: {"choices":[{"delta":{"reasoning_content":"thinking hard"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"Answer"}}]}\n\n',
            "data: [DONE]\n\n",
          ]),
        ),
    );
    const session = openaiProvider.initialize({ apiKey: key });
    const events = await collect(session.streamTextEvents!(request));
    expect(events).toEqual([{ type: "text", text: "Answer" }]);
  });

  it("fails with stream_interrupted on a malformed event", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
            "data: {not json}\n\n",
          ]),
        ),
    );
    const session = openaiProvider.initialize({ apiKey: key });
    await expect(collect(session.streamTextEvents!(request))).rejects.toMatchObject({
      code: "stream_interrupted",
    });
  });

  it("fails with stream_interrupted when the connection breaks mid-stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.error(new Error("socket closed"));
            },
          }),
          { status: 200 },
        ),
      ),
    );
    const session = openaiProvider.initialize({ apiKey: key });
    await expect(collect(session.streamText(request))).rejects.toMatchObject({
      code: "stream_interrupted",
    });
  });

  it("propagates cancellation as an AbortError", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(streamController) {
                const encoder = new TextEncoder();
                streamController.enqueue(
                  encoder.encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
                );
                init?.signal?.addEventListener(
                  "abort",
                  () => {
                    streamController.error(new DOMException("Aborted", "AbortError"));
                  },
                  { once: true },
                );
              },
            }),
            { status: 200 },
          ),
        ),
      ),
    );

    const session = openaiProvider.initialize({ apiKey: key });
    const iterator = session
      .streamText({ ...request, signal: controller.signal })
      [Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ value: "partial", done: false });
    controller.abort();
    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" });
  });

  it("retries once without stream_options when a compatible server rejects it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "Unsupported parameter: stream_options" } }, 400),
      )
      .mockResolvedValueOnce(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"fallback"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const session = openaiProvider.initialize({ apiKey: key });
    const events = await collect(session.streamTextEvents!(request));
    expect(events).toEqual([{ type: "text", text: "fallback" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retried = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(retried["stream_options"]).toBeUndefined();
    expect(retried["stream"]).toBe(true);
  });

  it("rejects an empty or malformed model id before any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const session = openaiProvider.initialize({ apiKey: key });
    await expect(session.generateText({ ...request, model: "  " })).rejects.toMatchObject({
      code: "invalid_request",
    });
    await expect(session.generateText({ ...request, model: "bad model id" })).rejects.toMatchObject(
      { code: "invalid_request" },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("SSE parser", () => {
  it("reassembles an event split across reads and both line endings", () => {
    const parser = new SseParser();
    const encoded = new TextEncoder();
    expect(parser.push(encoded.encode('data: {"a":'))).toEqual([]);
    expect(parser.push(encoded.encode("1}\r\n\r\n"))).toEqual(['{"a":1}']);
  });

  it("returns several events from a single read", () => {
    const parser = new SseParser();
    const events = parser.push(new TextEncoder().encode("data: one\n\ndata: two\n\n"));
    expect(events).toEqual(["one", "two"]);
  });

  it("emits a final event that has no trailing blank line", () => {
    const parser = new SseParser();
    expect(parser.push(new TextEncoder().encode("data: last"))).toEqual([]);
    expect(parser.push(undefined, true)).toEqual(["last"]);
  });

  it("keeps a multi-byte character split across reads intact", () => {
    const parser = new SseParser();
    const bytes = new TextEncoder().encode('data: {"t":"日本語"}\n\n');
    const splitAt = 14; // inside the multi-byte sequence
    expect(parser.push(bytes.slice(0, splitAt))).toEqual([]);
    expect(parser.push(bytes.slice(splitAt))).toEqual(['{"t":"日本語"}']);
  });

  it("joins multi-line data fields and ignores comments and other fields", () => {
    const parser = new SseParser();
    const events = parser.push(
      new TextEncoder().encode(": keepalive\nevent: message\nid: 7\ndata: line1\ndata: line2\n\n"),
    );
    expect(events).toEqual(["line1\nline2"]);
  });

  it("handles bare CR line endings", () => {
    const parser = new SseParser();
    const encoded = new TextEncoder();
    // A trailing bare CR is held back until the stream ends, because it may be
    // the first half of a CRLF pair split across reads.
    expect(parser.push(encoded.encode("data: cr\r\rdata: next\r\r"))).toEqual(["cr"]);
    expect(parser.push(undefined, true)).toEqual(["next"]);
  });
});

describe("model capability catalogue", () => {
  it.each([
    ["gpt-4.1-mini", "chat"],
    ["gpt-4o", "chat"],
    ["o4-mini", "chat"],
    ["deepseek-v4.1-flash-free", "chat"],
    ["meta-llama/llama-3.3-70b-instruct", "chat"],
    ["qwen2.5-72b-instruct", "chat"],
    ["mistral-large-latest", "chat"],
    ["totally-new-model", "unknown"],
    ["text-embedding-3-small", "unsupported"],
    ["whisper-1", "unsupported"],
    ["tts-1", "unsupported"],
    ["dall-e-3", "unsupported"],
    ["omni-moderation-latest", "unsupported"],
    ["", "unsupported"],
  ] as const)("classifies %s as %s", (id, expected) => {
    expect(classifyModelId(id)).toBe(expected);
  });

  it("derives a readable label without inventing metadata", () => {
    expect(prettifyModelId("deepseek-v4.1-flash-free")).toBe("Deepseek V4.1 Flash Free");
    expect(prettifyModelId("meta-llama/llama-3-70b")).toBe("Llama 3 70b");
  });

  it("gates sampling parameters for reasoning models only", () => {
    expect(supportsSamplingParameters("o4-mini")).toBe(false);
    expect(supportsSamplingParameters("gpt-4.1-mini")).toBe(true);
  });
});

describe("endpoint validation", () => {
  it("accepts HTTPS endpoints and local loopback HTTP", () => {
    expect(normalizeBaseUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1");
    expect(normalizeBaseUrl("https://100milionseek.top/v1")).toBe("https://100milionseek.top/v1");
    expect(normalizeBaseUrl("http://localhost:11434/v1")).toBe("http://localhost:11434/v1");
    expect(normalizeBaseUrl("http://127.0.0.1:1234/v1")).toBe("http://127.0.0.1:1234/v1");
  });

  it.each([
    ["http://api.example.com/v1"],
    ["https://192.168.1.10/v1"],
    ["https://10.0.0.5/v1"],
    ["https://172.16.0.1/v1"],
    ["https://169.254.169.254/latest"],
    ["https://metadata.google.internal/v1"],
    ["ftp://example.com/v1"],
    ["https://user:secret@example.com/v1"],
    ["not a url"],
  ])("rejects unsafe or malformed endpoint %s", (value) => {
    expect(() => normalizeBaseUrl(value)).toThrowError(ProviderError);
  });

  it("strips a query string and fragment so they cannot smuggle parameters", () => {
    expect(normalizeBaseUrl("https://api.example.com/v1?key=abc#frag")).toBe(
      "https://api.example.com/v1",
    );
  });
});

describe("shared error normalization stays provider-agnostic", () => {
  it("keeps Gemini's existing mapping intact", () => {
    expect(normalizeProviderError("gemini", 429, "RESOURCE_EXHAUSTED quota").code).toBe(
      "quota_exceeded",
    );
    expect(normalizeProviderError("gemini", 401).code).toBe("invalid_api_key");
  });
});

describe("compatible provider relay mode", () => {
  const relayConfig = {
    id: "openai-compatible:proxied",
    displayName: "Proxied",
    baseUrl: "https://api.example.com/v1",
    proxyBasePath: "/api/compat",
  };

  it("targets the same-origin relay and sends the upstream in a header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const session = createOpenAiCompatibleProvider(relayConfig).initialize({ apiKey: key });
    await session.listModels();

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/compat/models");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-compat-upstream")).toBe("https://api.example.com/v1");
    expect(headers.get("authorization")).toBe(`Bearer ${key}`);
  });

  it("routes streaming through the relay too", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse(['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n', "data: [DONE]\n\n"]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const session = createOpenAiCompatibleProvider(relayConfig).initialize({ apiKey: key });
    await collect(session.streamText({ ...request, model: "gpt-4.1-mini" }));

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/compat/chat/completions");
  });

  it("honours custom paths when relaying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const session = createOpenAiCompatibleProvider({
      ...relayConfig,
      modelsPath: "/custom/models",
      chatCompletionsPath: "/custom/chat",
    }).initialize({ apiKey: key });
    await session.listModels();

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/compat/custom/models");
  });

  it("calls the endpoint directly when no relay is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const session = createOpenAiCompatibleProvider({
      id: "openai-compatible:direct",
      displayName: "Direct",
      baseUrl: "https://api.example.com/v1",
    }).initialize({ apiKey: key });
    await session.listModels();

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example.com/v1/models");
    expect(new Headers(init?.headers).get("x-compat-upstream")).toBeNull();
  });
});
