import {
  getAppDatabase,
  requestToPromise,
  RAG_CHUNK_STORE,
  RAG_INDEX_META_STORE,
  APP_META_STORE,
  transactionDone,
} from "@/lib/indexedDb";
import type { DocumentChunk, DocumentIndexState } from "./types";

export interface RagStorageAdapter {
  getIndexState(workspaceId: string, documentId: string): Promise<DocumentIndexState | null>;
  listIndexStates(workspaceId: string): Promise<DocumentIndexState[]>;
  listChunks(workspaceId: string): Promise<DocumentChunk[]>;
  saveIndexState(state: DocumentIndexState): Promise<void>;
  replaceDocumentIndex(state: DocumentIndexState, chunks: DocumentChunk[]): Promise<void>;
  updateDocumentTitle(
    workspaceId: string,
    documentId: string,
    title: string,
    folderId?: string | null,
  ): Promise<void>;
  deleteDocument(workspaceId: string, documentId: string): Promise<void>;
  clearWorkspace(workspaceId: string): Promise<void>;
}

const enabledKey = (workspaceId: string) => `rag-enabled:${workspaceId}`;

export async function isWorkspaceIndexingEnabled(workspaceId: string): Promise<boolean> {
  const database = await getAppDatabase();
  const transaction = database.transaction(APP_META_STORE, "readonly");
  const value = await requestToPromise(
    transaction.objectStore(APP_META_STORE).get(enabledKey(workspaceId)),
  );
  await transactionDone(transaction);
  return Boolean((value as { value?: boolean } | undefined)?.value);
}

export async function setWorkspaceIndexingEnabled(
  workspaceId: string,
  enabled: boolean,
): Promise<void> {
  const database = await getAppDatabase();
  const transaction = database.transaction(APP_META_STORE, "readwrite");
  const store = transaction.objectStore(APP_META_STORE);
  if (enabled) store.put({ key: enabledKey(workspaceId), value: true });
  else store.delete(enabledKey(workspaceId));
  await transactionDone(transaction);
}

export function documentIndexId(workspaceId: string, documentId: string): string {
  return `${workspaceId}:${documentId}`;
}

export const indexedDbRagStorage: RagStorageAdapter = {
  async getIndexState(workspaceId, documentId) {
    const database = await getAppDatabase();
    const transaction = database.transaction(RAG_INDEX_META_STORE, "readonly");
    const value = await requestToPromise(
      transaction.objectStore(RAG_INDEX_META_STORE).get(documentIndexId(workspaceId, documentId)),
    );
    await transactionDone(transaction);
    return (value as DocumentIndexState | undefined) ?? null;
  },
  async listIndexStates(workspaceId) {
    const database = await getAppDatabase();
    const transaction = database.transaction(RAG_INDEX_META_STORE, "readonly");
    const values = await requestToPromise(
      transaction
        .objectStore(RAG_INDEX_META_STORE)
        .index("workspaceId")
        .getAll(IDBKeyRange.only(workspaceId)),
    );
    await transactionDone(transaction);
    return values as DocumentIndexState[];
  },
  async listChunks(workspaceId) {
    const database = await getAppDatabase();
    const transaction = database.transaction(RAG_CHUNK_STORE, "readonly");
    const values = await requestToPromise(
      transaction
        .objectStore(RAG_CHUNK_STORE)
        .index("workspaceId")
        .getAll(IDBKeyRange.only(workspaceId)),
    );
    await transactionDone(transaction);
    return values as DocumentChunk[];
  },
  async saveIndexState(state) {
    const database = await getAppDatabase();
    const transaction = database.transaction(RAG_INDEX_META_STORE, "readwrite");
    transaction.objectStore(RAG_INDEX_META_STORE).put(state);
    await transactionDone(transaction);
  },
  async replaceDocumentIndex(state, chunks) {
    const database = await getAppDatabase();
    const transaction = database.transaction([RAG_CHUNK_STORE, RAG_INDEX_META_STORE], "readwrite");
    const done = transactionDone(transaction);
    const chunkStore = transaction.objectStore(RAG_CHUNK_STORE);
    const oldKeys = await requestToPromise(
      chunkStore
        .index("workspaceDocument")
        .getAllKeys(IDBKeyRange.only([state.workspaceId, state.documentId])),
    );
    for (const chunk of chunks) chunkStore.put(chunk);
    const nextIds = new Set(chunks.map((chunk) => chunk.id));
    for (const key of oldKeys) if (!nextIds.has(String(key))) chunkStore.delete(key);
    transaction.objectStore(RAG_INDEX_META_STORE).put(state);
    await done;
  },
  async updateDocumentTitle(workspaceId, documentId, title, folderId) {
    const database = await getAppDatabase();
    const transaction = database.transaction([RAG_CHUNK_STORE, RAG_INDEX_META_STORE], "readwrite");
    const done = transactionDone(transaction);
    const range = IDBKeyRange.only([workspaceId, documentId]);
    const chunkStore = transaction.objectStore(RAG_CHUNK_STORE);
    const chunks = (await requestToPromise(
      chunkStore.index("workspaceDocument").getAll(range),
    )) as DocumentChunk[];
    for (const chunk of chunks)
      chunkStore.put({
        ...chunk,
        documentTitle: title,
        ...(folderId !== undefined ? { folderId } : {}),
        updatedAt: Date.now(),
      });
    const metaStore = transaction.objectStore(RAG_INDEX_META_STORE);
    const meta = (await requestToPromise(
      metaStore.get(documentIndexId(workspaceId, documentId)),
    )) as DocumentIndexState | undefined;
    if (meta)
      metaStore.put({
        ...meta,
        documentTitle: title,
        ...(folderId !== undefined ? { folderId } : {}),
      });
    await done;
  },
  async deleteDocument(workspaceId, documentId) {
    const database = await getAppDatabase();
    const transaction = database.transaction([RAG_CHUNK_STORE, RAG_INDEX_META_STORE], "readwrite");
    const done = transactionDone(transaction);
    const range = IDBKeyRange.only([workspaceId, documentId]);
    const chunkStore = transaction.objectStore(RAG_CHUNK_STORE);
    const chunkKeys = await requestToPromise(
      chunkStore.index("workspaceDocument").getAllKeys(range),
    );
    for (const key of chunkKeys) chunkStore.delete(key);
    const metaStore = transaction.objectStore(RAG_INDEX_META_STORE);
    const metaKeys = await requestToPromise(metaStore.index("workspaceDocument").getAllKeys(range));
    for (const key of metaKeys) metaStore.delete(key);
    await done;
  },
  async clearWorkspace(workspaceId) {
    const database = await getAppDatabase();
    const transaction = database.transaction([RAG_CHUNK_STORE, RAG_INDEX_META_STORE], "readwrite");
    const done = transactionDone(transaction);
    const chunks = transaction.objectStore(RAG_CHUNK_STORE);
    const chunkKeys = await requestToPromise(
      chunks.index("workspaceId").getAllKeys(IDBKeyRange.only(workspaceId)),
    );
    for (const key of chunkKeys) chunks.delete(key);
    const metadata = transaction.objectStore(RAG_INDEX_META_STORE);
    const metaKeys = await requestToPromise(
      metadata.index("workspaceId").getAllKeys(IDBKeyRange.only(workspaceId)),
    );
    for (const key of metaKeys) metadata.delete(key);
    await done;
  },
};
