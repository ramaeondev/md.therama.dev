import { geminiProvider } from "./gemini";
import { openaiProvider } from "./openai";
import { ProviderRegistry } from "./registry";

export * from "./errors";
export * from "./gemini";
export * from "./openai";
export * from "./openaiCompatible";
export * from "./registry";
export * from "./types";

/**
 * Built-in native adapters. Custom OpenAI-compatible instances are added to the
 * same registry at runtime from their saved, non-sensitive configuration.
 */
export function createDefaultProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(geminiProvider);
  registry.register(openaiProvider);
  return registry;
}

export const providerRegistry = createDefaultProviderRegistry();
