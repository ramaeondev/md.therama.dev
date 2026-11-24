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
  /**
   * Any registered provider ID: a built-in one, or a custom OpenAI-compatible
   * instance. Only the ID is persisted; credentials never are.
   */
  aiProviderId: string | null;
  aiModelId: string | null;
  /**
   * Selected model per provider, so switching providers restores the model that
   * was previously chosen for each one.
   */
  aiSelectedModels?: Record<string, string>;
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
