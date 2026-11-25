import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import {
  APP_DATABASE_NAME,
  APP_META_STORE,
  RAG_CHUNK_STORE,
  RAG_INDEX_META_STORE,
  APP_DATABASE_VERSION,
  CONVERSATION_STORE,
  deleteAppDatabase,
  getAppDatabase,
  MESSAGE_STORE,
  resetAppDatabaseConnection,
  USAGE_STORE,
  WORKSPACE_STATE_STORE,
} from "./indexedDb";

const stateRecordId = "primary-workspace-state";

/** Creates a database exactly as version 1 of the app left it. */
function createVersionOneDatabase(state: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(APP_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(WORKSPACE_STATE_STORE, { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(WORKSPACE_STATE_STORE, "readwrite");
      transaction.objectStore(WORKSPACE_STATE_STORE).put({ id: stateRecordId, state });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

function readState(database: IDBDatabase): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(WORKSPACE_STATE_STORE, "readonly");
    const request = transaction.objectStore(WORKSPACE_STATE_STORE).get(stateRecordId);
    request.onsuccess = () => resolve((request.result as { state?: unknown } | undefined)?.state);
    request.onerror = () => reject(request.error);
  });
}

const legacyState = {
  workspaces: [
    { id: "workspace-legacy", name: "Existing workspace", createdAt: "2026-11-01T00:00:00.000Z" },
  ],
  folders: [
    { id: "folder-legacy", workspaceId: "workspace-legacy", parentId: null, name: "Notes" },
  ],
  documents: [
    {
      id: "doc-legacy",
      workspaceId: "workspace-legacy",
      folderId: "folder-legacy",
      title: "Kept.md",
      content: "# Kept\n\nDo not lose this.",
      updatedAt: "2026-11-02T00:00:00.000Z",
    },
  ],
  activeWorkspaceId: "workspace-legacy",
  openDocumentIds: ["doc-legacy"],
  activeDocumentId: "doc-legacy",
  recentDocumentIds: ["doc-legacy"],
  preferences: {
    theme: "light",
    fontSize: 15,
    wordWrap: false,
    autoSaveDelay: 1200,
    aiProviderId: "gemini",
    aiModelId: "gemini-2.5-flash",
  },
};

describe("IndexedDB versioned migration", () => {
  beforeEach(async () => {
    resetAppDatabaseConnection();
    await deleteAppDatabase();
  });

  it("adds the conversation, message, usage, meta, and RAG stores without touching existing data", async () => {
    await createVersionOneDatabase(legacyState);

    const database = await getAppDatabase();

    expect(database.version).toBe(APP_DATABASE_VERSION);
    expect(APP_DATABASE_VERSION).toBe(3);
    for (const store of [
      CONVERSATION_STORE,
      MESSAGE_STORE,
      USAGE_STORE,
      APP_META_STORE,
      RAG_CHUNK_STORE,
      RAG_INDEX_META_STORE,
    ]) {
      expect(database.objectStoreNames.contains(store)).toBe(true);
    }
    expect(database.objectStoreNames.contains(WORKSPACE_STATE_STORE)).toBe(true);

    // The v1 workspace record survives the upgrade byte-for-byte.
    expect(await readState(database)).toEqual(legacyState);
  });

  it("creates the indexes the conversation and usage features rely on", async () => {
    await createVersionOneDatabase(legacyState);
    const database = await getAppDatabase();

    const conversations = database
      .transaction(CONVERSATION_STORE, "readonly")
      .objectStore(CONVERSATION_STORE);
    expect(conversations.indexNames.contains("workspaceId")).toBe(true);
    expect(conversations.indexNames.contains("updatedAt")).toBe(true);

    const messages = database.transaction(MESSAGE_STORE, "readonly").objectStore(MESSAGE_STORE);
    expect(messages.indexNames.contains("conversationId")).toBe(true);
    expect(messages.indexNames.contains("conversationCreatedAt")).toBe(true);

    const usage = database.transaction(USAGE_STORE, "readonly").objectStore(USAGE_STORE);
    expect(usage.indexNames.contains("timestamp")).toBe(true);

    const chunks = database.transaction(RAG_CHUNK_STORE, "readonly").objectStore(RAG_CHUNK_STORE);
    expect(chunks.indexNames.contains("workspaceId")).toBe(true);
    expect(chunks.indexNames.contains("workspaceDocument")).toBe(true);

    const ragMeta = database
      .transaction(RAG_INDEX_META_STORE, "readonly")
      .objectStore(RAG_INDEX_META_STORE);
    expect(ragMeta.indexNames.contains("workspaceDocument")).toBe(true);
  });

  it("is idempotent when the database is already at the current version", async () => {
    await createVersionOneDatabase(legacyState);
    const first = await getAppDatabase();
    first.close();
    resetAppDatabaseConnection();

    const second = await getAppDatabase();

    expect(second.version).toBe(APP_DATABASE_VERSION);
    expect(await readState(second)).toEqual(legacyState);
  });

  it("keeps existing data when a fresh database is created at the current version", async () => {
    const database = await getAppDatabase();
    expect(database.version).toBe(APP_DATABASE_VERSION);
    expect(database.objectStoreNames.contains(WORKSPACE_STATE_STORE)).toBe(true);
    expect(await readState(database)).toBeUndefined();
  });

  it("does not delete the database when an upgrade attempt fails", async () => {
    await createVersionOneDatabase(legacyState);
    // Simulate an upgrade failure: a store created with an index name that the
    // migration also tries to create would throw inside the upgrade transaction.
    const original = IDBObjectStore.prototype.createIndex;
    IDBObjectStore.prototype.createIndex = function throwingCreateIndex() {
      throw new DOMException("migration failure", "AbortError");
    } as typeof IDBObjectStore.prototype.createIndex;

    try {
      await expect(getAppDatabase()).rejects.toBeTruthy();
    } finally {
      IDBObjectStore.prototype.createIndex = original;
      resetAppDatabaseConnection();
    }

    // The version stays at 1 and the pre-existing record is still readable.
    const reopened = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(APP_DATABASE_NAME, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(reopened.version).toBe(1);
    expect(await readState(reopened)).toEqual(legacyState);
    reopened.close();
  });
});
