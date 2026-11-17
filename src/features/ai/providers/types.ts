export type ProviderCapability = "model_discovery" | "text_generation" | "streaming";

export type AIProviderDescriptor = {
  id: string;
  displayName: string;
  capabilities: readonly ProviderCapability[];
};

export type ProviderInitialization = {
  /** Kept only by the in-memory session returned from initialize. */
  apiKey: string;
};

export type ProviderModel = {
  id: string;
  providerId: string;
  displayName: string;
  source: "discovered" | "fallback";
  availability: "available" | "unavailable" | "unknown";
  capabilities: {
    textGeneration: boolean;
    streaming: boolean;
  };
  contextWindowTokens?: number;
  maxOutputTokens?: number;
};

export type ProviderMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ProviderRequest = {
  model: string;
  messages: ProviderMessage[];
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  source: "provider_reported" | "estimated";
};

export type ProviderTextResponse = {
  text: string;
  model: string;
  usage?: ProviderUsage;
};

export type ProviderConnectionResult = {
  providerId: string;
  connected: true;
  checkedAt: string;
  availableModelCount: number;
};

export interface AIProviderSession {
  readonly providerId: string;
  testConnection(signal?: AbortSignal): Promise<ProviderConnectionResult>;
  listModels(signal?: AbortSignal): Promise<ProviderModel[]>;
  generateText(request: ProviderRequest): Promise<ProviderTextResponse>;
  streamText(request: ProviderRequest): AsyncIterable<string>;
}

export interface AIProvider {
  readonly descriptor: AIProviderDescriptor;
  initialize(configuration: ProviderInitialization): AIProviderSession;
}