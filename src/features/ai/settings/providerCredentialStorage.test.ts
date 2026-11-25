import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import { deleteAppDatabase, resetAppDatabaseConnection } from "@/lib/indexedDb";

import {
  flushProviderCredentialWrites,
  indexedDbProviderCredentialStorage,
} from "./providerCredentialStorage";

const geminiCredential = {
  providerId: "gemini",
  apiKey: "gemini-secret-key",
  models: [
    {
      id: "gemini-test",
      providerId: "gemini",
      displayName: "Gemini Test",
      source: "discovered" as const,
      availability: "available" as const,
      capabilities: { textGeneration: true, streaming: true },
    },
  ],
  connectedAt: "2026-11-24T10:00:00.000Z",
};

const openAiCredential = {
  providerId: "openai",
  apiKey: "sk-openai-secret-key",
  models: [],
  connectedAt: "2026-11-24T10:01:00.000Z",
};

describe("Provider credential storage", () => {
  beforeEach(async () => {
    resetAppDatabaseConnection();
    await deleteAppDatabase();
  });

  it("keeps one record per provider across a simulated reload", async () => {
    await indexedDbProviderCredentialStorage.save(geminiCredential);
    await indexedDbProviderCredentialStorage.save(openAiCredential);

    // A reload means a new database connection reading the same store.
    resetAppDatabaseConnection();
    const restored = await indexedDbProviderCredentialStorage.load();

    expect(restored.map((entry) => [entry.providerId, entry.apiKey])).toEqual([
      ["gemini", "gemini-secret-key"],
      ["openai", "sk-openai-secret-key"],
    ]);
    expect(restored[0]?.models.map((model) => model.id)).toEqual(["gemini-test"]);
  });

  it("replaces a provider's key on reconnect instead of adding a duplicate", async () => {
    await indexedDbProviderCredentialStorage.save(geminiCredential);
    await indexedDbProviderCredentialStorage.save({ ...geminiCredential, apiKey: "new-key" });

    const restored = await indexedDbProviderCredentialStorage.load();
    expect(restored).toHaveLength(1);
    expect(restored[0]?.apiKey).toBe("new-key");
  });

  it("removes only the disconnected provider's key", async () => {
    await indexedDbProviderCredentialStorage.save(geminiCredential);
    await indexedDbProviderCredentialStorage.save(openAiCredential);

    await indexedDbProviderCredentialStorage.remove("openai");

    const restored = await indexedDbProviderCredentialStorage.load();
    expect(restored.map((entry) => entry.providerId)).toEqual(["gemini"]);
  });

  it("clears every key", async () => {
    await indexedDbProviderCredentialStorage.save(geminiCredential);
    await indexedDbProviderCredentialStorage.save(openAiCredential);

    await indexedDbProviderCredentialStorage.clear();

    expect(await indexedDbProviderCredentialStorage.load()).toEqual([]);
  });

  it("refreshes cached models without touching the key", async () => {
    await indexedDbProviderCredentialStorage.save(geminiCredential);

    await indexedDbProviderCredentialStorage.update("gemini", {
      models: [],
      connectedAt: "2026-11-25T09:00:00.000Z",
    });

    const [restored] = await indexedDbProviderCredentialStorage.load();
    expect(restored).toMatchObject({
      providerId: "gemini",
      apiKey: "gemini-secret-key",
      connectedAt: "2026-11-25T09:00:00.000Z",
    });
    expect(restored?.models).toEqual([]);
  });

  it("never revives a key that was already cleared", async () => {
    await indexedDbProviderCredentialStorage.save(geminiCredential);
    await indexedDbProviderCredentialStorage.remove("gemini");

    await indexedDbProviderCredentialStorage.update("gemini", { models: [] });

    expect(await indexedDbProviderCredentialStorage.load()).toEqual([]);
  });

  it("drops records that have no usable key", async () => {
    const { APP_META_STORE, getAppDatabase, transactionDone } = await import("@/lib/indexedDb");
    const database = await getAppDatabase();
    const transaction = database.transaction(APP_META_STORE, "readwrite");
    transaction.objectStore(APP_META_STORE).put({
      key: "ai-provider-credentials",
      value: [
        { providerId: "gemini", apiKey: "   " },
        { providerId: "", apiKey: "orphan-key" },
        { providerId: "openai", apiKey: "sk-openai-secret-key", models: "not-a-list" },
        { providerId: "openai", apiKey: "sk-duplicate" },
      ],
    });
    await transactionDone(transaction);

    const restored = await indexedDbProviderCredentialStorage.load();
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ providerId: "openai", models: [] });
  });

  it("applies queued writes in the order the user acted", async () => {
    // A connect followed immediately by a disconnect must end disconnected.
    void indexedDbProviderCredentialStorage.save(geminiCredential);
    void indexedDbProviderCredentialStorage.remove("gemini");
    await flushProviderCredentialWrites();

    expect(await indexedDbProviderCredentialStorage.load()).toEqual([]);
  });
});
