import {
  compareMessages,
  createConversation,
  createConversationMessage,
  defaultConversationTitle,
  deriveConversationTitle,
  normalizeConversationTitle,
  type Conversation,
  type ConversationMessage,
  type ConversationMessageStatus,
  type CreateConversationInput,
} from "./conversationTypes";
import { indexedDbConversationStorage, type ConversationStorageAdapter } from "./conversationStorage";

import type { ProviderUsage } from "../providers/types";

/**
 * Conversation operations used by the Assistant UI.
 *
 * This is the only module that writes conversations and messages. Callers get
 * plain data back, no component touches IndexedDB directly, and no credential
 * ever reaches this layer.
 */

function storage(): ConversationStorageAdapter {
  return indexedDbConversationStorage;
}

export async function listConversations(workspaceId: string): Promise<Conversation[]> {
  const conversations = await storage().listConversations(workspaceId);
  return conversations.sort((a, b) => {
    if (a.updatedAt === b.updatedAt) return b.createdAt.localeCompare(a.createdAt);
    return a.updatedAt < b.updatedAt ? 1 : -1;
  });
}

export async function readConversation(conversationId: string): Promise<Conversation | null> {
  return storage().getConversation(conversationId);
}

export async function createConversationForWorkspace(input: CreateConversationInput): Promise<Conversation> {
  const conversation = createConversation(input);
  await storage().saveConversation(conversation);
  await storage().setActiveConversationId(conversation.workspaceId, conversation.id);
  return conversation;
}

export async function renameConversation(conversation: Conversation, title: string): Promise<Conversation> {
  const nextTitle = normalizeConversationTitle(title) || conversation.title;
  if (nextTitle === conversation.title) return conversation;
  const updated: Conversation = { ...conversation, title: nextTitle, updatedAt: new Date().toISOString() };
  await storage().saveConversation(updated);
  return updated;
}

export async function deleteConversation(conversation: Conversation): Promise<void> {
  await storage().deleteConversation(conversation.id);
  const activeId = await storage().getActiveConversationId(conversation.workspaceId);
  if (activeId === conversation.id) await storage().setActiveConversationId(conversation.workspaceId, null);
}

export async function openConversation(conversation: Conversation): Promise<ConversationMessage[]> {
  await storage().setActiveConversationId(conversation.workspaceId, conversation.id);
  return listMessages(conversation.id);
}

export async function listMessages(conversationId: string): Promise<ConversationMessage[]> {
  const messages = await storage().listMessages(conversationId);
  return messages.sort(compareMessages);
}

export async function getActiveConversationId(workspaceId: string): Promise<string | null> {
  return storage().getActiveConversationId(workspaceId);
}

export async function setActiveConversation(workspaceId: string, conversationId: string | null): Promise<void> {
  await storage().setActiveConversationId(workspaceId, conversationId);
}

export type AppendMessageInput = {
  conversationId: string;
  role: ConversationMessage["role"];
  content: string;
  status: ConversationMessageStatus;
  usage?: ProviderUsage;
  error?: string;
  now?: string;
};
/**
 * Appends a terminal message and refreshes the conversation's `updatedAt`.
 *
 * Only finished messages are persisted: streaming text is buffered by the UI and
 * written once, so an interrupted request can never leave duplicated or
 * half-written assistant rows behind.
 */
export async function appendMessage(input: AppendMessageInput): Promise<ConversationMessage> {
  const existing = await listMessages(input.conversationId);
  const nextSequence = existing.reduce((max, entry) => Math.max(max, entry.sequence), 0) + 1;
  const message = createConversationMessage({ ...input, sequence: nextSequence });
  await storage().saveMessage(message);

  const conversation = await storage().getConversation(input.conversationId);
  if (conversation) {
    // Title an untouched conversation from its opening question. A manual rename
    // changes the title away from the default, so it is never overwritten.
    const shouldAdoptOpeningQuestion = input.role === "user"
      && conversation.title === defaultConversationTitle
      && (await isOpeningUserMessage(input.conversationId, message.id));
    await storage().saveConversation({
      ...conversation,
      ...(shouldAdoptOpeningQuestion ? { title: deriveConversationTitle(input.content) } : {}),
      updatedAt: input.now ?? new Date().toISOString(),
    });
  }
  return message;
}

/** Removes trailing assistant replies so a retry does not duplicate history. */
export async function dropTrailingAssistantMessages(conversationId: string): Promise<ConversationMessage[]> {
  const ordered = await listMessages(conversationId);
  const kept = [...ordered];
  while (kept.length > 0 && kept[kept.length - 1]?.role === "assistant") kept.pop();
  for (const message of ordered.slice(kept.length)) {
    await storage().deleteMessage(message.id);
  }
  return kept;
}

async function isOpeningUserMessage(conversationId: string, messageId: string): Promise<boolean> {
  const messages = await listMessages(conversationId);
  return messages.find((entry) => entry.role === "user")?.id === messageId;
}

export type { Conversation, ConversationMessage, ConversationMessageStatus };
