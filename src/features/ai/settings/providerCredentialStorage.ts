import { APP_META_STORE, getAppDatabase, requestToPromise, transactionDone } from "@/lib/indexedDb";

import type { ProviderModel } from "../providers/types";

/**
 * Persists the BYOK credential for each connected provider so a page reload
 * keeps the provider connected until the user clears it.
 *
 * This is deliberately separate from workspace storage: a credential never
 * enters the `workspace-state` document, a workspace export, or a provider
 * adapter. It lives in the existing `app-meta` key/value store on this device
 * only, and every provider keeps its own record so one cannot be reused for
 * another.
 *
 * A key restored from here is used exactly like a freshly typed one: it is
 * handed to `AIProvider.initialize`, which retains it in a closure.
 */

const storeKey = "ai-provider-credentials";

export type StoredProviderCredential = {
  providerId: string;
  apiKey: string;
  /** Last discovered model list, so a reload can restore without a network call. */
  models: ProviderModel[];
  connectedAt: string;
};

export interface ProviderCredentialStorageAdapter {
  load(): Promise<StoredProviderCredential[]>;
  /** Inserts or replaces the record for one provider. */
  save(credential: StoredProviderCredential): Promise<void>;
  /** Updates a record that already exists, keeping its key. */
  update(
    providerId: string,
    changes: Partial<Pick<StoredProviderCredential, "models" | "connectedAt">>,
  ): Promise<void>;
  remove(providerId: string): Promise<void>;
  clear(): Promise<void>;
}

function sanitizeModel(value: unknown): ProviderModel | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record["id"] === "string" ? record["id"].trim() : "";
  const providerId = typeof record["providerId"] === "string" ? record["providerId"].trim() : "";
  if (!id || !providerId) return null;

  const capabilities = (
    record["capabilities"] && typeof record["capabilities"] === "object"
      ? (record["capabilities"] as Record<string, unknown>)
      : {}
  ) as Record<string, unknown>;

  return {
    id,
    providerId,
    displayName:
      typeof record["displayName"] === "string" && record["displayName"].trim()
        ? record["displayName"]
        : id,
    source: record["source"] === "fallback" ? "fallback" : "discovered",
    availability:
      record["availability"] === "unavailable"
        ? "unavailable"
        : record["availability"] === "unknown"
          ? "unknown"
          : "available",
    capabilities: {
      textGeneration: capabilities["textGeneration"] === true,
      streaming: capabilities["streaming"] === true,
    },
    ...(typeof record["contextWindowTokens"] === "number"
      ? { contextWindowTokens: record["contextWindowTokens"] }
      : {}),
    ...(typeof record["maxOutputTokens"] === "number"
      ? { maxOutputTokens: record["maxOutputTokens"] }
      : {}),
  };
}

function sanitize(value: unknown): StoredProviderCredential | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const providerId = typeof record["providerId"] === "string" ? record["providerId"].trim() : "";
  const apiKey = typeof record["apiKey"] === "string" ? record["apiKey"].trim() : "";
  if (!providerId || !apiKey) return null;
  const models = Array.isArray(record["models"])
    ? record["models"]
        .map((model) => sanitizeModel(model))
        .filter((model): model is ProviderModel => model !== null)
    : [];
  return {
    providerId,
    apiKey,
    models,
    connectedAt:
      typeof record["connectedAt"] === "string" ? record["connectedAt"] : new Date(0).toISOString(),
  };
}

async function readAll(): Promise<StoredProviderCredential[]> {
  const database = await getAppDatabase();
  const transaction = database.transaction(APP_META_STORE, "readonly");
  const record = (await requestToPromise(transaction.objectStore(APP_META_STORE).get(storeKey))) as
    { key: string; value?: unknown } | undefined;
  await transactionDone(transaction);
  return parseAll(record?.value);
}

function parseAll(value: unknown): StoredProviderCredential[] {
  const list = Array.isArray(value) ? value : [];
  const credentials: StoredProviderCredential[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const credential = sanitize(entry);
    if (!credential || seen.has(credential.providerId)) continue;
    seen.add(credential.providerId);
    credentials.push(credential);
  }
  return credentials;
}

/**
 * Reads, transforms, and writes the record list inside one readwrite
 * transaction, so another tab cannot interleave a write and lose a key.
 */
async function mutate(
  change: (credentials: StoredProviderCredential[]) => StoredProviderCredential[],
): Promise<void> {
  const database = await getAppDatabase();
  const transaction = database.transaction(APP_META_STORE, "readwrite");
  const store = transaction.objectStore(APP_META_STORE);
  const record = (await requestToPromise(store.get(storeKey))) as
    { key: string; value?: unknown } | undefined;
  store.put({ key: storeKey, value: change(parseAll(record?.value)) });
  await transactionDone(transaction);
}

/**
 * Serializes credential writes so a connect and a disconnect issued in either
 * order always leave the store matching the last action the user took.
 */
let pendingWrites: Promise<void> = Promise.resolve();

function enqueue(write: () => Promise<void>): Promise<void> {
  pendingWrites = pendingWrites.then(write, write).catch(() => undefined);
  return pendingWrites;
}

export const indexedDbProviderCredentialStorage: ProviderCredentialStorageAdapter = {
  load() {
    return enqueue(async () => {}).then(() => readAll());
  },
  save(credential) {
    return enqueue(() =>
      mutate((credentials) => [
        ...credentials.filter((entry) => entry.providerId !== credential.providerId),
        credential,
      ]),
    );
  },
  remove(providerId) {
    return enqueue(() =>
      mutate((credentials) => credentials.filter((entry) => entry.providerId !== providerId)),
    );
  },
  update(providerId, changes) {
    return enqueue(() =>
      mutate((credentials) =>
        credentials.map((entry) =>
          // Never revive a credential the user already cleared.
          entry.providerId === providerId ? { ...entry, ...changes } : entry,
        ),
      ),
    );
  },
  clear() {
    return enqueue(() => mutate(() => []));
  },
};

/** Test-only: resolve once every queued credential write has finished. */
export function flushProviderCredentialWrites(): Promise<void> {
  return enqueue(async () => {});
}
