import { supabaseClient } from "@/features/auth/supabaseClient";
import type { MarkdownDocument, WorkspaceState } from "@/features/workspace/types";
import { getInitialSyncWorkspace } from "./initialSync";
import {
  decryptDocumentPayload,
  encryptDocumentPayload,
  hashPayload,
  type EncryptedPayload,
  type KeyEnvelope,
} from "./syncCrypto";
import {
  getAccountSyncState,
  getInstallationId,
  saveAccountSyncState,
  type AccountSyncState,
} from "./syncStorage";

type RemoteDocument = {
  document_id: string;
  device_id: string;
  payload_ciphertext: string;
  payload_iv: string;
  revision: number;
  updated_at: string;
  deleted_at: string | null;
};

export type SyncResult = {
  documents: MarkdownDocument[];
  workspaces: WorkspaceState["workspaces"];
  folders: WorkspaceState["folders"];
  status: string;
};

const apiBase = (import.meta.env["VITE_SUPABASE_URL"] || "https://api-v3.therama.dev").replace(
  /\/$/u,
  "",
);
const publishableKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  if (!supabaseClient || !publishableKey) throw new Error("Cloud sync is not configured.");
  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session) throw new Error("Sign in to use cloud sync.");
  const response = await fetch(`${apiBase}/md/v1/${path}`, {
    method,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Cloud sync failed (${response.status}): ${detail.slice(0, 180)}`);
  }
  if (response.status === 204) return [] as T;
  return (await response.json()) as T;
}

export async function getKeyEnvelope(): Promise<KeyEnvelope | null> {
  const rows = await request<
    Array<{ version: 1; kdf_salt: string; wrap_iv: string; wrapped_key: string }>
  >("key_envelopes?select=version,kdf_salt,wrap_iv,wrapped_key&limit=1");
  const row = rows[0];
  return row
    ? {
        version: row.version,
        kdfSalt: row.kdf_salt,
        wrapIv: row.wrap_iv,
        wrappedKey: row.wrapped_key,
      }
    : null;
}

export async function putKeyEnvelope(envelope: KeyEnvelope): Promise<void> {
  await request("key_envelopes?on_conflict=user_id", "POST", {
    version: envelope.version,
    kdf_salt: envelope.kdfSalt,
    wrap_iv: envelope.wrapIv,
    wrapped_key: envelope.wrappedKey,
  });
}

function payload(document: MarkdownDocument, state: WorkspaceState) {
  const workspace = state.workspaces.find((item) => item.id === document.workspaceId);
  const folders: WorkspaceState["folders"] = [];
  let folder = state.folders.find((item) => item.id === document.folderId);
  const visited = new Set<string>();
  while (folder && !visited.has(folder.id)) {
    visited.add(folder.id);
    folders.unshift({ ...folder });
    folder = folder.parentId
      ? state.folders.find((item) => item.id === folder?.parentId)
      : undefined;
  }
  return {
    kind: "markdown",
    document: { ...document },
    workspace: workspace ? { ...workspace } : null,
    folders,
  };
}

async function registerDevice(deviceId: string): Promise<void> {
  await request("devices?on_conflict=user_id,device_id", "POST", {
    device_id: deviceId,
    label: "This browser",
    last_seen_at: new Date().toISOString(),
    last_sync_at: new Date().toISOString(),
  });
}

/** Pulls remote changes, merges concurrent edits into a conflict copy, then pushes local Markdown. */
export async function syncMarkdownDocuments(
  userId: string,
  dataKey: string,
  current: WorkspaceState,
): Promise<SyncResult> {
  const deviceId = await getInstallationId();
  await registerDevice(deviceId);
  const [remote, previous] = await Promise.all([
    request<RemoteDocument[]>(
      "documents?select=document_id,device_id,payload_ciphertext,payload_iv,revision,updated_at,deleted_at&order=updated_at.asc",
    ),
    getAccountSyncState(userId),
  ]);
  const syncState = getInitialSyncWorkspace(current, remote.length, previous);
  const remoteById = new Map(remote.map((row) => [row.document_id, row]));
  const localById = new Map(syncState.documents.map((document) => [document.id, document]));
  const nextState: AccountSyncState = { ...previous };
  const documents = [...syncState.documents];
  const workspaces = [...syncState.workspaces];
  const folders = [...syncState.folders];
  let imported = 0;
  let conflicts = 0;
  const forceUpload = new Set<string>();

  for (const row of remote) {
    const local = localById.get(row.document_id);
    const last = previous[row.document_id];
    if (!local && last && last.payloadHash !== "deleted" && !row.deleted_at) {
      const tombstones = await request<RemoteDocument[]>(
        "documents?on_conflict=user_id,document_id",
        "POST",
        {
          document_id: row.document_id,
          device_id: deviceId,
          payload_ciphertext: row.payload_ciphertext,
          payload_iv: row.payload_iv,
          deleted_at: new Date().toISOString(),
        },
      );
      nextState[row.document_id] = {
        revision: tombstones[0]?.revision ?? row.revision + 1,
        payloadHash: "deleted",
      };
      continue;
    }
    if (row.deleted_at) {
      if (
        local &&
        last &&
        row.revision > last.revision &&
        (await hashPayload(payload(local, syncState))) === last.payloadHash
      ) {
        const index = documents.findIndex((item) => item.id === local.id);
        if (index >= 0) documents.splice(index, 1);
      }
      nextState[row.document_id] = { revision: row.revision, payloadHash: "deleted" };
      continue;
    }
    const decrypted = await decryptDocumentPayload<{
      kind: string;
      document: MarkdownDocument;
      workspace: WorkspaceState["workspaces"][number] | null;
      folders: WorkspaceState["folders"];
    }>(dataKey, row.document_id, {
      payloadCiphertext: row.payload_ciphertext,
      payloadIv: row.payload_iv,
    } satisfies EncryptedPayload);
    if (decrypted.kind !== "markdown" || decrypted.document.id !== row.document_id) continue;
    const remoteHash = await hashPayload(decrypted);
    const localHash = local ? await hashPayload(payload(local, syncState)) : null;
    const localChanged = Boolean(local && last && localHash !== last.payloadHash);
    const remoteChanged = Boolean(last && row.revision > last.revision);
    if (!local) {
      documents.push(decrypted.document);
      localById.set(decrypted.document.id, decrypted.document);
      if (decrypted.workspace && !workspaces.some((item) => item.id === decrypted.workspace?.id))
        workspaces.push(decrypted.workspace);
      for (const folder of decrypted.folders ?? []) {
        if (!folders.some((item) => item.id === folder.id)) folders.push(folder);
      }
      imported += 1;
    } else if (localChanged && remoteChanged) {
      const remoteCopy = {
        ...decrypted.document,
        id: crypto.randomUUID(),
        title: `${decrypted.document.title} (synced conflict)`,
      };
      documents.push(remoteCopy);
      forceUpload.add(local.id);
      conflicts += 1;
    } else if (remoteChanged && !localChanged) {
      const index = documents.findIndex((item) => item.id === local.id);
      if (index >= 0) documents[index] = decrypted.document;
    }
    const resolved =
      localChanged && remoteChanged ? await hashPayload(payload(local!, syncState)) : remoteHash;
    nextState[row.document_id] = { revision: row.revision, payloadHash: resolved };
  }

  for (const document of documents) {
    const value = payload(document, { ...syncState, workspaces, folders });
    const payloadHash = await hashPayload(value);
    const known = nextState[document.id];
    if (
      !forceUpload.has(document.id) &&
      known?.payloadHash === payloadHash &&
      remoteById.has(document.id)
    )
      continue;
    const encrypted = await encryptDocumentPayload(dataKey, document.id, value);
    const rows = await request<RemoteDocument[]>(
      "documents?on_conflict=user_id,document_id",
      "POST",
      {
        document_id: document.id,
        device_id: deviceId,
        payload_ciphertext: encrypted.payloadCiphertext,
        payload_iv: encrypted.payloadIv,
        deleted_at: null,
      },
    );
    nextState[document.id] = {
      revision: rows[0]?.revision ?? (known?.revision ?? 0) + 1,
      payloadHash,
    };
  }

  await saveAccountSyncState(userId, nextState);
  const suffix = conflicts ? ` · ${conflicts} conflict copy${conflicts === 1 ? "" : "ies"}` : "";
  return {
    documents,
    workspaces,
    folders,
    status: `Synced${imported ? ` · ${imported} downloaded` : ""}${suffix}`,
  };
}
