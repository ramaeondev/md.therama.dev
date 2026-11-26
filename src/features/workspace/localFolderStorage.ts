import {
  APP_META_STORE,
  getAppDatabase,
  requestToPromise,
  transactionDone,
} from "@/lib/indexedDb";
import type { WorkspaceState } from "./types";
import {
  documentRelativePath,
  isLocalWorkspaceManifest,
  isSafeRelativeMarkdownPath,
  manifestState,
  markdownContentHash,
  toLocalWorkspaceManifest,
  type LocalDocumentRecord,
  type LocalWorkspaceManifest,
} from "./localFolderFormat";
import type { DocumentStorageAdapter } from "./storage";

const DIRECTORY_HANDLE_KEY = "markdown-local-workspace-directory";

type PermissionMode = "read" | "readwrite";
type FileSystemWritable = {
  write(data: string | Blob): Promise<void>;
  close(): Promise<void>;
};
type LocalFileHandle = {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritable>;
};
type LocalDirectoryHandle = {
  readonly name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<LocalFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<LocalDirectoryHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterableIterator<LocalFileHandle | LocalDirectoryHandle>;
  queryPermission(options?: { mode?: PermissionMode }): Promise<PermissionState>;
  requestPermission(options?: { mode?: PermissionMode }): Promise<PermissionState>;
};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: PermissionMode;
    }) => Promise<LocalDirectoryHandle>;
  }
}

export class LocalFolderConflictError extends Error {
  override readonly name = "LocalFolderConflictError";
}

export class LocalFolderPermissionError extends Error {
  override readonly name = "LocalFolderPermissionError";
}

async function getSavedHandle(): Promise<LocalDirectoryHandle | null> {
  const database = await getAppDatabase();
  const transaction = database.transaction(APP_META_STORE, "readonly");
  const result = await requestToPromise(
    transaction.objectStore(APP_META_STORE).get(DIRECTORY_HANDLE_KEY),
  );
  await transactionDone(transaction);
  const record = result as { key: string; handle?: LocalDirectoryHandle } | undefined;
  return record?.handle ?? null;
}

async function saveHandle(handle: LocalDirectoryHandle | null): Promise<void> {
  const database = await getAppDatabase();
  const transaction = database.transaction(APP_META_STORE, "readwrite");
  const store = transaction.objectStore(APP_META_STORE);
  if (handle) store.put({ key: DIRECTORY_HANDLE_KEY, handle });
  else store.delete(DIRECTORY_HANDLE_KEY);
  await transactionDone(transaction);
}

async function readManifest(
  root: LocalDirectoryHandle,
): Promise<LocalWorkspaceManifest | null> {
  let file: LocalFileHandle;
  try {
    file = await root.getFileHandle(".markdown-ai-workspace.json");
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return null;
    throw error;
  }
  const parsed: unknown = JSON.parse(await (await file.getFile()).text());
  if (!isLocalWorkspaceManifest(parsed)) {
    throw new Error("This folder contains an unsupported Markdown workspace manifest.");
  }
  for (const document of parsed.documents) {
    if (!isSafeRelativeMarkdownPath(document.relativePath)) {
      throw new Error("The workspace manifest contains an unsafe document path.");
    }
  }
  return parsed;
}

async function readManifestDocuments(
  root: LocalDirectoryHandle,
  manifest: LocalWorkspaceManifest,
): Promise<Map<string, string>> {
  const contentById = new Map<string, string>();
  for (const document of manifest.documents) {
    const content = await readDocument(root, document.relativePath);
    if ((await markdownContentHash(content)) !== document.contentHash) {
      throw new LocalFolderConflictError(
        `“${document.title}” changed outside the app. Reload the workspace to pick up the latest file contents.`,
      );
    }
    contentById.set(document.id, content);
  }
  return contentById;
}

async function getDirectoryAtPath(
  root: LocalDirectoryHandle,
  parts: string[],
  create: boolean,
): Promise<LocalDirectoryHandle> {
  let current = root;
  for (const part of parts) {
    if (!part || part === "." || part === ".." || part.includes("/") || part.includes("\\")) {
      throw new Error("Unsafe local workspace path.");
    }
    current = await current.getDirectoryHandle(part, { create });
  }
  return current;
}

