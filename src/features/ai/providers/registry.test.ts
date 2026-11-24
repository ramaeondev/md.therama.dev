import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStarterState } from "@/features/workspace/model";
import { indexedDbStorage } from "@/features/workspace/storage";
import { deleteAppDatabase, resetAppDatabaseConnection } from "@/lib/indexedDb";
import { streamAssistantReplyEvents } from "../assistant/chatService";
import { listConversations, listMessages } from "../assistant/conversationStore";
import { ProviderError } from "../providers/errors";
import { createDefaultProviderRegistry, providerRegistry } from "../providers";
import { geminiProvider } from "../providers/gemini";
import { openaiProvider } from "../providers/openai";
import {
  createOpenAiCompatibleProvider,
  openAiCompatibleProviderId,
} from "../providers/openaiCompatible";
import {
  connectGemini,
  connectProvider,
  disconnectAllProviders,
  disconnectProvider,
  ensureCustomProvidersLoaded,
  getActiveProviderId,
  listConnectedProviders,
  removeCustomProvider,
  resolveActiveProviderSession,
  resetCustomProvidersForTests,
  saveCustomProvider,
  setActiveProvider,
  testProviderConnection,
} from "../settings/providerConfiguration";
import { listUsageRecords } from "../usage/usageStore";

const geminiKey = "gemini-secret-key";
const openAiKey = "sk-openai-secret-key";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sseResponse(payloads: string[]) {
  const encoded = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const payload of payloads) controller.enqueue(encoded.encode(payload));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

const geminiModels = {
  models: [
    {
      name: "models/gemini-test",
      displayName: "Gemini Test",
      supportedGenerationMethods: ["generateContent", "streamGenerateContent"],
    },
  ],
};
const openAiModels = { data: [{ id: "gpt-4.1-mini" }, { id: "text-embedding-3-small" }] };

/** Routes mocked responses by expected host so both providers can coexist. */
function dualFetchMock() {
  return vi.fn().mockImplementation((url: string) => {
    const target = String(url);
    if (target.includes("generativelanguage.googleapis.com")) {
      if (target.includes("streamGenerateContent")) {
        return Promise.resolve(
          sseResponse([
            'data: {"candidates":[{"content":{"parts":[{"text":"Gemini reply"}]}}]}\n\n',
          ]),
        );
      }
      return Promise.resolve(jsonResponse(geminiModels));
    }
    if (target.includes("chat/completions")) {
      return Promise.resolve(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"OpenAI reply"}}]}\n\n',
          'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    }
    if (target.includes("/models")) return Promise.resolve(jsonResponse(openAiModels));
    return Promise.resolve(jsonResponse({}, 404));
  });
}

