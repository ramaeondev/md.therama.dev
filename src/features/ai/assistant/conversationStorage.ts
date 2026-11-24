import {
  APP_META_STORE,
  CONVERSATION_STORE,
  getAppDatabase,
  MESSAGE_STORE,
  requestToPromise,
  transactionDone,
} from "@/lib/indexedDb";

import type { Conversation, ConversationMessage } from "./conversationTypes";

export interface ConversationStorageAdapter {
  listConversations(workspaceId: string): Promise<Conversation[]>;
  getConversation(conversationId: string): Promise<Conversation | null>;
  saveConversation(conversation: Conversation): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  listMessages(conversationId: string): Promise<ConversationMessage[]>;
  saveMessage(message: ConversationMessage): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  deleteMessages(conversationId: string): Promise<void>;
  getActiveConversationId(workspaceId: string): Promise<string | null>;
  setActiveConversationId(workspaceId: string, conversationId: string | null): Promise<void>;
}

function activeConversationKey(workspaceId: string): string {
  return `active-conversation:${workspaceId}`;
}

/**
 * Persists conversations, their messages, and the per-workspace active
 * conversation pointer. Stored records never contain credentials: only the
 * provider ID, model ID, message text, status, and provider-reported usage.
 */
export const indexedDbConversationStorage: ConversationStorageAdapter = {
  async listConversations(workspaceId) {
    const database = await getAppDatabase();
    const transaction = database.transaction(CONVERSATION_STORE, "readonly");
    const records = await requestToPromise(
      transaction.objectStore(CONVERSATION_STORE).index("workspaceId").getAll(workspaceId),
    ) as Conversation[];
    await transactionDone(transaction);
    return records;
  },

  async saveConversation(conversation) {
    const database = await getAppDatabase();
    const transaction = database.transaction(CONVERSATION_STORE, "readwrite");
    transaction.objectStore(CONVERSATION_STORE).put(conversation);
    await transactionDone(transaction);
  },

  async getConversation(conversationId) {
    const database = await getAppDatabase();
    const transaction = database.transaction(CONVERSATION_STORE, "readonly");
    const record = await requestToPromise(
      transaction.objectStore(CONVERSATION_STORE).get(conversationId),
    ) as Conversation | undefined;
    await transactionDone(transaction);
    return record ?? null;
  },

  async deleteConversation(conversationId) {
    const database = await getAppDatabase();
    const transaction = database.transaction([CONVERSATION_STORE, MESSAGE_STORE], "readwrite");
    transaction.objectStore(CONVERSATION_STORE).delete(conversationId);
    // Cascade in the same transaction so a conversation never outlives its messages.
    deleteMessagesInTransaction(transaction, conversationId);
    await transactionDone(transaction);
  },

  async listMessages(conversationId) {
    const database = await getAppDatabase();
    const transaction = database.transaction(MESSAGE_STORE, "readonly");
    const records = await requestToPromise(
      transaction.objectStore(MESSAGE_STORE).index("conversationId").getAll(conversationId),
    ) as ConversationMessage[];
    await transactionDone(transaction);
    return records;
  },

  async saveMessage(message) {
    const database = await getAppDatabase();
    const transaction = database.transaction(MESSAGE_STORE, "readwrite");
    transaction.objectStore(MESSAGE_STORE).put(message);
    await transactionDone(transaction);
  },

  async deleteMessage(messageId) {
    const database = await getAppDatabase();
    const transaction = database.transaction(MESSAGE_STORE, "readwrite");
    transaction.objectStore(MESSAGE_STORE).delete(messageId);
    await transactionDone(transaction);
  },

  async deleteMessages(conversationId) {
    const database = await getAppDatabase();
    const transaction = database.transaction(MESSAGE_STORE, "readwrite");
    deleteMessagesInTransaction(transaction, conversationId);
    await transactionDone(transaction);
  },

  async getActiveConversationId(workspaceId) {
    const database = await getAppDatabase();
    const transaction = database.transaction(APP_META_STORE, "readonly");
    const record = await requestToPromise(
      transaction.objectStore(APP_META_STORE).get(activeConversationKey(workspaceId)),
    ) as { key: string; value?: string | null } | undefined;
    await transactionDone(transaction);
    return record?.value ?? null;
  },

  async setActiveConversationId(workspaceId, conversationId) {
    const database = await getAppDatabase();
    const transaction = database.transaction(APP_META_STORE, "readwrite");
    const store = transaction.objectStore(APP_META_STORE);
    const key = activeConversationKey(workspaceId);
    if (conversationId) store.put({ key, value: conversationId });
    else store.delete(key);
    await transactionDone(transaction);
  },
};

function deleteMessagesInTransaction(transaction: IDBTransaction, conversationId: string): void {
  const store = transaction.objectStore(MESSAGE_STORE);
  const request = store.index("conversationId").openKeyCursor(IDBKeyRange.only(conversationId));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    store.delete(cursor.primaryKey);
    cursor.continue();
  };
}
