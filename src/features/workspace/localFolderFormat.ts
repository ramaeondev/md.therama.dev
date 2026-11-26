import type { MarkdownDocument, WorkspaceState } from "./types";

export const LOCAL_WORKSPACE_MANIFEST = ".markdown-ai-workspace.json";
export const LOCAL_WORKSPACE_FORMAT = "markdown-ai-workspace-local";
export const LOCAL_WORKSPACE_VERSION = 1;

export type LocalDocumentRecord = Omit<MarkdownDocument, "content"> & {
  relativePath: string;
  contentHash: string;
};

export type LocalWorkspaceManifest = Omit<WorkspaceState, "documents"> & {
  format: typeof LOCAL_WORKSPACE_FORMAT;
  version: typeof LOCAL_WORKSPACE_VERSION;
  revision: number;
  documents: LocalDocumentRecord[];
};

export function toLocalWorkspaceManifest(
  state: WorkspaceState,
  documents: LocalDocumentRecord[],
  revision: number,
): LocalWorkspaceManifest {
  return {
    format: LOCAL_WORKSPACE_FORMAT,
    version: LOCAL_WORKSPACE_VERSION,
    revision,
    workspaces: state.workspaces,
    folders: state.folders,
    documents,
    activeWorkspaceId: state.activeWorkspaceId,
    openDocumentIds: state.openDocumentIds,
    activeDocumentId: state.activeDocumentId,
    recentDocumentIds: state.recentDocumentIds,
    preferences: state.preferences,
  };
}

export function isLocalWorkspaceManifest(value: unknown): value is LocalWorkspaceManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<LocalWorkspaceManifest>;
  return (
    manifest.format === LOCAL_WORKSPACE_FORMAT &&
    manifest.version === LOCAL_WORKSPACE_VERSION &&
    Number.isSafeInteger(manifest.revision) &&
    manifest.revision! >= 0 &&
    Array.isArray(manifest.workspaces) &&
    Array.isArray(manifest.folders) &&
    Array.isArray(manifest.documents) &&
    Boolean(manifest.preferences)
  );
}

export function manifestState(
  manifest: LocalWorkspaceManifest,
  contentById: Map<string, string>,
): WorkspaceState {
  return {
    workspaces: manifest.workspaces,
    folders: manifest.folders,
    documents: manifest.documents.map(({ relativePath: _path, contentHash: _hash, ...document }) => ({
      ...document,
      content: contentById.get(document.id) ?? "",
    })),
    activeWorkspaceId: manifest.activeWorkspaceId,
    openDocumentIds: manifest.openDocumentIds,
    activeDocumentId: manifest.activeDocumentId,
    recentDocumentIds: manifest.recentDocumentIds,
    preferences: manifest.preferences,
  };
}

export function safePathSegment(input: string): string {
  const segment = input
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\.+$/g, "")
    .trim();
  return segment && segment !== "." && segment !== ".." ? segment : "Untitled";
}

export function documentRelativePath(
  state: Pick<WorkspaceState, "workspaces" | "folders">,
  document: MarkdownDocument,
): string {
  const workspace = state.workspaces.find((item) => item.id === document.workspaceId);
  if (!workspace) throw new Error("Document workspace was not found.");

  const folderNames: string[] = [];
  let folderId = document.folderId;
  const visited = new Set<string>();
  while (folderId) {
    if (visited.has(folderId)) throw new Error("Folder hierarchy contains a cycle.");
    visited.add(folderId);
    const folder = state.folders.find(
      (item) => item.id === folderId && item.workspaceId === document.workspaceId,
    );
    if (!folder) throw new Error("Document folder was not found.");
    folderNames.unshift(safePathSegment(folder.name));
    folderId = folder.parentId;
  }

  const workspacePart = `${safePathSegment(workspace.name)}--${workspace.id.slice(0, 8)}`;
  const filename = safePathSegment(document.title.replace(/\.(md|markdown|txt)$/i, ""));
  return [workspacePart, ...folderNames, `${filename}.md`].join("/");
}

export function isSafeRelativeMarkdownPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  const segments = path.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  ) && /\.md$/i.test(path);
}

export async function markdownContentHash(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
