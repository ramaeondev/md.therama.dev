export type ProviderErrorCode =
  | "invalid_api_key"
  | "quota_exceeded"
  | "rate_limited"
  | "network_error"
  | "unsupported_model"
  | "context_length_exceeded"
  | "provider_unavailable"
  | "stream_interrupted"
  | "invalid_request"
  | "unknown_provider"
  | "unknown";

const userMessages: Record<ProviderErrorCode, string> = {
  invalid_api_key: "The API key was rejected. Check the key and its API access.",
  quota_exceeded:
    "The provider quota is exhausted. Check the provider account's usage and billing limits.",
  rate_limited: "The provider is receiving too many requests. Wait a moment before trying again.",
  network_error:
    "Could not reach the AI provider. Check your connection, and check that the endpoint allows browser (CORS) requests.",
  unsupported_model: "That model is unavailable or does not support text generation.",
  context_length_exceeded: "This request is longer than the selected model allows.",
  provider_unavailable: "The AI provider is temporarily unavailable. Try again later.",
  stream_interrupted: "The response stream ended unexpectedly. Try the request again.",
  invalid_request: "The request is incomplete or contains unsupported options.",
  unknown_provider: "This AI provider is not registered.",
  unknown: "The AI provider could not complete the request.",
};

export class ProviderError extends Error {
  override readonly name = "ProviderError";

  constructor(
    readonly providerId: string,
    readonly code: ProviderErrorCode,
    readonly retryable: boolean,
    readonly statusCode?: number,
  ) {
    super(userMessages[code]);
  }
}

export function normalizeProviderError(
  providerId: string,
  statusCode?: number,
  providerCode?: string,
  providerMessage?: string,
): ProviderError {
  const codeText = `${providerCode ?? ""} ${providerMessage ?? ""}`.toLowerCase();
  let code: ProviderErrorCode = "unknown";

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    /api.?key|unauthenticated|permission_denied/.test(codeText)
  ) {
    code = "invalid_api_key";
  } else if (/quota|resource_exhausted/.test(codeText)) {
    code = "quota_exceeded";
  } else if (statusCode === 429) {
    code = "rate_limited";
  } else if (/network|fetch failed|connection/.test(codeText)) {
    code = "network_error";
  } else if (/context|token limit|too many tokens|input is too long/.test(codeText)) {
    code = "context_length_exceeded";
  } else if (statusCode === 404 || /model.*(not found|unsupported|unavailable)/.test(codeText)) {
    code = "unsupported_model";
  } else if (statusCode !== undefined && statusCode >= 500) {
    code = "provider_unavailable";
  } else if (statusCode === 400) {
    code = "invalid_request";
  }

  return new ProviderError(
    providerId,
    code,
    code === "rate_limited" || code === "provider_unavailable",
    statusCode,
  );
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}
