import { isAbortError, normalizeProviderError, ProviderError } from "./errors";
import type {
  AIProvider,
  AIProviderSession,
  ProviderConnectionResult,
  ProviderModel,
  ProviderRequest,
  ProviderTextResponse,
  ProviderUsage,
} from "./types";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";
const PROVIDER_ID = "gemini";

type GeminiModelPayload = {
  name?: unknown;
  displayName?: unknown;
  inputTokenLimit?: unknown;
  outputTokenLimit?: unknown;
  supportedGenerationMethods?: unknown;
};

type GeminiResponsePayload = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: unknown; thought?: unknown }> };
  }>;
  usageMetadata?: {
    promptTokenCount?: unknown;
    candidatesTokenCount?: unknown;
    totalTokenCount?: unknown;
  };
};

type GeminiErrorPayload = {
  error?: { code?: unknown; status?: unknown; message?: unknown };
};

export const geminiProvider: AIProvider = {
  descriptor: {
    id: PROVIDER_ID,
    displayName: "Google Gemini",
    capabilities: ["model_discovery", "text_generation", "streaming"],
  },
  initialize(configuration): AIProviderSession {
    const apiKey = configuration.apiKey.trim();
    if (!apiKey) throw new ProviderError(PROVIDER_ID, "invalid_api_key", false);
    return createGeminiSession(apiKey);
  },
};

function createGeminiSession(apiKey: string): AIProviderSession {
  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      const headers = new Headers(init.headers);
      headers.set("x-goog-api-key", apiKey);
      if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
      const response = await fetch(url, {
        ...init,
        headers,
      });
      if (!response.ok) throw await providerErrorFromResponse(response);
      return response;
    } catch (error) {
      if (error instanceof ProviderError || isAbortError(error)) throw error;
      throw normalizeProviderError(PROVIDER_ID, undefined, "NETWORK_ERROR");
    }
  }

  async function listModels(signal?: AbortSignal): Promise<ProviderModel[]> {
    const result: ProviderModel[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ pageSize: "1000" });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await request(`${API_ROOT}/models?${params.toString()}`, { ...(signal && { signal }) });
      const payload = (await response.json()) as {
        models?: GeminiModelPayload[];
        nextPageToken?: string;
      };
      for (const model of payload.models ?? []) {
        const methods = Array.isArray(model.supportedGenerationMethods)
          ? model.supportedGenerationMethods
          : [];
        if (typeof model.name !== "string" || !methods.includes("generateContent")) continue;
        const id = model.name.replace(/^models\//, "");
        result.push({
          id,
          providerId: PROVIDER_ID,
          displayName: typeof model.displayName === "string" ? model.displayName : id,
          source: "discovered",
          availability: "available",
          capabilities: { textGeneration: true, streaming: methods.includes("streamGenerateContent") },
          ...(typeof model.inputTokenLimit === "number" && { contextWindowTokens: model.inputTokenLimit }),
          ...(typeof model.outputTokenLimit === "number" && { maxOutputTokens: model.outputTokenLimit }),
        });
      }
      pageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : undefined;
    } while (pageToken);
    return result;
  }

  async function testConnection(signal?: AbortSignal): Promise<ProviderConnectionResult> {
    const models = await listModels(signal);
    return {
      providerId: PROVIDER_ID,
      connected: true,
      checkedAt: new Date().toISOString(),
      availableModelCount: models.length,
    };
  }

  async function generateText(input: ProviderRequest): Promise<ProviderTextResponse> {
    const model = normalizeModelId(input.model);
    const body = createRequestBody(input);
    const response = await request(`${API_ROOT}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      body: JSON.stringify(body),
      ...(input.signal && { signal: input.signal }),
    });
    const payload = (await response.json()) as GeminiResponsePayload;
    const usage = normalizeUsage(payload.usageMetadata);
    return {
      text: extractText(payload),
      model,
      ...(usage && { usage }),
    };
  }

  async function* streamText(input: ProviderRequest): AsyncIterable<string> {
    const model = normalizeModelId(input.model);
    const params = new URLSearchParams({ alt: "sse" });
    let response: Response;
    try {
      response = await request(
        `${API_ROOT}/models/${encodeURIComponent(model)}:streamGenerateContent?${params.toString()}`,
        { method: "POST", body: JSON.stringify(createRequestBody(input)), ...(input.signal && { signal: input.signal }) },
      );
    } catch (error) {
      if (error instanceof ProviderError && error.code === "network_error") {
        throw new ProviderError(PROVIDER_ID, "stream_interrupted", true);
      }
      throw error;
    }

    if (!response.body) throw new ProviderError(PROVIDER_ID, "stream_interrupted", true);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const text = parseSseLine(line);
          if (text) yield text;
        }
        if (done) break;
      }
      if (buffer) {
        const text = parseSseLine(buffer);
        if (text) yield text;
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(PROVIDER_ID, "stream_interrupted", true);
    } finally {
      reader.releaseLock();
    }
  }

  return { providerId: PROVIDER_ID, testConnection, listModels, generateText, streamText };
}

function createRequestBody(input: ProviderRequest) {
  return {
    contents: input.messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    ...(input.systemInstruction && { systemInstruction: { parts: [{ text: input.systemInstruction }] } }),
    ...((input.temperature !== undefined || input.maxOutputTokens !== undefined) && {
      generationConfig: {
        ...(input.temperature !== undefined && { temperature: input.temperature }),
        ...(input.maxOutputTokens !== undefined && { maxOutputTokens: input.maxOutputTokens }),
      },
    }),
  };
}

function normalizeModelId(model: string): string {
  const id = model.replace(/^models\//, "").trim();
  if (!id || id.includes("/")) throw new ProviderError(PROVIDER_ID, "invalid_request", false);
  return id;
}

function extractText(payload: GeminiResponsePayload): string {
  return (payload.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => typeof part.text === "string" && part.thought !== true)
    .map((part) => part.text as string)
    .join("");
}

function normalizeUsage(metadata?: GeminiResponsePayload["usageMetadata"]): ProviderUsage | undefined {
  if (!metadata) return undefined;
  const inputTokens = typeof metadata.promptTokenCount === "number" ? metadata.promptTokenCount : undefined;
  const outputTokens = typeof metadata.candidatesTokenCount === "number" ? metadata.candidatesTokenCount : undefined;
  const totalTokens = typeof metadata.totalTokenCount === "number" ? metadata.totalTokenCount : undefined;
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined;
  return { ...(inputTokens !== undefined && { inputTokens }), ...(outputTokens !== undefined && { outputTokens }), ...(totalTokens !== undefined && { totalTokens }), source: "provider_reported" };
}

function parseSseLine(line: string): string | undefined {
  if (!line.startsWith("data:")) return undefined;
  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") return undefined;
  let payload: GeminiResponsePayload;
  try {
    payload = JSON.parse(data) as GeminiResponsePayload;
  } catch {
    throw new ProviderError(PROVIDER_ID, "stream_interrupted", true);
  }
  return extractText(payload) || undefined;
}

async function providerErrorFromResponse(response: Response): Promise<ProviderError> {
  let code: string | undefined;
  let message: string | undefined;
  try {
    const payload = (await response.json()) as GeminiErrorPayload;
    if (typeof payload.error?.code === "string") code = payload.error.code;
    if (typeof payload.error?.status === "string") code = `${code ?? ""} ${payload.error.status}`;
    if (typeof payload.error?.message === "string") message = payload.error.message;
  } catch {
    // Keep provider response bodies out of user-facing errors and logs.
  }
  return normalizeProviderError(PROVIDER_ID, response.status, code, message);
}