import { ProviderError } from "../providers/errors";
import { providerRegistry } from "../providers";
import type { AIProviderSession, ProviderConnectionResult, ProviderModel } from "../providers/types";

let activeProviderId: string | null = null;
let activeSession: AIProviderSession | null = null;
const activeRequests = new Set<AbortController>();

export async function connectGemini(apiKey: string): Promise<{
  models: ProviderModel[];
  connection: ProviderConnectionResult;
}> {
  disconnectGemini();
  const provider = providerRegistry.resolve("gemini");
  const candidate = provider.initialize({ apiKey });
  const connection = await candidate.testConnection();
  const models = await candidate.listModels();
  activeProviderId = provider.descriptor.id;
  activeSession = candidate;
  return { models, connection };
}

export async function testGeminiConnection(): Promise<{
  models: ProviderModel[];
  connection: ProviderConnectionResult;
}> {
  const session = getGeminiSession();
  const connection = await session.testConnection();
  const models = await session.listModels();
  return { models, connection };
}

export function disconnectGemini(): void {
  for (const request of activeRequests) request.abort();
  activeRequests.clear();
  activeSession = null;
  activeProviderId = null;
}

export function resolveActiveProviderSession(): AIProviderSession {
  if (!activeProviderId || !activeSession) {
    throw new ProviderError("gemini", "invalid_api_key", false);
  }
  const provider = providerRegistry.resolve(activeProviderId);
  if (provider.descriptor.id !== activeSession.providerId) {
    throw new ProviderError(activeProviderId, "unknown_provider", false);
  }
  return activeSession;
}

export function trackProviderRequest(controller: AbortController): () => void {
  activeRequests.add(controller);
  return () => activeRequests.delete(controller);
}

function getGeminiSession(): AIProviderSession {
  const session = resolveActiveProviderSession();
  if (session.providerId !== "gemini") throw new ProviderError(session.providerId, "unknown_provider", false);
  return session;
}