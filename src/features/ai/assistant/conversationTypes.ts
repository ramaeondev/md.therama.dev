import type { ProviderUsage } from "../providers/types";
import type { RetrievalSource } from "../rag/types";

export type Conversation = {
  id: string;
  workspaceId: string;
  /** Set when the conversation was started from a specific document. */
  documentId?: string;
  title: string;
  providerId: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessageRole = "user" | "assistant";

/**
 * `interrupted` means the user stopped generation (or the session ended) and the
 * stored content is the partial text that arrived. `failed` means the request
 * did not produce a usable answer. Only `complete` counts as a finished reply.
 */
export type ConversationMessageStatus = "complete" | "interrupted" | "failed";

export type ConversationMessage = {
  id: string;
  conversationId: string;
  role: ConversationMessageRole;
  content: string;
  createdAt: string;
  status: ConversationMessageStatus;
  /**
   * Monotonic position within the conversation. Timestamps can collide when a
   * user and the assistant message are written in the same millisecond, so
   * ordering never depends on `createdAt` alone.
   */
  sequence: number;
  /** Present only when the provider reported usage for this reply. */
  usage?: ProviderUsage;
  /**
   * Provider and model that produced this assistant reply. Recorded per message
   * so a conversation can span providers without losing attribution.
   */
  providerId?: string;
  modelId?: string;
  /** Safe, user-facing failure summary. Never raw provider payloads. */
  error?: string;
  sources?: RetrievalSource[];
};

export type CreateConversationInput = {
  workspaceId: string;
  documentId?: string;
  providerId: string;
  modelId: string;
  title?: string;
  now?: string;
};

export const defaultConversationTitle = "New conversation";

export function createConversation(input: CreateConversationInput): Conversation {
  const now = input.now ?? new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    ...(input.documentId ? { documentId: input.documentId } : {}),
    title: normalizeConversationTitle(input.title) || defaultConversationTitle,
    providerId: input.providerId,
    modelId: input.modelId,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeConversationTitle(title: string | undefined): string {
  return (title ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Derives a readable history label from the first user message. */
export function deriveConversationTitle(text: string): string {
  const clean = normalizeConversationTitle(text);
  if (!clean) return defaultConversationTitle;
  return clean.length > 48 ? `${clean.slice(0, 47).trimEnd()}…` : clean;
}

export function createConversationMessage(input: {
  conversationId: string;
  role: ConversationMessageRole;
  content: string;
  status: ConversationMessageStatus;
  sequence?: number;
  usage?: ProviderUsage;
  providerId?: string;
  modelId?: string;
  error?: string;
  sources?: RetrievalSource[];
  now?: string;
}): ConversationMessage {
  return {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    createdAt: input.now ?? new Date().toISOString(),
    status: input.status,
    sequence: input.sequence ?? 0,
    ...(input.usage ? { usage: input.usage } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.error ? { error: input.error } : {}),
    ...(input.sources?.length ? { sources: input.sources } : {}),
  };
}

/** Sort helper: stable conversation order, oldest first. */
export function compareMessages(a: ConversationMessage, b: ConversationMessage): number {
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id.localeCompare(b.id);
}
