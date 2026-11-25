/**
 * Single owner of the application IndexedDB database.
 *
 * Every feature that persists browser-local data goes through this module so
 * there is exactly one connection, one version history, and one place where a
 * versioned migration can be reviewed. Feature modules keep their own
 * repository/adapter interfaces on top of it.
 */

export const APP_DATABASE_NAME = "markdown-ai-workspace";

/**
 * Version history
 * - 1: `workspace-state` (workspaces, folders, documents, preferences).
 * - 2: adds `conversations`, `messages`, `ai-usage`, and `app-meta`.
 *      Additive only: no existing store is dropped, re-keyed, or rewritten.
 * - 3: adds `rag-chunks` and `rag-index-meta` for browser-local workspace search.
 */
export const APP_DATABASE_VERSION = 3;

export const WORKSPACE_STATE_STORE = "workspace-state";
export const CONVERSATION_STORE = "conversations";
export const MESSAGE_STORE = "messages";
export const USAGE_STORE = "ai-usage";
export const APP_META_STORE = "app-meta";
export const RAG_CHUNK_STORE = "rag-chunks";
export const RAG_INDEX_META_STORE = "rag-index-meta";

export class StorageUnavailableError extends Error {
  override readonly name = "StorageUnavailableError";

  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}
function createMissingStores(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(WORKSPACE_STATE_STORE)) {
    database.createObjectStore(WORKSPACE_STATE_STORE, { keyPath: "id" });
  }

  // Added in version 2.
  if (!database.objectStoreNames.contains(CONVERSATION_STORE)) {
    const conversations = database.createObjectStore(CONVERSATION_STORE, { keyPath: "id" });
    conversations.createIndex("workspaceId", "workspaceId", { unique: false });
    conversations.createIndex("updatedAt", "updatedAt", { unique: false });
  }
  if (!database.objectStoreNames.contains(MESSAGE_STORE)) {
    const messages = database.createObjectStore(MESSAGE_STORE, { keyPath: "id" });
    messages.createIndex("conversationId", "conversationId", { unique: false });
    // Supports ordered reads of a single conversation without a client sort.
    messages.createIndex("conversationCreatedAt", ["conversationId", "createdAt"], {
      unique: false,
    });
  }
  if (!database.objectStoreNames.contains(USAGE_STORE)) {
    const usage = database.createObjectStore(USAGE_STORE, { keyPath: "id" });
    usage.createIndex("timestamp", "timestamp", { unique: false });
  }
  if (!database.objectStoreNames.contains(APP_META_STORE)) {
    database.createObjectStore(APP_META_STORE, { keyPath: "key" });
  }
  if (!database.objectStoreNames.contains(RAG_CHUNK_STORE)) {
    const chunks = database.createObjectStore(RAG_CHUNK_STORE, { keyPath: "id" });
    chunks.createIndex("workspaceId", "workspaceId", { unique: false });
    chunks.createIndex("workspaceDocument", ["workspaceId", "documentId"], { unique: false });
  }
  if (!database.objectStoreNames.contains(RAG_INDEX_META_STORE)) {
    const indexMeta = database.createObjectStore(RAG_INDEX_META_STORE, { keyPath: "id" });
    indexMeta.createIndex("workspaceId", "workspaceId", { unique: false });
    indexMeta.createIndex("workspaceDocument", ["workspaceId", "documentId"], { unique: true });
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new StorageUnavailableError("IndexedDB is unavailable in this browser."));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(APP_DATABASE_NAME, APP_DATABASE_VERSION);
    } catch (error) {
      reject(
        new StorageUnavailableError("Local storage could not be opened in this browser.", error),
      );
      return;
    }

    // The upgrade transaction is created by the browser. If anything throws in
    // here the transaction aborts, the version stays where it was, and the
    // existing stores keep their data. We never clear or delete a store during
    // a migration.
    request.onupgradeneeded = () => {
      createMissingStores(request.result);
    };

    request.onblocked = () => {
      reject(
        new StorageUnavailableError(
          "Another tab is using an older version of local storage. Close other tabs and reload.",
        ),
      );
    };

    request.onerror = () => {
      reject(
        request.error
          ? new StorageUnavailableError(
              "Local storage could not be upgraded safely.",
              request.error,
            )
          : new StorageUnavailableError("Local storage could not be opened in this browser."),
      );
    };

    request.onsuccess = () => {
      const database = request.result;
      // Let a newer tab upgrade the schema instead of blocking it forever.
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
  });
}

let databasePromise: Promise<IDBDatabase> | undefined;

export function getAppDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabase().catch((error: unknown) => {
      // Do not cache a rejected promise: a later attempt (for example after the
      // user closes another tab) should be able to succeed.
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

/** Test-only: forget the cached connection. Does not delete any data. */
export function resetAppDatabaseConnection(): void {
  const pending = databasePromise;
  databasePromise = undefined;
  void pending?.then((database) => database.close()).catch(() => undefined);
}

/** Test-only: delete the whole database. Never used by application code. */
export function deleteAppDatabase(): Promise<void> {
  resetAppDatabaseConnection();
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      resolve();
      return;
    }
    const request = indexedDB.deleteDatabase(APP_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new StorageUnavailableError("Local storage could not be deleted."));
    request.onblocked = () => resolve();
  });
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new StorageUnavailableError("A local storage read failed."));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new StorageUnavailableError("A local storage write failed."));
    transaction.onabort = () =>
      reject(
        transaction.error ?? new StorageUnavailableError("A local storage write was interrupted."),
      );
  });
}
