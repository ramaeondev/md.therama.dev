import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Database, LoaderCircle, Play, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Progress } from "@/components/ui/progress";
import type { MarkdownDocument } from "@/features/workspace/types";
import {
  clearWorkspaceIndex,
  disableWorkspaceIndexing,
  enableAndIndexWorkspace,
  getIndexProgress,
  getWorkspaceIndexState,
  retryDocumentIndex,
  subscribeIndexProgress,
} from "./indexQueue";
import type { DocumentIndexState, IndexProgress, MarkdownSource } from "./types";

type Props = {
  workspaceId: string;
  documents: MarkdownDocument[];
};

function sourceFromDocument(document: MarkdownDocument): MarkdownSource {
  return {
    workspaceId: document.workspaceId,
    documentId: document.id,
    documentTitle: document.title,
    folderId: document.folderId,
    content: document.content,
  };
}

export function WorkspaceIntelligencePanel({ workspaceId, documents }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [indexStates, setIndexStates] = useState<DocumentIndexState[]>([]);
  const [progress, setProgress] = useState<IndexProgress[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const documentSources = useMemo(() => documents.map(sourceFromDocument), [documents]);

  const refresh = useCallback(async () => {
    const status = await getWorkspaceIndexState(workspaceId);
    setEnabled(status.enabled);
    setIndexStates(status.documents);
    setProgress(getIndexProgress(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
    return subscribeIndexProgress(() => void refresh());
  }, [refresh]);

  const indexedCount = indexStates.filter((entry) => entry.status === "indexed").length;
  const failed = indexStates.filter((entry) => entry.status === "failed");
  const chunkCount = indexStates
    .filter((entry) => entry.status === "indexed")
    .reduce((sum, entry) => sum + entry.chunkCount, 0);
  const working = progress.filter(
    (entry) =>
      entry.phase === "queued" ||
      entry.phase === "parsing" ||
      entry.phase === "embedding" ||
      entry.phase === "saving",
  );
  const activeProgress = working[0];
  const progressValue = activeProgress?.total
    ? Math.round((activeProgress.completed / activeProgress.total) * 100)
    : 0;

  async function startIndexing() {
    setBusy(true);
    try {
      await enableAndIndexWorkspace(workspaceId, documentSources);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function rebuildIndex() {
    setBusy(true);
    try {
      await enableAndIndexWorkspace(workspaceId, documentSources, true);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function pauseIndexing() {
    await disableWorkspaceIndexing(workspaceId);
    await refresh();
  }

  async function clearIndex() {
    setConfirmClear(false);
    setBusy(true);
    try {
      await clearWorkspaceIndex(workspaceId);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function retry(documentId: string) {
    const source = documentSources.find((entry) => entry.documentId === documentId);
    if (!source) return;
    await retryDocumentIndex(source);
    await refresh();
  }

  return (
    <section className="space-y-4" aria-label="Workspace intelligence">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md border border-border bg-card p-2">
          <Database className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">Workspace intelligence</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Build a local semantic index so the assistant can find relevant passages across your
            Markdown documents.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-card p-3 text-center">
        <div>
          <div className="text-lg font-semibold">
            {indexedCount}/{documents.length}
          </div>
          <div className="text-[10px] text-muted-foreground">documents</div>
        </div>
        <div>
          <div className="text-lg font-semibold">{chunkCount}</div>
          <div className="text-[10px] text-muted-foreground">chunks</div>
        </div>
        <div>
          <div className="flex h-7 items-center justify-center">
            {activeProgress ? (
              <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
            ) : enabled ? (
              <Check className="h-4 w-4 text-primary" />
            ) : (
              <span className="text-xs text-muted-foreground">Paused</span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {activeProgress ? "indexing" : enabled ? "automatic updates" : "status"}
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <p className="text-xs font-medium">Local embedding model</p>
        <p className="text-[11px] leading-4 text-muted-foreground">
          MiniLM L6 runs in this browser. Its model files download on first use and are cached by
          the browser. Document text stays in local storage for embedding; retrieved excerpts are
          sent to your selected chat provider when you ask a workspace question.
        </p>
      </div>

      {activeProgress && (
        <div className="space-y-1.5" aria-live="polite">
          <div className="flex justify-between gap-2 text-[10px] text-muted-foreground">
            <span className="truncate">{activeProgress.message ?? "Indexing workspace"}</span>
            <span>{progressValue}%</span>
          </div>
          <Progress value={progressValue} />
        </div>
      )}

      {failed.length > 0 && (
        <div className="space-y-1 rounded-md border border-destructive/30 p-3">
          {failed.map((entry) => (
            <div key={entry.documentId} className="flex items-center gap-2 text-[11px]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
              <span className="min-w-0 flex-1 truncate">{entry.documentTitle}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => void retry(entry.documentId)}
              >
                Retry
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {enabled ? (
          <Button variant="outline" size="sm" onClick={() => void pauseIndexing()}>
            <Play className="h-3.5 w-3.5" />
            Pause automatic indexing
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => void startIndexing()}
            disabled={busy || documents.length === 0}
          >
            {busy ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {indexedCount ? "Resume and update index" : "Index workspace"}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void rebuildIndex()}
          disabled={busy || documents.length === 0}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Rebuild index
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setConfirmClear(true)}
          disabled={busy || indexStates.length === 0}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear index
        </Button>
      </div>

      {indexStates.length > 0 && (
        <div className="max-h-36 space-y-1 overflow-y-auto border-t border-border pt-2">
          {indexStates.map((entry) => (
            <div
              key={entry.documentId}
              className="flex items-center justify-between gap-2 text-[10px]"
            >
              <span className="min-w-0 truncate">{entry.documentTitle}</span>
              <span
                className={entry.status === "failed" ? "text-destructive" : "text-muted-foreground"}
              >
                {entry.status}
              </span>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear workspace index?"
        description="This removes locally stored chunks and vectors for this workspace. Your Markdown documents and conversations are not affected."
        confirmLabel="Clear index"
        destructive
        onConfirm={() => void clearIndex()}
      />
    </section>
  );
}
