import { indexDocument } from "./documentIndexer";
import {
  indexedDbRagStorage,
  isWorkspaceIndexingEnabled,
  setWorkspaceIndexingEnabled,
} from "./vectorStore";
import type { DocumentIndexState, IndexProgress, MarkdownSource } from "./types";

const DEBOUNCE_MS = 900;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const controllers = new Map<string, AbortController>();
const activeRuns = new Map<string, Promise<void>>();
const progressByDocument = new Map<string, IndexProgress>();
const listeners = new Set<() => void>();

const documentKey = (workspaceId: string, documentId: string) => `${workspaceId}:${documentId}`;
const notify = () => listeners.forEach((listener) => listener());

export function subscribeIndexProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getIndexProgress(workspaceId: string): IndexProgress[] {
  return [...progressByDocument.values()].filter((entry) => entry.workspaceId === workspaceId);
}

export async function getWorkspaceIndexState(workspaceId: string): Promise<{
  enabled: boolean;
  documents: DocumentIndexState[];
}> {
  const [enabled, documents] = await Promise.all([
    isWorkspaceIndexingEnabled(workspaceId),
    indexedDbRagStorage.listIndexStates(workspaceId),
  ]);
  return { enabled, documents };
}

async function run(source: MarkdownSource, force = false): Promise<void> {
  const key = documentKey(source.workspaceId, source.documentId);
  const queuedTimer = timers.get(key);
  if (queuedTimer) clearTimeout(queuedTimer);
  timers.delete(key);
  const oldController = controllers.get(key);
  oldController?.abort();
  const controller = new AbortController();
  controllers.set(key, controller);
  progressByDocument.set(key, {
    workspaceId: source.workspaceId,
    documentId: source.documentId,
    completed: 0,
    total: 1,
    phase: "queued",
    message: "Waiting to index",
  });
  notify();
  const activeRun = (async () => {
    try {
      await indexDocument(source, {
        signal: controller.signal,
        force,
        onProgress: (progress) => {
          progressByDocument.set(key, progress);
          notify();
        },
      });
    } catch {
      // The persisted failed status and progress event are surfaced in the UI.
    }
  })();
  activeRuns.set(key, activeRun);
  try {
    await activeRun;
  } finally {
    if (controllers.get(key) === controller) controllers.delete(key);
    if (activeRuns.get(key) === activeRun) activeRuns.delete(key);
    notify();
  }
}

export function scheduleDocumentIndex(source: MarkdownSource, immediate = false): void {
  const key = documentKey(source.workspaceId, source.documentId);
  const prior = timers.get(key);
  if (prior) clearTimeout(prior);
  if (immediate) {
    timers.delete(key);
    void run(source);
    return;
  }
  progressByDocument.set(key, {
    workspaceId: source.workspaceId,
    documentId: source.documentId,
    completed: 0,
    total: 1,
    phase: "queued",
    message: "Waiting for edits to finish",
  });
  notify();
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void run(source);
    }, DEBOUNCE_MS),
  );
}

export function cancelDocumentIndex(workspaceId: string, documentId: string): void {
  const key = documentKey(workspaceId, documentId);
  const timer = timers.get(key);
  if (timer) clearTimeout(timer);
  timers.delete(key);
  controllers.get(key)?.abort();
  progressByDocument.delete(key);
  notify();
}

export async function enableAndIndexWorkspace(
  workspaceId: string,
  sources: MarkdownSource[],
  force = false,
): Promise<void> {
  await setWorkspaceIndexingEnabled(workspaceId, true);
  for (const source of sources) await run(source, force);
}

export async function syncWorkspaceDocuments(
  workspaceId: string,
  sources: MarkdownSource[],
): Promise<void> {
  const currentIds = new Set(sources.map((source) => source.documentId));
  const existing = await indexedDbRagStorage.listIndexStates(workspaceId);
  const staleIds = new Set([
    ...existing
      .filter((entry) => !currentIds.has(entry.documentId))
      .map((entry) => entry.documentId),
    ...getIndexProgress(workspaceId)
      .filter((entry) => !currentIds.has(entry.documentId))
      .map((entry) => entry.documentId),
  ]);
  for (const documentId of staleIds) {
    const key = documentKey(workspaceId, documentId);
    cancelDocumentIndex(workspaceId, documentId);
    await activeRuns.get(key);
    await indexedDbRagStorage.deleteDocument(workspaceId, documentId);
  }
  if (!(await isWorkspaceIndexingEnabled(workspaceId))) return;
  for (const source of sources) scheduleDocumentIndex(source);
}

export async function retryDocumentIndex(source: MarkdownSource): Promise<void> {
  await setWorkspaceIndexingEnabled(source.workspaceId, true);
  await run(source);
}

export async function clearWorkspaceIndex(workspaceId: string): Promise<void> {
  await setWorkspaceIndexingEnabled(workspaceId, false);
  const states = await indexedDbRagStorage.listIndexStates(workspaceId);
  const documentIds = new Set([
    ...states.map((state) => state.documentId),
    ...getIndexProgress(workspaceId).map((progress) => progress.documentId),
  ]);
  for (const documentId of documentIds) {
    const key = documentKey(workspaceId, documentId);
    cancelDocumentIndex(workspaceId, documentId);
    await activeRuns.get(key);
  }
  await indexedDbRagStorage.clearWorkspace(workspaceId);
}

export async function disableWorkspaceIndexing(workspaceId: string): Promise<void> {
  await setWorkspaceIndexingEnabled(workspaceId, false);
  for (const progress of getIndexProgress(workspaceId)) {
    const key = documentKey(workspaceId, progress.documentId);
    cancelDocumentIndex(workspaceId, progress.documentId);
    await activeRuns.get(key);
    const state = await indexedDbRagStorage.getIndexState(workspaceId, progress.documentId);
    if (state?.status === "indexing") {
      await indexedDbRagStorage.saveIndexState({ ...state, status: "pending" });
    }
  }
}
