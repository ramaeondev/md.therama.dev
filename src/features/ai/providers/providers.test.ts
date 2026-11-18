import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeProviderError, ProviderError } from "./errors";
import { geminiProvider } from "./gemini";
import { ProviderRegistry } from "./registry";
import type { ProviderRequest } from "./types";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const request: ProviderRequest = {
  model: "gemini-test",
  messages: [{ role: "user", content: "Explain this note" }],
};

describe("AI provider foundation", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("registers and resolves adapters without coupling callers to provider implementations", () => {
    const registry = new ProviderRegistry();
    registry.register(geminiProvider);
    expect(registry.resolve("gemini")).toBe(geminiProvider);
    expect(registry.list().map((provider) => provider.descriptor.id)).toEqual(["gemini"]);
    expect(() => registry.resolve("missing")).toThrowError(ProviderError);
    expect(() => registry.register(geminiProvider)).toThrow(/already registered/);
  });

  it.each([
    [401, "", "invalid_api_key"],
    [429, "RATE_LIMIT", "rate_limited"],
    [429, "RESOURCE_EXHAUSTED quota", "quota_exceeded"],
    [undefined, "NETWORK_ERROR", "network_error"],
    [400, "input token limit exceeded", "context_length_exceeded"],
    [404, "", "unsupported_model"],
    [503, "", "provider_unavailable"],
  ] as const)("normalizes provider errors (%s)", (status, detail, expected) => {
    const error = normalizeProviderError("gemini", status, detail);
    expect(error.code).toBe(expected);
    if (detail) expect(error.message).not.toContain(detail);
  });

  it("keeps an empty API key out of a provider session", () => {
    expect(() => geminiProvider.initialize({ apiKey: "  " })).toThrowError(
      expect.objectContaining({ code: "invalid_api_key" }),
    );
  });

  it("discovers only generation-capable models and reports a successful connection", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse({
        models: [
          { name: "models/gemini-test", displayName: "Gemini Test", inputTokenLimit: 8000, outputTokenLimit: 1000, supportedGenerationMethods: ["generateContent", "streamGenerateContent"] },
          { name: "models/embed-test", supportedGenerationMethods: ["embedContent"] },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const session = geminiProvider.initialize({ apiKey: "test-key" });
    const models = await session.listModels();
    const connection = await session.testConnection();

    expect(models).toEqual([
      expect.objectContaining({ id: "gemini-test", displayName: "Gemini Test", source: "discovered", contextWindowTokens: 8000, maxOutputTokens: 1000, capabilities: { textGeneration: true, streaming: true } }),
    ]);
    expect(connection).toEqual(expect.objectContaining({ providerId: "gemini", connected: true, availableModelCount: 1 }));
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/models?");
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-goog-api-key")).toBe("test-key");
  });

  it("generates text and reports provider-supplied token usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "A clear summary." }] } }],
        usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 5, totalTokenCount: 16 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const session = geminiProvider.initialize({ apiKey: "test-key" });
    const result = await session.generateText({
      ...request,
      model: "models/gemini-test",
      systemInstruction: "Use the note as context.",
      temperature: 0.2,
    });

    expect(result).toEqual({ text: "A clear summary.", model: "gemini-test", usage: { inputTokens: 11, outputTokens: 5, totalTokens: 16, source: "provider_reported" } });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/models/gemini-test:generateContent");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { contents: Array<{ role: string }>; systemInstruction?: unknown; generationConfig?: { temperature?: number } };
    expect(body.contents[0]?.role).toBe("user");
    expect(body.systemInstruction).toBeDefined();
    expect(body.generationConfig?.temperature).toBe(0.2);
  });

  it("sends network failures through the normalized provider error contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const session = geminiProvider.initialize({ apiKey: "test-key" });
    await expect(session.listModels()).rejects.toMatchObject({ code: "network_error", retryable: false });
  });

  it("streams text from split server-sent event chunks", async () => {
    const encoded = new TextEncoder();
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"hello "}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"world"}]}}]}\n\n',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoded.encode(chunk));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const session = geminiProvider.initialize({ apiKey: "test-key" });
    const output: string[] = [];
    for await (const chunk of session.streamText(request)) output.push(chunk);

    expect(output).toEqual(["hello ", "world"]);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(":streamGenerateContent?alt=sse");
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-goog-api-key")).toBe("test-key");
  });

  it("does not leak provider response text through normalized errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 401, status: "UNAUTHENTICATED", message: "private-key-value rejected" } }, 401),
    );
    vi.stubGlobal("fetch", fetchMock);
    const session = geminiProvider.initialize({ apiKey: "private-key-value" });

    await expect(session.listModels()).rejects.toMatchObject({ code: "invalid_api_key" });
    await expect(session.listModels()).rejects.not.toThrow("private-key-value");
  });
});