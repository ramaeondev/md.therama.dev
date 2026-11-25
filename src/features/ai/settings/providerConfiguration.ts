import { ProviderError } from "../providers/errors";
import { createOpenAiCompatibleProvider } from "../providers/openaiCompatible";
import { providerRegistry } from "../providers";
import type {
  AIProviderSession,
  ProviderConnectionResult,
  ProviderModel,
} from "../providers/types";
import {
  indexedDbCustomProviderStorage,
  type CustomProviderDefinition,
} from "./customProviderStorage";
import { indexedDbProviderCredentialStorage } from "./providerCredentialStorage";

export type { CustomProviderDefinition };

/**
 * Owns the provider sessions for this browser.
 *
 * Several providers can be connected at once. Each session keeps its own BYOK
 * key in a closure, so switching providers never reuses another provider's
 * credentials, and one provider's failure cannot affect another. The active
 * provider ID and its selected model are persisted through workspace
 * preferences.
 *
 * A credential is also written to this device's credential store so a page
 * reload keeps the provider connected, and it is removed only when the user
 * disconnects that provider (or removes its definition). Credentials never
 * enter workspace storage, a workspace export, a provider error, or a log.
 */

type ConnectedProvider = {
  providerId: string;
  displayName: string;
  models: ProviderModel[];
  connectedAt: string;
};

const sessions = new Map<string, AIProviderSession>();
/** The live key per provider, so its stored record stays in sync on restore. */
const credentials = new Map<string, string>();
const connected = new Map<string, ConnectedProvider>();
const activeRequests = new Set<AbortController>();
let activeProviderId: string | null = null;

/** Storage is best-effort: a private-mode failure must not break the session. */
function persistCredential(
  providerId: string,
  apiKey: string,
  models: ProviderModel[],
  connectedAt: string,
): void {
  void indexedDbProviderCredentialStorage
    .save({ providerId, apiKey, models, connectedAt })
    .catch(() => undefined);
}

function forgetStoredCredential(providerId: string): void {
  void indexedDbProviderCredentialStorage.remove(providerId).catch(() => undefined);
}

/** Display name for a provider, falling back to a readable instance label. */
export function providerDisplayName(providerId: string): string {
  if (providerRegistry.has(providerId))
    return providerRegistry.resolve(providerId).descriptor.displayName;
  return providerId;
}

async function createConnection(
  providerId: string,
  apiKey: string,
): Promise<{ models: ProviderModel[]; connection: ProviderConnectionResult; providerId: string }> {
  const provider = providerRegistry.resolve(providerId);
  const candidate = provider.initialize({ apiKey });
  // Validate before the session becomes active so a bad key leaves no half-state.
  const connection = await candidate.testConnection();
  const models = await candidate.listModels();

  // A reconnect replaces only this provider's session and stored key.
  disconnectProvider(provider.descriptor.id);
  sessions.set(provider.descriptor.id, candidate);
  credentials.set(provider.descriptor.id, apiKey);
  connected.set(provider.descriptor.id, {
    providerId: provider.descriptor.id,
    displayName: provider.descriptor.displayName,
    models,
    connectedAt: connection.checkedAt,
  });
  activeProviderId = provider.descriptor.id;
  persistCredential(provider.descriptor.id, apiKey, models, connection.checkedAt);
  return { models, connection, providerId: provider.descriptor.id };
}

/**
 * Connects any registered provider with a BYOK key and makes it active. Other
 * connected providers keep their sessions.
 */
export async function connectProvider(
  providerId: string,
  apiKey: string,
): Promise<{ models: ProviderModel[]; connection: ProviderConnectionResult; providerId: string }> {
  return createConnection(providerId, apiKey);
}

