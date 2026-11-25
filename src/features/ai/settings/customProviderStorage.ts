import { APP_META_STORE, getAppDatabase, requestToPromise, transactionDone } from "@/lib/indexedDb";

import { PROXY_BASE_PATH } from "../providers/shared/proxyProtocol";
import type { OpenAiCompatibleProviderConfig } from "../providers/openaiCompatible";

/**
 * Persists user-created OpenAI-compatible provider definitions.
 *
 * Only non-sensitive configuration is stored: display name, stable provider ID,
 * base URL, and optional endpoint paths. The API key is not part of a
 * definition; it has its own record in `providerCredentialStorage.ts`.
 *
 * The `app-meta` key/value store already exists, so no IndexedDB schema change is
 * needed for this.
 */

const storeKey = "ai-custom-providers";

export type CustomProviderDefinition = OpenAiCompatibleProviderConfig;

export interface CustomProviderStorageAdapter {
  load(): Promise<CustomProviderDefinition[]>;
  save(definitions: CustomProviderDefinition[]): Promise<void>;
  /**
   * Adds or replaces one definition without clobbering the others.
   *
   * The read and the write happen in a single transaction so a concurrent tab, a
   * failed earlier read, or an interrupted save can never drop a definition that
   * is already on disk.
   */
  upsert(definition: CustomProviderDefinition): Promise<CustomProviderDefinition[]>;
  /** Removes one definition, atomically, and returns what remains. */
  remove(id: string): Promise<CustomProviderDefinition[]>;
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
    ...(record["proxyBasePath"] === PROXY_BASE_PATH ? { proxyBasePath: PROXY_BASE_PATH } : {}),
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
    return readDefinitions(record?.value);
  },
  async save(definitions) {
    const database = await getAppDatabase();
    const transaction = database.transaction(APP_META_STORE, "readwrite");
    transaction.objectStore(APP_META_STORE).put({ key: storeKey, value: definitions });
    await transactionDone(transaction);
  },
  async upsert(definition) {
    // Read and write share one transaction: IndexedDB serialises readwrite
    // transactions on this store, so another tab cannot interleave a write
    // between them and lose a definition.
    const database = await getAppDatabase();
    const transaction = database.transaction(APP_META_STORE, "readwrite");
    const store = transaction.objectStore(APP_META_STORE);
    const record = (await requestToPromise(store.get(storeKey))) as
      { key: string; value?: unknown } | undefined;
    const current = readDefinitions(record?.value);
    const next = [...current.filter((entry) => entry.id !== definition.id), definition];
    store.put({ key: storeKey, value: next });
    await transactionDone(transaction);
    return next;
  },
  async remove(id) {
    const database = await getAppDatabase();
    const transaction = database.transaction(APP_META_STORE, "readwrite");
    const store = transaction.objectStore(APP_META_STORE);
    const record = (await requestToPromise(store.get(storeKey))) as
      { key: string; value?: unknown } | undefined;
    const next = readDefinitions(record?.value).filter((entry) => entry.id !== id);
    store.put({ key: storeKey, value: next });
    await transactionDone(transaction);
    return next;
  },
};

/** Normalizes a stored value, dropping malformed and duplicate entries. */
function readDefinitions(value: unknown): CustomProviderDefinition[] {
  const list = Array.isArray(value) ? value : [];
  const definitions: CustomProviderDefinition[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const definition = sanitize(entry);
    if (!definition || seen.has(definition.id)) continue;
    seen.add(definition.id);
    definitions.push(definition);
  }
  return definitions;
}
