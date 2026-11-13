import type { WorkspaceState } from "./types";

const databaseName = "markdown-ai-workspace";
const databaseVersion = 1;
const stateRecordId = "primary-workspace-state";

export interface DocumentStorageAdapter {
  load(): Promise<WorkspaceState | null>;
  save(state: WorkspaceState): Promise<void>;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("workspace-state")) {
        database.createObjectStore("workspace-state", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local workspace storage."));
  });
}

let databasePromise: Promise<IDBDatabase> | undefined;

function getDatabase() {
  if (!databasePromise) databasePromise = openDatabase();
  return databasePromise;
}

export const indexedDbStorage: DocumentStorageAdapter = {
  async load() {
    const database = await getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("workspace-state", "readonly");
      const request = transaction.objectStore("workspace-state").get(stateRecordId);
      request.onsuccess = () => resolve((request.result?.state as WorkspaceState | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not read local workspace storage."));
    });
  },
  async save(state) {
    const database = await getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("workspace-state", "readwrite");
      transaction.objectStore("workspace-state").put({ id: stateRecordId, state });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the workspace."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Workspace save was interrupted."));
    });
  },
};