/** Re-checks an already connected provider without dropping its session. */
export async function testProviderConnection(providerId: string): Promise<{
  models: ProviderModel[];
  connection: ProviderConnectionResult;
}> {
  const session = sessions.get(providerId);
  if (!session) throw new ProviderError(providerId, "invalid_api_key", false);
  const connection = await session.testConnection();
  const models = await session.listModels();
  const entry = connected.get(providerId);
  if (entry) {
    connected.set(providerId, { ...entry, models, connectedAt: connection.checkedAt });
    // The key is unchanged, so refresh only the cached models and check time.
    void indexedDbProviderCredentialStorage
      .update(providerId, { models, connectedAt: connection.checkedAt })
      .catch(() => undefined);
  }
  return { models, connection };
}

/**
 * Disconnects one provider. This is the only path that erases a stored key, so
 * a reload keeps every other provider connected.
 */
export function disconnectProvider(providerId: string): void {
  const session = sessions.get(providerId);
  if (session) {
    for (const request of activeRequests) request.abort();
    activeRequests.clear();
  }
  sessions.delete(providerId);
  credentials.delete(providerId);
  connected.delete(providerId);
  forgetStoredCredential(providerId);
  if (activeProviderId === providerId) {
    // Keep another connected provider active rather than losing the selection.
    activeProviderId = [...connected.keys()][0] ?? null;
  }
}

export function disconnectGemini(): void {
  disconnectProvider("gemini");
}

/** Disconnects every provider and erases every stored key. */
export function disconnectAllProviders(): void {
  void clearAllProviderCredentials();
}

/** Clears every provider session and awaits removal of all saved BYOK keys. */
export async function clearAllProviderCredentials(): Promise<void> {
  for (const request of activeRequests) request.abort();
  resetProviderSessionsForTests();
  await indexedDbProviderCredentialStorage.clear();
}

/** Test-only: drop every in-memory session, keeping stored credentials. */
export function resetProviderSessionsForTests(): void {
  activeRequests.clear();
  sessions.clear();
  credentials.clear();
  connected.clear();
  activeProviderId = null;
}

/**
 * Restores providers from this device's credential store, typically on load.
 *
 * Cached models are used rather than a network call so a reload works offline
 * and instantly; a key the provider has since revoked surfaces as an error on
 * the next request or **Test**, not as a silent disconnection. When the
 * preferred provider (the one recorded in preferences) is among the restored
 * providers it becomes active; otherwise the first restored provider does.
 */
export async function restoreConnectedProviders(
  preferredProviderId: string | null = null,
): Promise<ConnectedProvider[]> {
  await ensureCustomProvidersLoaded();
  const stored = await indexedDbProviderCredentialStorage.load().catch(() => []);

  for (const entry of stored) {
    if (sessions.has(entry.providerId)) continue;
    if (!providerRegistry.has(entry.providerId)) continue;
    try {
      const provider = providerRegistry.resolve(entry.providerId);
      sessions.set(provider.descriptor.id, provider.initialize({ apiKey: entry.apiKey }));
      credentials.set(provider.descriptor.id, entry.apiKey);
      connected.set(provider.descriptor.id, {
        providerId: provider.descriptor.id,
        displayName: provider.descriptor.displayName,
        models: entry.models,
        connectedAt: entry.connectedAt,
      });
    } catch {
      // A stored key that no longer initializes is skipped, not fatal.
    }
  }

  activeProviderId =
    preferredProviderId && sessions.has(preferredProviderId)
      ? preferredProviderId
      : activeProviderId && sessions.has(activeProviderId)
        ? activeProviderId
        : ([...connected.keys()][0] ?? null);

  return listConnectedProviders();
}

/** Providers currently holding a credential, in connection order. */
export function listConnectedProviders(): ConnectedProvider[] {
  return [...connected.values()];
}

export function getConnectedProvider(providerId: string): ConnectedProvider | undefined {
  return connected.get(providerId);
}

export function getActiveProviderId(): string | null {
  return activeProviderId;
}

/**
 * Selects an already connected provider. Selecting a provider that has no
 * session is rejected so the assistant can never send a request without a key.
 */
