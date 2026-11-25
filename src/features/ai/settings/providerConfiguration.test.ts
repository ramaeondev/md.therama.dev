import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteAppDatabase, resetAppDatabaseConnection } from "@/lib/indexedDb";

import { streamAssistantReplyEvents } from "../assistant/chatService";
import { ProviderError } from "../providers/errors";
import { providerRegistry } from "../providers";
import { openAiCompatibleProviderId } from "../providers/openaiCompatible";
import {
  connectProvider,
  disconnectAllProviders,
  disconnectProvider,
  getActiveProviderId,
  hasProviderCredential,
  listConnectedProviders,
  removeCustomProvider,
  resetProviderSessionsForTests,
  resolveActiveProviderSession,
  restoreConnectedProviders,
  saveCustomProvider,
  setActiveProvider,
} from "./providerConfiguration";
import { flushProviderCredentialWrites } from "./providerCredentialStorage";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sseResponse(text: string) {
  const encoded = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoded.encode(`data: {"choices":[{"delta":{"content":"${text}"}}]}\n\n`),
        );
        controller.enqueue(encoded.encode("data: [DONE]\n\n"));
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

/** Routes by host so both a built-in and a compatible provider can connect. */
function fetchMock(overrides?: (url: string) => Response | undefined) {
  return vi.fn().mockImplementation((url: string) => {
    const target = String(url);
    const override = overrides?.(target);
    if (override) return Promise.resolve(override);
    if (target.includes("generativelanguage.googleapis.com")) {
      return Promise.resolve(jsonResponse(geminiModels));
    }
    if (target.includes("/chat/completions")) return Promise.resolve(sseResponse("Hi"));
    return Promise.resolve(jsonResponse({ data: [{ id: "gpt-4.1-mini" }] }));
  });
}

async function collect(iterable: AsyncIterable<{ type: string; text?: string }>) {
  const events: Array<{ type: string; text?: string }> = [];
  for await (const event of iterable) events.push(event);
  return events;
}

/** Simulates a page reload: in-memory sessions vanish, storage stays. */
function simulateReload() {
  resetProviderSessionsForTests();
  resetAppDatabaseConnection();
}

