import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteAppDatabase, resetAppDatabaseConnection } from "@/lib/indexedDb";
import { indexedDbCustomProviderStorage } from "../settings/customProviderStorage";
import {
  ensureCustomProvidersLoaded,
  resetCustomProvidersForTests,
  saveCustomProvider,
} from "../settings/providerConfiguration";

describe("provider definition durability", () => {
  beforeEach(async () => {
    await deleteAppDatabase();
    resetAppDatabaseConnection();
    resetCustomProvidersForTests();
    vi.restoreAllMocks();
  });

  it("does not wipe earlier providers when the first load failed", async () => {
    // A provider saved in an earlier session.
    await indexedDbCustomProviderStorage.save([
      {
        id: "openai-compatible:first",
        displayName: "First",
        baseUrl: "https://first.example.com/v1",
      },
    ]);

    // Page load: the first read fails (blocked by another tab, locked database,
    // Safari private mode). The app then caches "there are none".
    const loadSpy = vi
      .spyOn(indexedDbCustomProviderStorage, "load")
      .mockRejectedValueOnce(new Error("blocked"));
    const afterFailedLoad = await ensureCustomProvidersLoaded();
    loadSpy.mockRestore();
    console.log("AFTER FAILED LOAD:", JSON.stringify(afterFailedLoad));

    // The user now adds a second provider, without reloading the page.
    await saveCustomProvider({
      id: "openai-compatible:second",
      displayName: "Second",
      baseUrl: "https://second.example.com/v1",
    });

    const stored = await indexedDbCustomProviderStorage.load();
    console.log("STORED AFTER ADD:", JSON.stringify(stored.map((s) => s.id)));
    expect(stored.map((s) => s.id).sort()).toEqual([
      "openai-compatible:first",
      "openai-compatible:second",
    ]);
  });

  it("does not wipe earlier providers when a later save cannot read storage", async () => {
    await indexedDbCustomProviderStorage.save([
      {
        id: "openai-compatible:first",
        displayName: "First",
        baseUrl: "https://first.example.com/v1",
      },
    ]);

    // Load succeeds once, then a fresh load is forced while reads fail.
    await ensureCustomProvidersLoaded();
    resetCustomProvidersForTests();
    const loadSpy = vi
      .spyOn(indexedDbCustomProviderStorage, "load")
      .mockRejectedValueOnce(new Error("read failed"));
    await ensureCustomProvidersLoaded();
    loadSpy.mockRestore();

    await saveCustomProvider({
      id: "openai-compatible:second",
      displayName: "Second",
      baseUrl: "https://second.example.com/v1",
    });

    const stored = await indexedDbCustomProviderStorage.load();
    console.log("STORED AFTER SECOND TEST:", JSON.stringify(stored.map((s) => s.id)));
    expect(stored.map((s) => s.id).sort()).toEqual([
      "openai-compatible:first",
      "openai-compatible:second",
    ]);
  });
});