export function setActiveProvider(providerId: string | null): void {
  if (providerId === null) {
    activeProviderId = null;
    return;
  }
  if (!sessions.has(providerId)) throw new ProviderError(providerId, "invalid_api_key", false);
  activeProviderId = providerId;
}

export function resolveActiveProviderSession(): AIProviderSession {
  if (!activeProviderId) throw new ProviderError("gemini", "invalid_api_key", false);
  const session = sessions.get(activeProviderId);
  if (!session) throw new ProviderError(activeProviderId, "invalid_api_key", false);
  const provider = providerRegistry.resolve(activeProviderId);
  if (provider.descriptor.id !== session.providerId) {
    throw new ProviderError(activeProviderId, "unknown_provider", false);
  }
  return session;
}

/** Test-only: true while a provider still holds its key in memory. */
export function hasProviderCredential(providerId: string): boolean {
  return credentials.has(providerId);
}

export function trackProviderRequest(controller: AbortController): () => void {
  activeRequests.add(controller);
  return () => activeRequests.delete(controller);
}

/* ------------------------------------------------------------------ *
 * Gemini helpers (kept so existing callers and tests are unchanged)
 * ------------------------------------------------------------------ */

export async function connectGemini(apiKey: string): Promise<{
  models: ProviderModel[];
  connection: ProviderConnectionResult;
}> {
  disconnectGemini();
  const { models, connection } = await createConnection("gemini", apiKey);
  return { models, connection };
}

export async function testGeminiConnection(): Promise<{
  models: ProviderModel[];
  connection: ProviderConnectionResult;
}> {
  const session = sessions.get("gemini");
  if (!session) throw new ProviderError("gemini", "invalid_api_key", false);
  return testProviderConnection("gemini");
}

/* ------------------------------------------------------------------ *
 * Custom OpenAI-compatible provider instances
 * ------------------------------------------------------------------ */

let customProvidersLoaded: Promise<CustomProviderDefinition[]> | null = null;

/**
 * Registers persisted compatible-provider definitions in the shared registry.
 * Idempotent; safe to await on every settings or chat interaction.
 */
export function ensureCustomProvidersLoaded(): Promise<CustomProviderDefinition[]> {
  if (!customProvidersLoaded) {
    customProvidersLoaded = indexedDbCustomProviderStorage
      .load()
      .then((definitions) => {
        for (const definition of definitions) {
          try {
            providerRegistry.upsert(createOpenAiCompatibleProvider(definition));
          } catch {
            // A stored endpoint that no longer validates is skipped, not fatal.
          }
        }
        return definitions;
      })
      .catch(() => {
        // A failed read is not the same as "there are none". Caching [] here
        // would make the next save treat an existing definition list as empty
        // and overwrite it, silently deleting every saved provider. Drop the
        // cache so the next caller retries the read instead.
        customProvidersLoaded = null;
        return [];
      });
  }
  return customProvidersLoaded;
}

export function listCustomProviderDefinitions(): Promise<CustomProviderDefinition[]> {
  return ensureCustomProvidersLoaded();
}

/**
 * Creates or updates a compatible provider instance. The credential is not part
 * of the definition and is not stored; connect it separately.
 */
export async function saveCustomProvider(definition: CustomProviderDefinition): Promise<void> {
  const provider = createOpenAiCompatibleProvider(definition);
  providerRegistry.upsert(provider);
  // Atomic read-modify-write: never derived from the in-memory cache, which may
  // be stale or may reflect a failed load.
  const next = await indexedDbCustomProviderStorage.upsert(definition);
  customProvidersLoaded = Promise.resolve(next);
}

/** Removes an instance, its session, and its saved definition. */
export async function removeCustomProvider(providerId: string): Promise<void> {
  disconnectProvider(providerId);
  providerRegistry.unregister(providerId);
  const next = await indexedDbCustomProviderStorage.remove(providerId);
  customProvidersLoaded = Promise.resolve(next);
}

/** Test-only: forget cached definitions and unregister their adapters. */
export function resetCustomProvidersForTests(): void {
  customProvidersLoaded = null;
}
