import type { EmbeddingProvider } from "./types";
import { localEmbeddingProvider } from "./local/localEmbedding";

const providers = new Map<string, EmbeddingProvider>([
  [localEmbeddingProvider.id, localEmbeddingProvider],
]);

export const embeddingRegistry = {
  register(provider: EmbeddingProvider) {
    providers.set(provider.id, provider);
  },
  resolve(providerId = localEmbeddingProvider.id) {
    const provider = providers.get(providerId);
    if (!provider) throw new Error(`Embedding provider is not registered: ${providerId}`);
    return provider;
  },
  list() {
    return [...providers.values()];
  },
};