async function readDocument(
  root: LocalDirectoryHandle,
  relativePath: string,
): Promise<string> {
  if (!isSafeRelativeMarkdownPath(relativePath)) throw new Error("Unsafe Markdown path.");
  const parts = relativePath.split("/");
  const name = parts.pop();
  if (!name) throw new Error("Invalid Markdown path.");
  const directory = await getDirectoryAtPath(root, parts, false);
  return (await (await directory.getFileHandle(name)).getFile()).text();
}

async function writeTextFile(
  directory: LocalDirectoryHandle,
  name: string,
  value: string,
): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(value);
  await writable.close();
}

async function writeDocument(
  root: LocalDirectoryHandle,
  relativePath: string,
  content: string,
): Promise<void> {
  if (!isSafeRelativeMarkdownPath(relativePath)) throw new Error("Unsafe Markdown path.");
  const parts = relativePath.split("/");
  const name = parts.pop();
  if (!name) throw new Error("Invalid Markdown path.");
  const directory = await getDirectoryAtPath(root, parts, true);
  await writeTextFile(directory, name, content);
}

async function removeDocument(root: LocalDirectoryHandle, relativePath: string): Promise<void> {
  if (!isSafeRelativeMarkdownPath(relativePath)) throw new Error("Unsafe Markdown path.");
  const parts = relativePath.split("/");
  const name = parts.pop();
  if (!name) return;
  try {
    const directory = await getDirectoryAtPath(root, parts, false);
    await directory.removeEntry(name);
  } catch {
    // A removed document is already absent.
  }
}

async function hasMarkdownFiles(root: LocalDirectoryHandle): Promise<boolean> {
  for await (const entry of root.values()) {
    if ("getFile" in entry && entry.name.endsWith(".md")) return true;
    if ("getDirectoryHandle" in entry && (await hasMarkdownFiles(entry))) return true;
  }
  return false;
}

function toDocumentRecords(
  state: WorkspaceState,
  paths: Map<string, string>,
  hashes: Map<string, string>,
): LocalDocumentRecord[] {
  return state.documents.map(({ content: _content, ...document }) => {
    const relativePath = paths.get(document.id);
    const contentHash = hashes.get(document.id);
    if (!relativePath || !contentHash) throw new Error("A workspace document is missing its file.");
    return { ...document, relativePath, contentHash };
  });
}

async function createFolderSnapshot(
  root: LocalDirectoryHandle,
  state: WorkspaceState,
  revision: number,
): Promise<LocalWorkspaceManifest> {
  const paths = new Map<string, string>();
  const hashes = new Map<string, string>();
  const seenPaths = new Set<string>();
  for (const document of state.documents) {
    const relativePath = documentRelativePath(state, document);
    if (seenPaths.has(relativePath)) {
      throw new Error(`Two documents resolve to the same local file: ${relativePath}`);
    }
    seenPaths.add(relativePath);
    await writeDocument(root, relativePath, document.content);
    paths.set(document.id, relativePath);
    hashes.set(document.id, await markdownContentHash(document.content));
  }
  const manifest = toLocalWorkspaceManifest(
    state,
    toDocumentRecords(state, paths, hashes),
    revision,
  );
  await writeTextFile(root, ".markdown-ai-workspace.json", JSON.stringify(manifest, null, 2));
  return manifest;
}

