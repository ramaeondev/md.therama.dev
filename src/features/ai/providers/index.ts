import { geminiProvider } from "./gemini";
import { ProviderRegistry } from "./registry";

export * from "./errors";
export * from "./gemini";
export * from "./registry";
export * from "./types";

export function createDefaultProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(geminiProvider);
  return registry;
}

export const providerRegistry = createDefaultProviderRegistry();