describe("Provider credentials surviving a reload", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    disconnectAllProviders();
    await flushProviderCredentialWrites();
    resetAppDatabaseConnection();
    await deleteAppDatabase();
    resetProviderSessionsForTests();
  });

  it("restores a connected provider and its key after a reload", async () => {
    const fetch = fetchMock();
    vi.stubGlobal("fetch", fetch);
    await connectProvider("gemini", "gemini-secret-key");
    await flushProviderCredentialWrites();

    simulateReload();
    expect(listConnectedProviders()).toEqual([]);

    const restored = await restoreConnectedProviders("gemini");

    expect(restored.map((entry) => entry.providerId)).toEqual(["gemini"]);
    expect(getActiveProviderId()).toBe("gemini");
    expect(hasProviderCredential("gemini")).toBe(true);
    // The restored session still sends the original key.
    await collect(
      streamAssistantReplyEvents({
        model: "gemini-test",
        messages: [{ role: "user", content: "hi" }],
        signal: new AbortController().signal,
      }),
    );
    const call = fetch.mock.calls.find((entry) =>
      String(entry[0]).includes("streamGenerateContent"),
    );
    expect(new Headers(call?.[1]?.headers).get("x-goog-api-key")).toBe("gemini-secret-key");
  });

  it("restores every provider independently, with the preferred one active", async () => {
    vi.stubGlobal("fetch", fetchMock());
    const customId = openAiCompatibleProviderId("Reloaded gateway");
    await saveCustomProvider({
      id: customId,
      displayName: "Reloaded gateway",
      baseUrl: "https://gateway.example.com/v1",
    });
    await connectProvider("gemini", "gemini-secret-key");
    await connectProvider(customId, "compatible-secret");
    await flushProviderCredentialWrites();

    simulateReload();
    await restoreConnectedProviders("gemini");

    expect(
      listConnectedProviders()
        .map((entry) => entry.providerId)
        .sort(),
    ).toEqual(["gemini", customId].sort());
    expect(getActiveProviderId()).toBe("gemini");
    expect(resolveActiveProviderSession().providerId).toBe("gemini");
    setActiveProvider(customId);
    expect(resolveActiveProviderSession().providerId).toBe(customId);
  });

  it("keeps the provider disconnected after the user clears its key", async () => {
    vi.stubGlobal("fetch", fetchMock());
    await connectProvider("gemini", "gemini-secret-key");
    await flushProviderCredentialWrites();

    disconnectProvider("gemini");
    await flushProviderCredentialWrites();

    simulateReload();
    const restored = await restoreConnectedProviders("gemini");

    expect(restored).toEqual([]);
    expect(getActiveProviderId()).toBeNull();
    expect(() => setActiveProvider("gemini")).toThrowError(ProviderError);
  });

  it("keeps other providers connected when one is disconnected", async () => {
    vi.stubGlobal("fetch", fetchMock());
    await connectProvider("gemini", "gemini-secret-key");
    await connectProvider("openai", "sk-openai-secret-key");
    await flushProviderCredentialWrites();

    disconnectProvider("openai");
    await flushProviderCredentialWrites();

    simulateReload();
    const restored = await restoreConnectedProviders(null);

    expect(restored.map((entry) => entry.providerId)).toEqual(["gemini"]);
  });

  it("replaces the stored key only when the user reconnects", async () => {
    const fetch = fetchMock();
    vi.stubGlobal("fetch", fetch);
    await connectProvider("gemini", "first-key");
    await flushProviderCredentialWrites();
    await connectProvider("gemini", "second-key");
    await flushProviderCredentialWrites();

    simulateReload();
    await restoreConnectedProviders("gemini");
    await collect(
      streamAssistantReplyEvents({
        model: "gemini-test",
        messages: [{ role: "user", content: "hi" }],
        signal: new AbortController().signal,
      }),
    );

    const call = fetch.mock.calls.find((entry) =>
      String(entry[0]).includes("streamGenerateContent"),
    );
    expect(new Headers(call?.[1]?.headers).get("x-goog-api-key")).toBe("second-key");
  });

  it("does not store a key for a rejected connection", async () => {
    vi.stubGlobal(
      "fetch",
      fetchMock((url) => (url.includes("api.openai.com") ? jsonResponse({}, 401) : undefined)),
    );

    await expect(connectProvider("openai", "bad-key")).rejects.toMatchObject({
      code: "invalid_api_key",
    });
    await flushProviderCredentialWrites();

    simulateReload();
    expect(await restoreConnectedProviders("openai")).toEqual([]);
  });

  it("drops a stored provider whose adapter no longer exists", async () => {
    vi.stubGlobal("fetch", fetchMock());
    const customId = openAiCompatibleProviderId("Vanishing");
    await saveCustomProvider({
      id: customId,
      displayName: "Vanishing",
      baseUrl: "https://vanish.example.com/v1",
    });
    await connectProvider(customId, "compatible-secret");
    await flushProviderCredentialWrites();

    simulateReload();
    providerRegistry.unregister(customId);
    const restored = await restoreConnectedProviders(customId);

    expect(restored).toEqual([]);
  });

  it("removes a compatible provider's stored key with its definition", async () => {
    vi.stubGlobal("fetch", fetchMock());
    const customId = openAiCompatibleProviderId("Removable");
    await saveCustomProvider({
      id: customId,
      displayName: "Removable",
      baseUrl: "https://remove.example.com/v1",
    });
    await connectProvider(customId, "compatible-secret");
    await flushProviderCredentialWrites();

    await removeCustomProvider(customId);
    await flushProviderCredentialWrites();

    simulateReload();
    expect(await restoreConnectedProviders(customId)).toEqual([]);
  });
});
