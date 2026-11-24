import { getAppDatabase, requestToPromise, transactionDone, USAGE_STORE } from "@/lib/indexedDb";

import type { UsageRecord } from "./types";

export interface UsageStorageAdapter {
  save(record: UsageRecord): Promise<void>;
  list(): Promise<UsageRecord[]>;
  clear(): Promise<void>;
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
    const records = await requestToPromise(transaction.objectStore(USAGE_STORE).getAll()) as UsageRecord[];
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
