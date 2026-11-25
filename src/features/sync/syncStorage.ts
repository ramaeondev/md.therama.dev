import { APP_META_STORE, getAppDatabase, requestToPromise, transactionDone } from "@/lib/indexedDb";

type MetaRecord<T> = { key: string; value: T };

async function readValue<T>(key: string): Promise<T | undefined> {
  const database = await getAppDatabase();
  const transaction = database.transaction(APP_META_STORE, "readonly");
  const record = await requestToPromise(transaction.objectStore(APP_META_STORE).get(key));
  await transactionDone(transaction);
  return (record as MetaRecord<T> | undefined)?.value;
}

async function writeValue<T>(key: string, value: T): Promise<void> {
  const database = await getAppDatabase();
  const transaction = database.transaction(APP_META_STORE, "readwrite");
  transaction.objectStore(APP_META_STORE).put({ key, value });
  await transactionDone(transaction);
}

export type SyncedDocumentState = {
  revision: number;
  payloadHash: string;
};

export type AccountSyncState = Record<string, SyncedDocumentState>;

export function syncEnabledKey(userId: string): string {
  return `cloud-sync-enabled:${userId}`;
}

export async function getSyncEnabled(userId: string): Promise<boolean> {
  const enabled = await readValue<boolean>(syncEnabledKey(userId));
  return enabled ?? true;
}

export async function setSyncEnabled(userId: string, enabled: boolean): Promise<void> {
  await writeValue(syncEnabledKey(userId), enabled);
}

export async function getLocalDataKey(userId: string): Promise<string | undefined> {
  return readValue<string>(`cloud-sync-data-key:${userId}`);
}

export async function saveLocalDataKey(userId: string, dataKey: string): Promise<void> {
  await writeValue(`cloud-sync-data-key:${userId}`, dataKey);
}

export async function getPendingRecoveryKey(userId: string): Promise<string | undefined> {
  return readValue<string>(`cloud-sync-pending-recovery:${userId}`);
}

export async function savePendingRecoveryKey(userId: string, recoveryKey: string): Promise<void> {
  await writeValue(`cloud-sync-pending-recovery:${userId}`, recoveryKey);
}

export async function clearPendingRecoveryKey(userId: string): Promise<void> {
  const database = await getAppDatabase();
  const transaction = database.transaction(APP_META_STORE, "readwrite");
  transaction.objectStore(APP_META_STORE).delete(`cloud-sync-pending-recovery:${userId}`);
  await transactionDone(transaction);
}

export async function getAccountSyncState(userId: string): Promise<AccountSyncState> {
  return (await readValue<AccountSyncState>(`cloud-sync-state:${userId}`)) ?? {};
}

export async function saveAccountSyncState(userId: string, state: AccountSyncState): Promise<void> {
  await writeValue(`cloud-sync-state:${userId}`, state);
}

export async function getInstallationId(): Promise<string> {
  const key = "cloud-sync-installation-id";
  const existing = await readValue<string>(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  await writeValue(key, id);
  return id;
}
