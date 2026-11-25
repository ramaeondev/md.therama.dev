import { ProviderError } from "./errors";
import {
  createOpenAiCompatibleSession,
  normalizeBaseUrl,
  type OpenAiCompatibleConfig,
} from "./shared/openAiCompatible";
import type { AIProvider } from "./types";

/**
 * Generic OpenAI-compatible adapter.
 *
 * One adapter class serves any service that implements the OpenAI Chat
 * Completions format (100milionseek, OpenRouter, Groq, DeepSeek, Ollama, LM
 * Studio, vLLM, …). Each configured instance is created with its own stable
 * provider ID so registry resolution and usage tracking can tell instances
 * apart, while all of them reuse the shared transport.
 *
 * No OpenAI capability is assumed beyond Chat Completions: model discovery and
 * usage metadata are whatever the endpoint actually returns.
 */

export type OpenAiCompatibleProviderConfig = {
  /** Stable, registry-unique ID such as `openai-compatible:100milionseek`. */
  id: string;
  displayName: string;
  baseUrl: string;
  chatCompletionsPath?: string;
  modelsPath?: string;
  /**
   * Same-origin relay path used when the endpoint cannot be called from the
   * browser (no `Access-Control-Allow-Origin` on real responses).
   */
  proxyBasePath?: string;
};

const INSTANCE_ID_PREFIX = "openai-compatible:";

/** Builds the registry ID for a named compatible provider instance. */
export function openAiCompatibleProviderId(
  name: string,
  existingIds: readonly string[] = [],
): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "custom";
  const base = `${INSTANCE_ID_PREFIX}${slug}`;
  if (!existingIds.includes(base)) return base;
  let suffix = 2;
  while (existingIds.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function isOpenAiCompatibleInstanceId(providerId: string): boolean {
  return providerId.startsWith(INSTANCE_ID_PREFIX);
}

/** Human label for an instance ID, used when a prettier name is unavailable. */
export function openAiCompatibleInstanceLabel(providerId: string): string {
  if (!isOpenAiCompatibleInstanceId(providerId)) return providerId;
  const slug = providerId.slice(INSTANCE_ID_PREFIX.length);
  return (
    slug
      .replace(/-+/g, " ")
      .replace(/\b[a-z]/g, (character) => character.toUpperCase())
      .trim() || "Custom provider"
  );
}

/**
 * Creates a provider adapter for one configuration. The base URL is validated
 * here so an invalid or unsafe endpoint never becomes a registered adapter.
 */
export function createOpenAiCompatibleProvider(config: OpenAiCompatibleProviderConfig): AIProvider {
  const id = config.id.trim();
  if (!id) throw new ProviderError("openai-compatible", "invalid_request", false);

  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(config.baseUrl);
  } catch {
    throw new ProviderError(id, "invalid_request", false);
  }

  const sharedConfig: OpenAiCompatibleConfig = {
    providerId: id,
    baseUrl,
    apiKey: "",
    ...(config.chatCompletionsPath ? { chatCompletionsPath: config.chatCompletionsPath } : {}),
    ...(config.modelsPath ? { modelsPath: config.modelsPath } : {}),
    ...(config.proxyBasePath ? { proxyBasePath: config.proxyBasePath } : {}),
  };

  return {
    descriptor: {
      id,
      displayName: config.displayName.trim() || openAiCompatibleInstanceLabel(id),
      capabilities: ["model_discovery", "text_generation", "streaming"],
    },
    initialize(configuration) {
      const apiKey = configuration.apiKey.trim();
      if (!apiKey) throw new ProviderError(id, "invalid_api_key", false);
      return createOpenAiCompatibleSession({ ...sharedConfig, apiKey });
    },
  };
}
