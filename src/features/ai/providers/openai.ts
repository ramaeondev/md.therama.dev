import { ProviderError } from "./errors";
import { createOpenAiCompatibleSession, OPENAI_DEFAULT_BASE_URL } from "./shared/openAiCompatible";
import type { AIProvider } from "./types";

const PROVIDER_ID = "openai";

/**
 * Official OpenAI adapter (BYOK).
 *
 * This is a configuration of the shared Chat Completions transport: identity and
 * endpoint are fixed here, while request mapping, SSE parsing, usage
 * normalization, and error handling live in the shared module so the generic
 * OpenAI-compatible adapter behaves identically from the application's view.
 *
 * Chat Completions is used rather than the Responses API because it matches the
 * provider contract. Migrating later means changing this adapter only.
 */
export const openaiProvider: AIProvider = {
  descriptor: {
    id: PROVIDER_ID,
    displayName: "OpenAI",
    capabilities: ["model_discovery", "text_generation", "streaming"],
  },
  initialize(configuration) {
    const apiKey = configuration.apiKey.trim();
    if (!apiKey) throw new ProviderError(PROVIDER_ID, "invalid_api_key", false);
    return createOpenAiCompatibleSession({
      providerId: PROVIDER_ID,
      baseUrl: OPENAI_DEFAULT_BASE_URL,
      apiKey,
    });
  },
};
