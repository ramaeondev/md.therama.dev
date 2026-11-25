import { isAbortError, normalizeProviderError, ProviderError } from "../errors";
import type {
  AIProviderSession,
  ProviderConnectionResult,
  ProviderModel,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderTextResponse,
  ProviderUsage,
} from "../types";
import { classifyModelId, prettifyModelId, supportsSamplingParameters } from "./modelCatalog";
import { SseParser } from "./sseParser";

/**
 * Shared OpenAI Chat Completions transport.
 *
 * Both the official OpenAI adapter and the generic OpenAI-compatible adapter
 * are thin configurations over this module: they differ in base URL, default
 * endpoint paths, and identity, but share request mapping, SSE parsing, usage
 * extraction, and error normalization. Nothing here knows about React.
 */

export type OpenAiCompatibleConfig = {
  providerId: string;
  /** Base URL including the API version segment, e.g. https://api.openai.com/v1 */
  baseUrl: string;
  apiKey: string;
  /** Path appended to the base URL. Defaults to `/chat/completions`. */
  chatCompletionsPath?: string;
  /** Path appended to the base URL. Defaults to `/models`. */
  modelsPath?: string;
  /**
   * Routes requests through this app's same-origin relay instead of calling the
   * endpoint directly. Needed for services that omit `Access-Control-Allow-Origin`
   * on real responses, which a browser will not accept. When set, `baseUrl` is
   * sent in a header rather than being used as the request origin.
   */
  proxyBasePath?: string;
};

export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

/** Header carrying the real upstream when the relay is in use. */
export const PROXY_UPSTREAM_HEADER = "x-compat-upstream";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatCompletionPayload = {
  choices?: Array<{
    message?: { content?: unknown; refusal?: unknown };
    delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown };
    finish_reason?: unknown;
  }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
};

type ChatCompletionErrorPayload = {
  error?: { message?: unknown; type?: unknown; code?: unknown; param?: unknown };
};

