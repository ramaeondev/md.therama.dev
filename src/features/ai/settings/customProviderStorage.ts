import { APP_META_STORE, getAppDatabase, requestToPromise, transactionDone } from "@/lib/indexedDb";

import type { OpenAiCompatibleProviderConfig } from "../providers/openaiCompatible";

/**
 * Persists user-created OpenAI-compatible provider definitions.
 *
 * Only non-sensitive configuration is stored: display name, stable provider ID,
 * base URL, and optional endpoint paths. An API key is never written here — it
 * lives only in an in-memory session, so a reload requires re-entering it.
 *
 * The `app-meta` key/value store already exists, so no IndexedDB schema change is
 * needed for this.
 */

const storeKey = "ai-custom-providers";

export type CustomProviderDefinition = OpenAiCompatibleProviderConfig;

export interface CustomProviderStorageAdapter {
  load(): Promise<CustomProviderDefinition[]>;
  save(definitions: CustomProviderDefinition[]): Promise<void>;
}

function sanitize(value: unknown): CustomProviderDefinition | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record["id"] === "string" ? record["id"].trim() : "";
  const baseUrl = typeof record["baseUrl"] === "string" ? record["baseUrl"].trim() : "";
  if (!id || !baseUrl) return null;
  const displayName = typeof record["displayName"] === "string" ? record["displayName"].trim() : "";
  return {
    id,
    displayName: displayName || id,
    baseUrl,
    ...(typeof record["chatCompletionsPath"] === "string" && record["chatCompletionsPath"]
      ? { chatCompletionsPath: record["chatCompletionsPath"] }
      : {}),
    ...(typeof record["modelsPath"] === "string" && record["modelsPath"]
      ? { modelsPath: record["modelsPath"] }
      : {}),
  };
}

export const indexedDbCustomProviderStorage: CustomProviderStorageAdapter = {
  async load() {
    const database = await getAppDatabase();
    const transaction = database.transaction(APP_META_STORE, "readonly");
    const record = (await requestToPromise(
      transaction.objectStore(APP_META_STORE).get(storeKey),
    )) as { key: string; value?: unknown } | undefined;
    await transactionDone(transaction);
    const list = Array.isArray(record?.value) ? record.value : [];
    const definitions: CustomProviderDefinition[] = [];
    const seen = new Set<string>();
    for (const entry of list) {
      const definition = sanitize(entry);
      if (!definition || seen.has(definition.id)) continue;
      seen.add(definition.id);
      definitions.push(definition);
    }
    return definitions;
  },
  async save(definitions) {
    const database = await getAppDatabase();
    const transaction = database.transaction(APP_META_STORE, "readwrite");
    transaction.objectStore(APP_META_STORE).put({ key: storeKey, value: definitions });
    await transactionDone(transaction);
  },
};