async function collect(iterable: AsyncIterable<{ type: string; text?: string }>) {
  const events: Array<{ type: string; text?: string }> = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe("Provider registry with OpenAI", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    disconnectAllProviders();
    resetCustomProvidersForTests();
    resetAppDatabaseConnection();
    await deleteAppDatabase();
  });

  it("registers both built-in adapters and resolves each independently", () => {
    const registry = createDefaultProviderRegistry();
    expect(registry.resolve("gemini")).toBe(geminiProvider);
    expect(registry.resolve("openai")).toBe(openaiProvider);
    expect(registry.list().map((provider) => provider.descriptor.id)).toEqual(["gemini", "openai"]);
    expect(() => registry.resolve("missing")).toThrowError(ProviderError);
  });

  it("keeps the default registry free of duplicate registration", () => {
    // The module-level registry is built once; a second default must not mutate it.
    expect(providerRegistry.list().map((provider) => provider.descriptor.id)).toEqual([
      "gemini",
      "openai",
    ]);
    expect(() => providerRegistry.register(openaiProvider)).toThrow(/already registered/);
  });

  it("connects Gemini and OpenAI simultaneously and switches the active provider", async () => {
    vi.stubGlobal("fetch", dualFetchMock());

    await connectProvider("gemini", geminiKey);
    expect(getActiveProviderId()).toBe("gemini");

    await connectProvider("openai", openAiKey);
    expect(getActiveProviderId()).toBe("openai");
    // Both credentials stay live; connecting one must not disconnect the other.
    expect(
      listConnectedProviders()
        .map((entry) => entry.providerId)
        .sort(),
    ).toEqual(["gemini", "openai"]);

    setActiveProvider("gemini");
    expect(resolveActiveProviderSession().providerId).toBe("gemini");
    setActiveProvider("openai");
    expect(resolveActiveProviderSession().providerId).toBe("openai");
  });

  it("isolates credentials: each session sends only its own key", async () => {
    const fetchMock = dualFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    await connectProvider("gemini", geminiKey);
    await connectProvider("openai", openAiKey);

    setActiveProvider("openai");
    await collect(
      streamAssistantReplyEvents({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: "hi" }],
        signal: new AbortController().signal,
      }),
    );

    setActiveProvider("gemini");
    await collect(
      streamAssistantReplyEvents({
        model: "gemini-test",
        messages: [{ role: "user", content: "hi" }],
        signal: new AbortController().signal,
      }),
    );

    const calls = fetchMock.mock.calls.map((call) => ({
      url: String(call[0]),
      headers: new Headers(call[1]?.headers),
    }));
    const geminiCall = calls.find((call) => call.url.includes("generativelanguage"));
    const openAiCall = calls.find((call) => call.url.includes("openai.com"));

    expect(geminiCall?.headers.get("x-goog-api-key")).toBe(geminiKey);
    expect(geminiCall?.headers.get("authorization")).toBeNull();
    expect(openAiCall?.headers.get("authorization")).toBe(`Bearer ${openAiKey}`);
    expect(openAiCall?.headers.get("x-goog-api-key")).toBeNull();
  });

  it("lets one provider fail without affecting the other", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes("api.openai.com"))
          return Promise.resolve(jsonResponse({ error: { message: "bad key" } }, 401));
        return Promise.resolve(jsonResponse(geminiModels));
      }),
    );

    await connectProvider("gemini", geminiKey);
    await expect(connectProvider("openai", "wrong")).rejects.toMatchObject({
      code: "invalid_api_key",
    });

    expect(getActiveProviderId()).toBe("gemini");
    expect(listConnectedProviders().map((entry) => entry.providerId)).toEqual(["gemini"]);
  });

  it("never reuses another provider's key when switching", async () => {
    vi.stubGlobal("fetch", dualFetchMock());
    await connectProvider("gemini", geminiKey);
    await connectProvider("openai", openAiKey);

    disconnectProvider("openai");
    expect(() => setActiveProvider("openai")).toThrowError(
      expect.objectContaining({ code: "invalid_api_key" }),
    );
    // The surviving provider keeps working.
    expect(resolveActiveProviderSession().providerId).toBe("gemini");
  });
});

