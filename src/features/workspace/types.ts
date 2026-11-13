export type Workspace = {
  id: string;
  name: string;
  createdAt: string;
};

export type WorkspaceFolder = {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
};

export type MarkdownDocument = {
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  content: string;
  updatedAt: string;
};

export type WorkspacePreferences = {
  theme: "dark" | "light";
  fontSize: number;
  wordWrap: boolean;
  autoSaveDelay: number;
};

export type WorkspaceState = {
  workspaces: Workspace[];
  folders: WorkspaceFolder[];
  documents: MarkdownDocument[];
  activeWorkspaceId: string;
  openDocumentIds: string[];
  activeDocumentId: string | null;
  recentDocumentIds: string[];
  preferences: WorkspacePreferences;
};

export type WorkspaceBundle = {
  format: "markdown-ai-workspace";
  version: 1;
  exportedAt: string;
  workspace: Workspace;
  folders: WorkspaceFolder[];
  documents: MarkdownDocument[];
};