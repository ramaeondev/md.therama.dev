import { ProviderError } from "./errors";
import type { AIProvider } from "./types";

export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    const id = provider.descriptor.id.trim();
    if (!id) throw new Error("A provider must have an id.");
    if (this.providers.has(id)) throw new Error(`Provider "${id}" is already registered.`);
    this.providers.set(id, provider);
  }

  resolve(id: string): AIProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new ProviderError(id, "unknown_provider", false);
    return provider;
  }

  list(): AIProvider[] {
    return [...this.providers.values()];
  }
}