describe("Assistant across providers", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    disconnectAllProviders();
    resetCustomProvidersForTests();
    resetAppDatabaseConnection();
    await deleteAppDatabase();
  });

  it("streams a Gemini reply, then continues the same history on OpenAI", async () => {
    vi.stubGlobal("fetch", dualFetchMock());
    await connectProvider("gemini", geminiKey);
    await connectProvider("openai", openAiKey);
    // Connecting a provider makes it active; select Gemini for the first turn.
    setActiveProvider("gemini");

    const first = await collect(
      streamAssistantReplyEvents({
        model: "gemini-test",
        messages: [{ role: "user", content: "Explain Angular Signals." }],
        signal: new AbortController().signal,
        conversationId: "conversation-shared",
      }),
    );
    expect(first.filter((event) => event.type === "text")).toEqual([
      { type: "text", text: "Gemini reply" },
    ]);

    // Switching provider mid-conversation is just a session selection change.
    setActiveProvider("openai");
    const second = await collect(
      streamAssistantReplyEvents({
        model: "gpt-4.1-mini",
        messages: [
          { role: "user", content: "Explain Angular Signals." },
          { role: "assistant", content: "Gemini reply" },
          { role: "user", content: "Give me an example." },
        ],
        signal: new AbortController().signal,
        conversationId: "conversation-shared",
      }),
    );
    expect(second.filter((event) => event.type === "text")).toEqual([
      { type: "text", text: "OpenAI reply" },
    ]);

    const done = second.at(-1);
    expect(done).toMatchObject({
      type: "done",
      providerId: "openai",
      modelId: "gpt-4.1-mini",
      usage: { totalTokens: 7 },
    });

    const records = await listUsageRecords();
    // Newest first, but records written in the same millisecond are tiebroken by
    // a random ID, so compare as a set of provider/model pairs.
    expect(records.map((record) => [record.providerId, record.modelId]).sort()).toEqual([
      ["gemini", "gemini-test"],
      ["openai", "gpt-4.1-mini"],
    ]);
    const openAiRecord = records.find((record) => record.providerId === "openai");
    const geminiRecord = records.find((record) => record.providerId === "gemini");
    // Provider-reported usage is only claimed where the provider reported it.
    expect(openAiRecord).toMatchObject({
      status: "completed",
      usageSource: "provider_reported",
      inputTokens: 5,
      outputTokens: 2,
    });
    expect(geminiRecord).toMatchObject({ status: "completed", usageSource: "unavailable" });
  });

  it("records provider and model per assistant message across a provider switch", async () => {
    vi.stubGlobal("fetch", dualFetchMock());
    await connectProvider("gemini", geminiKey);
    await connectProvider("openai", openAiKey);
    const { createConversationForWorkspace, appendMessage } =
      await import("../assistant/conversationStore");
    const conversation = await createConversationForWorkspace({
      workspaceId: "w1",
      providerId: "gemini",
      modelId: "gemini-test",
    });
    await appendMessage({
      conversationId: conversation.id,
      role: "user",
      content: "First",
      status: "complete",
    });
    await appendMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: "Gemini reply",
      status: "complete",
      providerId: "gemini",
      modelId: "gemini-test",
    });
    await appendMessage({
      conversationId: conversation.id,
      role: "user",
      content: "Second",
      status: "complete",
    });
    await appendMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: "OpenAI reply",
      status: "complete",
      providerId: "openai",
      modelId: "gpt-4.1-mini",
    });

    const messages = await listMessages(conversation.id);
    expect(
      messages
        .filter((message) => message.role === "assistant")
        .map((message) => [message.providerId, message.modelId]),
    ).toEqual([
      ["gemini", "gemini-test"],
      ["openai", "gpt-4.1-mini"],
    ]);
    // The conversation reflects the most recent reply's provider.
    const [stored] = await listConversations("w1");
    expect(stored).toMatchObject({ providerId: "openai", modelId: "gpt-4.1-mini" });
  });

  it("keeps Gemini-only flows working through the legacy connectGemini helper", async () => {
    vi.stubGlobal("fetch", dualFetchMock());
    const { models, connection } = await connectGemini(geminiKey);
    expect(connection.connected).toBe(true);
    expect(models.map((model) => model.id)).toEqual(["gemini-test"]);
    const refreshed = await testProviderConnection("gemini");
    expect(refreshed.connection.availableModelCount).toBe(1);
  });
});

