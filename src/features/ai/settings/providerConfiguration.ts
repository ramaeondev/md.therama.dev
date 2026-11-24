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

export type { CustomProviderDefinition };

/**
 * Owns the in-memory provider sessions for this browser tab.
 *
 * Several providers can be connected at once. Each session keeps its own BYOK
 * key in a closure, so switching providers never reuses another provider's
 * credentials, and one provider's failure cannot affect another. Only the active
 * provider ID and its selected model are persisted (through workspace
 * preferences); no key is ever written to storage.
 */

type ConnectedProvider = {
  providerId: string;
  displayName: string;
  models: ProviderModel[];
  connectedAt: string;
};

const sessions = new Map<string, AIProviderSession>();
const connected = new Map<string, ConnectedProvider>();
const activeRequests = new Set<AbortController>();
let activeProviderId: string | null = null;

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

  // A reconnect replaces only this provider's session.
  disconnectProvider(provider.descriptor.id);
  sessions.set(provider.descriptor.id, candidate);
  connected.set(provider.descriptor.id, {
    providerId: provider.descriptor.id,
    displayName: provider.descriptor.displayName,
    models,
    connectedAt: connection.checkedAt,
  });
  activeProviderId = provider.descriptor.id;
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
  if (entry) connected.set(providerId, { ...entry, models, connectedAt: connection.checkedAt });
  return { models, connection };
}

/** Clears one provider's credential and aborts only its tracked requests. */
export function disconnectProvider(providerId: string): void {
  const session = sessions.get(providerId);
  if (session) {
    for (const request of activeRequests) request.abort();
    activeRequests.clear();
  }
  sessions.delete(providerId);
  connected.delete(providerId);
  if (activeProviderId === providerId) {
    // Keep another connected provider active rather than losing the selection.
    activeProviderId = [...connected.keys()][0] ?? null;
  }
}

export function disconnectGemini(): void {
  disconnectProvider("gemini");
}

export function disconnectAllProviders(): void {
  for (const request of activeRequests) request.abort();
  activeRequests.clear();
  sessions.clear();
  connected.clear();
  activeProviderId = null;
}

/** Providers currently holding an in-memory credential, in connection order. */
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
      .catch(() => []);
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
  const existing = await ensureCustomProvidersLoaded();
  const next = [...existing.filter((entry) => entry.id !== definition.id), definition];
  providerRegistry.upsert(provider);
  await indexedDbCustomProviderStorage.save(next);
  customProvidersLoaded = Promise.resolve(next);
}

/** Removes an instance, its session, and its saved definition. */
export async function removeCustomProvider(providerId: string): Promise<void> {
  const existing = await ensureCustomProvidersLoaded();
  disconnectProvider(providerId);
  providerRegistry.unregister(providerId);
  const next = existing.filter((entry) => entry.id !== providerId);
  await indexedDbCustomProviderStorage.save(next);
  customProvidersLoaded = Promise.resolve(next);
}

/** Test-only: forget cached definitions and unregister their adapters. */
export function resetCustomProvidersForTests(): void {
  customProvidersLoaded = null;
}