/** Builds an isolated in-memory session for one provider configuration. */
export function createOpenAiCompatibleSession(config: OpenAiCompatibleConfig): AIProviderSession {
  const providerId = config.providerId;
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const apiKey = config.apiKey.trim();
  if (!apiKey) throw new ProviderError(providerId, "invalid_api_key", false);

  // Directly: {base}/models. Through the relay: {proxy}/models with the upstream
  // in a header, so the browser only ever talks to its own origin.
  const relay = config.proxyBasePath?.replace(/\/+$/, "");
  const chatUrl = relay
    ? `${relay}${config.chatCompletionsPath ?? "/chat/completions"}`
    : joinUrl(baseUrl, config.chatCompletionsPath ?? "/chat/completions");
  const modelsUrl = relay
    ? `${relay}${config.modelsPath ?? "/models"}`
    : joinUrl(baseUrl, config.modelsPath ?? "/models");

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${apiKey}`);
      headers.set("accept", init.body ? "text/event-stream, application/json" : "application/json");
      if (init.body && !headers.has("content-type"))
        headers.set("content-type", "application/json");
      // The relay forwards this to the real endpoint; it is never a query string.
      if (relay) headers.set(PROXY_UPSTREAM_HEADER, baseUrl);
      const response = await fetch(url, { ...init, headers });
      if (!response.ok) throw await providerErrorFromResponse(providerId, response);
      return response;
    } catch (error) {
      if (error instanceof ProviderError || isAbortError(error)) throw error;
      throw normalizeProviderError(providerId, undefined, "NETWORK_ERROR");
    }
  }

  async function listModels(signal?: AbortSignal): Promise<ProviderModel[]> {
    const response = await request(modelsUrl, { ...(signal && { signal }) });
    const payload = (await response.json()) as { data?: unknown };
    const entries = Array.isArray(payload.data) ? payload.data : [];
    const models: ProviderModel[] = [];
    const seen = new Set<string>();

    for (const entry of entries) {
      const id =
        typeof entry === "string"
          ? entry
          : isRecord(entry) && typeof entry["id"] === "string"
            ? entry["id"]
            : undefined;
      if (!id || seen.has(id)) continue;
      const classification = classifyModelId(id);
      // Embeddings, audio, image and moderation models cannot chat; leaving them
      // out is honest, whereas listing them as text models would not be.
      if (classification === "unsupported") continue;
      seen.add(id);
      const chat = classification === "chat";
      models.push({
        id,
        providerId,
        displayName: prettifyModelId(id),
        source: "discovered",
        availability: chat ? "available" : "unknown",
        capabilities: { textGeneration: chat, streaming: chat },
      });
    }

    // Chat-capable models first, then unclassified ones, each alphabetical.
    return models.sort((a, b) => {
      const rankA = a.availability === "available" ? 0 : 1;
      const rankB = b.availability === "available" ? 0 : 1;
      return rankA - rankB || a.id.localeCompare(b.id);
    });
  }

  async function testConnection(signal?: AbortSignal): Promise<ProviderConnectionResult> {
    const models = await listModels(signal);
    return {
      providerId,
      connected: true,
      checkedAt: new Date().toISOString(),
      availableModelCount: models.filter((model) => model.capabilities.textGeneration).length,
    };
  }

  async function generateText(input: ProviderRequest): Promise<ProviderTextResponse> {
    const model = normalizeModelId(providerId, input.model);
    const body = createRequestBody(model, input, false);
    const response = await request(chatUrl, {
      method: "POST",
      body: JSON.stringify(body),
      ...(input.signal && { signal: input.signal }),
    });
    const payload = (await response.json().catch(() => {
      throw new ProviderError(providerId, "unknown", false);
    })) as ChatCompletionPayload;

    if (!Array.isArray(payload.choices)) throw new ProviderError(providerId, "unknown", false);
    const usage = normalizeUsage(payload.usage);
    return {
      text: extractMessageContent(payload.choices[0]?.message?.content),
      model,
      ...(usage && { usage }),
    };
  }

  async function* streamText(input: ProviderRequest): AsyncIterable<string> {
    for await (const event of streamTextEvents(input)) {
      if (event.type === "text") yield event.text;
    }
  }

  /**
   * Streams normalized events from `chat/completions` with
   * `stream_options.include_usage`, falling back once if a compatible provider
   * rejects that option. Usage is emitted only when the provider actually
   * reports it: an interrupted stream leaves usage unavailable, never zero.
   */
  async function* streamTextEvents(input: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    const model = normalizeModelId(providerId, input.model);
    const body = createRequestBody(model, input, true);

    let response: Response;
    try {
      response = await startStream(body, input.signal);
    } catch (error) {
      if (error instanceof ProviderError && error.code === "network_error") {
        throw new ProviderError(providerId, "stream_interrupted", true);
      }
      throw error;
    }

    if (!response.body) throw new ProviderError(providerId, "stream_interrupted", true);
    const reader = response.body.getReader();
    const parser = new SseParser();
    let usage: ProviderUsage | undefined;
    let finished = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const data of parser.push(value)) {
          const outcome = parseStreamPayload(providerId, data);
          if (outcome.done) {
            finished = true;
            break;
          }
          if (outcome.usage) usage = outcome.usage;
          if (outcome.text) yield { type: "text", text: outcome.text };
        }
        if (finished) break;
      }
      if (!finished) {
        for (const data of parser.push(undefined, true)) {
          const outcome = parseStreamPayload(providerId, data);
          if (outcome.done) break;
          if (outcome.usage) usage = outcome.usage;
          if (outcome.text) yield { type: "text", text: outcome.text };
        }
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(providerId, "stream_interrupted", true);
    } finally {
      // Cancelling the reader releases the underlying connection promptly.
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }

    // Emitted after the loop so a usage-only final chunk can never be dropped.
    if (usage) yield { type: "usage", usage };
  }

  async function startStream(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Response> {
    const init: RequestInit = {
      method: "POST",
      body: JSON.stringify(body),
      ...(signal && { signal }),
    };
    try {
      return await request(chatUrl, init);
    } catch (error) {
      // Some OpenAI-compatible servers do not implement `stream_options` and
      // answer 400/422. Retrying once without it preserves streaming support.
      const rejectedOptions =
        body["stream_options"] !== undefined &&
        error instanceof ProviderError &&
        (error.statusCode === 400 || error.statusCode === 422);
      if (!rejectedOptions) throw error;
      const { stream_options: _ignored, ...rest } = body;
      return await request(chatUrl, { ...init, body: JSON.stringify(rest) });
    }
  }

  return { providerId, testConnection, listModels, generateText, streamText, streamTextEvents };
}

function createRequestBody(
  model: string,
  input: ProviderRequest,
  stream: boolean,
): Record<string, unknown> {
  const messages: ChatMessage[] = [];
  if (input.systemInstruction) messages.push({ role: "system", content: input.systemInstruction });
  for (const message of input.messages) {
    if (!message.content) continue;
    messages.push({ role: message.role, content: message.content });
  }

  // Optional generation parameters are capability-gated: reasoning models reject
  // sampling options, so they are omitted rather than guessed at.
  const sampling = supportsSamplingParameters(model);
  return {
    model,
    messages,
    ...(stream && { stream: true, stream_options: { include_usage: true } }),
    ...(sampling && input.temperature !== undefined && { temperature: input.temperature }),
    ...(sampling && input.maxOutputTokens !== undefined && { max_tokens: input.maxOutputTokens }),
  };
}

type StreamOutcome = { done: boolean; text?: string; usage?: ProviderUsage };

function parseStreamPayload(providerId: string, data: string): StreamOutcome {
  const trimmed = data.trim();
  if (!trimmed) return { done: false };
  if (trimmed === "[DONE]") return { done: true };

  let payload: ChatCompletionPayload;
  try {
    payload = JSON.parse(trimmed) as ChatCompletionPayload;
  } catch {
    throw new ProviderError(providerId, "stream_interrupted", true);
  }
  if (!isRecord(payload)) throw new ProviderError(providerId, "stream_interrupted", true);

  // A usage-only final chunk legitimately carries an empty `choices` array.
  const usage = normalizeUsage(payload.usage);
  // `reasoning_content`/`reasoning` deltas are deliberately ignored: the
  // assistant renders only answer text.
  const text = extractMessageContent(payload.choices?.[0]?.delta?.content);
  if (!text && !usage) return { done: false };
  return {
    done: false,
    ...(text ? { text } : {}),
    ...(usage ? { usage } : {}),
  };
}

/** Accepts both plain-string content and the newer array-of-parts form. */
function extractMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (isRecord(part) && typeof part["text"] === "string") return part["text"];
      return "";
    })
    .join("");
}

function normalizeUsage(usage?: ChatCompletionPayload["usage"]): ProviderUsage | undefined {
  if (!usage) return undefined;
  const inputTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined;
  const outputTokens =
    typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined;
  const totalTokens = typeof usage.total_tokens === "number" ? usage.total_tokens : undefined;
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined)
    return undefined;
  return {
    ...(inputTokens !== undefined && { inputTokens }),
    ...(outputTokens !== undefined && { outputTokens }),
    ...(totalTokens !== undefined && { totalTokens }),
    source: "provider_reported",
  };
}

export function normalizeModelId(providerId: string, model: string): string {
  const id = model.trim();
  // Slashes are valid in OpenAI-compatible IDs (for example `meta-llama/llama-3`).
  // Whitespace and control characters are rejected before any network call.
  const hasUnsafeCharacter = [...id].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f || /\s/.test(character);
  });
  if (!id || id.length > 200 || hasUnsafeCharacter) {
    throw new ProviderError(providerId, "invalid_request", false);
  }
  return id;
}

async function providerErrorFromResponse(
  providerId: string,
  response: Response,
): Promise<ProviderError> {
  let code: string | undefined;
  let message: string | undefined;
  try {
    const payload = (await response.json()) as ChatCompletionErrorPayload;
    const error = payload.error;
    if (error) {
      const codeParts = [error.code, error.type].filter(
        (value): value is string => typeof value === "string",
      );
      if (codeParts.length) code = codeParts.join(" ");
      if (typeof error.message === "string") message = error.message;
    }
  } catch {
    // Provider bodies stay out of user-facing errors and logs.
  }

  // `insufficient_quota` must not collapse into a plain rate limit: the fix is
  // billing, not waiting.
  if (/insufficient_quota/.test(`${code ?? ""} ${message ?? ""}`.toLowerCase())) {
    return new ProviderError(providerId, "quota_exceeded", false, response.status);
  }
  if (response.status === 403) {
    // Authenticated but not allowed: the key itself is the problem.
    return new ProviderError(providerId, "invalid_api_key", false, response.status);
  }
  return normalizeProviderError(providerId, response.status, code, message);
}

/**
 * Normalizes a user-supplied endpoint. Remote endpoints must use HTTPS, and
 * private/internal addresses are rejected so an arbitrary URL cannot be used to
 * probe the local network. Loopback stays available for local runtimes such as
 * Ollama and LM Studio.
 */
export function normalizeBaseUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new ProviderError("openai-compatible", "invalid_request", false);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderError("openai-compatible", "invalid_request", false);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ProviderError("openai-compatible", "invalid_request", false);
  }
  if (url.username || url.password) {
    // Credentials belong in the API key field, never in the URL.
    throw new ProviderError("openai-compatible", "invalid_request", false);
  }

  const host = url.hostname.toLowerCase();
  const loopback =
    host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  if (url.protocol === "http:" && !loopback) {
    throw new ProviderError("openai-compatible", "invalid_request", false);
  }
  if (!loopback && isPrivateHost(host)) {
    throw new ProviderError("openai-compatible", "invalid_request", false);
  }

  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function isPrivateHost(host: string): boolean {
  if (host === "0.0.0.0" || host === "[::]" || host === "::") return true;
  if (/\.local$/.test(host) || /\.internal$/.test(host)) return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  const [a, b] = octets;
  if (octets.some((octet) => octet > 255)) return true;
  if (a === 10) return true;
  if (a === 127) return false;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
  return false;
}

function joinUrl(baseUrl: string, path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/, "")}${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
