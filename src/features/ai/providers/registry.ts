import { ProviderError } from "./errors";
import type { AIProvider } from "./types";

/**
 * Registers adapters by stable provider ID.
 *
 * The registry is the only place application code resolves a provider. Custom
 * OpenAI-compatible instances register here too, so the assistant, settings, and
 * usage tracking all treat them exactly like built-in providers.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    const id = provider.descriptor.id.trim();
    if (!id) throw new Error("A provider must have an id.");
    if (this.providers.has(id)) throw new Error(`Provider "${id}" is already registered.`);
    this.providers.set(id, provider);
  }

  /**
   * Adds or replaces an adapter. Only for user-created compatible instances
   * whose configuration can change, and for restoring them on reload; built-in
   * adapters stay guarded by `register`.
   */
  upsert(provider: AIProvider): void {
    const id = provider.descriptor.id.trim();
    if (!id) throw new Error("A provider must have an id.");
    this.providers.set(id, provider);
  }

  has(id: string): boolean {
    return this.providers.has(id.trim());
  }

  unregister(id: string): boolean {
    return this.providers.delete(id.trim());
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
