import {
  getAppDatabase,
  StorageUnavailableError,
  transactionDone,
  USAGE_STORE,
} from "@/lib/indexedDb";

import type { UsageRecord } from "./types";

export interface UsageStorageAdapter {
  save(record: UsageRecord): Promise<void>;
  /** Newest first, ordered by the `createdAt` index rather than a client sort. */
  list(): Promise<UsageRecord[]>;
  clear(): Promise<void>;
}

/** Reads every record through the `createdAt` index in descending order. */
function readNewestFirst(store: IDBObjectStore): Promise<UsageRecord[]> {
  return new Promise((resolve, reject) => {
    const records: UsageRecord[] = [];
    const request = store.index("createdAt").openCursor(null, "prev");
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(records);
        return;
      }
      records.push(cursor.value as UsageRecord);
      cursor.continue();
    };
    request.onerror = () =>
      reject(request.error ?? new StorageUnavailableError("A local storage read failed."));
  });
}

export const indexedDbUsageStorage: UsageStorageAdapter = {
  async save(record) {
    const database = await getAppDatabase();
    const transaction = database.transaction(USAGE_STORE, "readwrite");
    transaction.objectStore(USAGE_STORE).put(record);
    await transactionDone(transaction);
  },

  async list() {
    const database = await getAppDatabase();
    const transaction = database.transaction(USAGE_STORE, "readonly");
    const records = await readNewestFirst(transaction.objectStore(USAGE_STORE));
    await transactionDone(transaction);
    return records;
  },

  async clear() {
    const database = await getAppDatabase();
    const transaction = database.transaction(USAGE_STORE, "readwrite");
    transaction.objectStore(USAGE_STORE).clear();
    await transactionDone(transaction);
  },
};