export const localFolderStorage = {
  async hasPicker(): Promise<boolean> {
    return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
  },

  async getFolderName(): Promise<string | null> {
    return (await getSavedHandle())?.name ?? null;
  },

  async loadSaved(): Promise<WorkspaceState | null> {
    const root = await getSavedHandle();
    if (!root) return null;
    const permission = await root.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new LocalFolderPermissionError("Reconnect the local folder to continue.");
    const manifest = await readManifest(root);
    if (!manifest) return null;
    const contentById = await readManifestDocuments(root, manifest);
    this.lastManifest = manifest;
    return manifestState(manifest, contentById);
  },

  async load(): Promise<WorkspaceState | null> {
    return this.loadSaved();
  },

  lastManifest: null as LocalWorkspaceManifest | null,

  async connect(currentState: WorkspaceState | null): Promise<{ state: WorkspaceState; folderName: string }> {
    if (!window.showDirectoryPicker) {
      throw new Error("Local folders are not supported by this browser. Use browser storage instead.");
    }
    const root = await window.showDirectoryPicker({ id: "markdown-ai-workspace", mode: "readwrite" });
    const permission = await root.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new LocalFolderPermissionError("Folder write permission was not granted.");

    const manifest = await readManifest(root);
    if (manifest) {
      const contentById = await readManifestDocuments(root, manifest);
      this.lastManifest = manifest;
      await saveHandle(root);
      return { state: manifestState(manifest, contentById), folderName: root.name };
    }
    if (await hasMarkdownFiles(root)) {
      throw new Error("This folder already contains Markdown files. Choose an empty folder or a workspace folder.");
    }
    if (!currentState) throw new Error("No browser workspace is available to copy into this folder.");
    this.lastManifest = await createFolderSnapshot(root, currentState, 1);
    await saveHandle(root);
    return { state: currentState, folderName: root.name };
  },

  async disconnect(): Promise<void> {
    await saveHandle(null);
    this.lastManifest = null;
  },

  async save(state: WorkspaceState): Promise<void> {
    const root = await getSavedHandle();
    if (!root) throw new Error("No local workspace folder is connected.");
    const permission = await root.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new LocalFolderPermissionError("Reconnect the local folder before saving.");

    const current = await readManifest(root);
    const last = this.lastManifest;
    if (last && (!current || current.revision !== last.revision)) {
      throw new LocalFolderConflictError(
        "This workspace changed outside the app. Reload the page to load the latest files before editing further.",
      );
    }
    if (!last && current) {
      throw new LocalFolderConflictError("Reload the page to connect to the latest local workspace.");
    }
    if (current) await readManifestDocuments(root, current);

    const previousById = new Map((last?.documents ?? []).map((document) => [document.id, document]));
    const nextById = new Map(state.documents.map((document) => [document.id, document]));
    const records: LocalDocumentRecord[] = [];
    const paths = new Map<string, string>();
    const hashes = new Map<string, string>();
    const seenPaths = new Set<string>();

    for (const document of state.documents) {
      const relativePath = documentRelativePath(state, document);
      if (!isSafeRelativeMarkdownPath(relativePath) || seenPaths.has(relativePath)) {
        throw new Error("Documents must resolve to unique, safe Markdown paths.");
      }
      seenPaths.add(relativePath);
      const contentHash = await markdownContentHash(document.content);
      const previous = previousById.get(document.id);
      if (!previous || previous.relativePath !== relativePath || previous.contentHash !== contentHash) {
        await writeDocument(root, relativePath, document.content);
      }
      paths.set(document.id, relativePath);
      hashes.set(document.id, contentHash);
      const { content: _content, ...metadata } = document;
      records.push({ ...metadata, relativePath, contentHash });
    }

    for (const previous of last?.documents ?? []) {
      const next = nextById.get(previous.id);
      if (!next || paths.get(previous.id) !== previous.relativePath) {
        await removeDocument(root, previous.relativePath);
      }
    }

    const nextManifest = toLocalWorkspaceManifest(
      state,
      toDocumentRecords(state, paths, hashes),
      (current?.revision ?? 0) + 1,
    );
    await writeTextFile(root, ".markdown-ai-workspace.json", JSON.stringify(nextManifest, null, 2));
    this.lastManifest = nextManifest;
  },
} satisfies DocumentStorageAdapter & {
  hasPicker(): Promise<boolean>;
  getFolderName(): Promise<string | null>;
  loadSaved(): Promise<WorkspaceState | null>;
  load(): Promise<WorkspaceState | null>;
  connect(state: WorkspaceState | null): Promise<{ state: WorkspaceState; folderName: string }>;
  disconnect(): Promise<void>;
  lastManifest: LocalWorkspaceManifest | null;
};