describe("Custom OpenAI-compatible providers", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    disconnectAllProviders();
    resetCustomProvidersForTests();
    resetAppDatabaseConnection();
    await deleteAppDatabase();
  });

  it("builds stable, registry-unique instance IDs from a display name", () => {
    expect(openAiCompatibleProviderId("100milionseek")).toBe("openai-compatible:100milionseek");
    expect(
      openAiCompatibleProviderId("My Local Server", ["openai-compatible:my-local-server"]),
    ).toBe("openai-compatible:my-local-server-2");
  });

  it("connects 100milionseek through a custom base URL and streams a reply", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const target = String(url);
      if (target.includes("/chat/completions")) {
        return Promise.resolve(
          sseResponse([
            'data: {"choices":[{"delta":{"content":"Hello from "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"DeepSeek"}}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":4,"total_tokens":7}}\n\n',
            "data: [DONE]\n\n",
          ]),
        );
      }
      return Promise.resolve(
        jsonResponse({ data: [{ id: "deepseek-v4.1-flash-free" }, { id: "deepseek-embed" }] }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const providerId = openAiCompatibleProviderId("100milionseek");
    await saveCustomProvider({
      id: providerId,
      displayName: "100milionseek",
      baseUrl: "https://100milionseek.top/v1",
    });

    const { models, connection } = await connectProvider(providerId, "compatible-secret");
    expect(connection.connected).toBe(true);
    expect(models.map((model) => model.id)).toEqual(["deepseek-v4.1-flash-free"]);

    const events = await collect(
      streamAssistantReplyEvents({
        model: "deepseek-v4.1-flash-free",
        messages: [{ role: "user", content: "Hello" }],
        signal: new AbortController().signal,
      }),
    );
    expect(events.filter((event) => event.type === "text")).toEqual([
      { type: "text", text: "Hello from " },
      { type: "text", text: "DeepSeek" },
    ]);

    const streamCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/chat/completions"),
    );
    expect(String(streamCall?.[0])).toBe("https://100milionseek.top/v1/chat/completions");
    expect(new Headers(streamCall?.[1]?.headers).get("authorization")).toBe(
      "Bearer compatible-secret",
    );

    const [record] = await listUsageRecords();
    expect(record).toMatchObject({
      providerId,
      modelId: "deepseek-v4.1-flash-free",
      usageSource: "provider_reported",
      totalTokens: 7,
    });
  });

  it("persists the definition but never the API key", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(jsonResponse({ data: [{ id: "gpt-4.1-mini" }] })),
        ),
    );
    const providerId = openAiCompatibleProviderId("Private gateway");
    await saveCustomProvider({
      id: providerId,
      displayName: "Private gateway",
      baseUrl: "https://gateway.example.com/v1",
    });
    await connectProvider(providerId, "super-secret-compatible-key");

    const definitions = await ensureCustomProvidersLoaded();
    expect(definitions).toEqual([
      expect.objectContaining({ id: providerId, baseUrl: "https://gateway.example.com/v1" }),
    ]);

    const state = createStarterState();
    state.preferences.aiProviderId = providerId;
    state.preferences.aiModelId = "gpt-4.1-mini";
    await indexedDbStorage.save(state);
    const saved = await indexedDbStorage.load();
    expect(saved?.preferences).toMatchObject({
      aiProviderId: providerId,
      aiModelId: "gpt-4.1-mini",
    });
    expect(JSON.stringify(saved)).not.toContain("super-secret-compatible-key");
    expect(JSON.stringify(definitions)).not.toContain("super-secret-compatible-key");
  });

  it("registers saved instances on load so they survive a reload", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(jsonResponse({ data: [{ id: "gpt-4.1-mini" }] })),
        ),
    );
    const providerId = openAiCompatibleProviderId("Durable");
    await saveCustomProvider({
      id: providerId,
      displayName: "Durable",
      baseUrl: "https://durable.example.com/v1",
    });

    // Simulate a reload: forget in-memory state, then reload from storage.
    resetCustomProvidersForTests();
    providerRegistry.unregister(providerId);
    expect(providerRegistry.has(providerId)).toBe(false);

    const loaded = await ensureCustomProvidersLoaded();
    expect(loaded.map((entry) => entry.id)).toEqual([providerId]);
    expect(providerRegistry.has(providerId)).toBe(true);
  });

  it("removes an instance and its adapter", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(jsonResponse({ data: [{ id: "gpt-4.1-mini" }] })),
        ),
    );
    const providerId = openAiCompatibleProviderId("Temporary");
    await saveCustomProvider({
      id: providerId,
      displayName: "Temporary",
      baseUrl: "https://temp.example.com/v1",
    });
    await removeCustomProvider(providerId);

    expect(providerRegistry.has(providerId)).toBe(false);
    expect(await ensureCustomProvidersLoaded()).toEqual([]);
  });

  it("rejects an unsafe endpoint when the instance is created", () => {
    expect(() =>
      createOpenAiCompatibleProvider({
        id: "openai-compatible:unsafe",
        displayName: "Unsafe",
        baseUrl: "http://internal.example.com/v1",
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_request" }));
  });

  it("skips a stored instance whose endpoint no longer validates", async () => {
    // Write a definition directly through storage to simulate corruption.
    const { indexedDbCustomProviderStorage } = await import("../settings/customProviderStorage");
    await indexedDbCustomProviderStorage.save([
      { id: "openai-compatible:good", displayName: "Good", baseUrl: "https://good.example.com/v1" },
      { id: "openai-compatible:bad", displayName: "Bad", baseUrl: "http://169.254.169.254/v1" },
    ]);

    const loaded = await ensureCustomProvidersLoaded();
    expect(loaded.map((entry) => entry.id)).toEqual([
      "openai-compatible:good",
      "openai-compatible:bad",
    ]);
    expect(providerRegistry.has("openai-compatible:good")).toBe(true);
    // An unsafe stored endpoint never becomes a live adapter.
    expect(providerRegistry.has("openai-compatible:bad")).toBe(false);
  });
});
