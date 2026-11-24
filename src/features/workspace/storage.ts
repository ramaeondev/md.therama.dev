import { getAppDatabase, requestToPromise, transactionDone, WORKSPACE_STATE_STORE } from "@/lib/indexedDb";

import type { WorkspaceState } from "./types";

const stateRecordId = "primary-workspace-state";

export interface DocumentStorageAdapter {
  load(): Promise<WorkspaceState | null>;
  save(state: WorkspaceState): Promise<void>;
}

/**
 * Workspace persistence. The database connection and versioned schema live in
 * `@/lib/indexedDb`; this adapter stays a thin repository over the
 * `workspace-state` store so the stored shape remains unchanged.
 */
export const indexedDbStorage: DocumentStorageAdapter = {
  async load() {
    const database = await getAppDatabase();
    const transaction = database.transaction(WORKSPACE_STATE_STORE, "readonly");
    const result = await requestToPromise(transaction.objectStore(WORKSPACE_STATE_STORE).get(stateRecordId));
    await transactionDone(transaction);
    const record = result as { id: string; state?: WorkspaceState } | undefined;
    return record?.state ?? null;
  },
  async save(state) {
    const database = await getAppDatabase();
    const transaction = database.transaction(WORKSPACE_STATE_STORE, "readwrite");
    transaction.objectStore(WORKSPACE_STATE_STORE).put({ id: stateRecordId, state });
    await transactionDone(transaction);
  },
};
