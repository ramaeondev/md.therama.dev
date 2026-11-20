import type {
  MarkdownDocument,
  Workspace,
  WorkspaceBundle,
  WorkspaceFolder,
  WorkspaceState,
} from "./types";

const starterWorkspaceId = "workspace-starter";

export function createStarterState(): WorkspaceState {
  const workspace: Workspace = {
    id: starterWorkspaceId,
    name: "My workspace",
    createdAt: "2026-11-13T00:00:00.000Z",
  };
  const folders: WorkspaceFolder[] = [
    { id: "folder-guides", workspaceId: starterWorkspaceId, parentId: null, name: "Guides" },
    {
      id: "folder-getting-started",
      workspaceId: starterWorkspaceId,
      parentId: "folder-guides",
      name: "Getting started",
    },
    { id: "folder-generated", workspaceId: starterWorkspaceId, parentId: null, name: "AI drafts" },
  ];
  const documents: MarkdownDocument[] = [
    {
      id: "doc-welcome",
      workspaceId: starterWorkspaceId,
      folderId: null,
      title: "Welcome.md",
      updatedAt: "2026-11-13T00:00:00.000Z",
      content: `# Your knowledge, in Markdown\n\nA calm, local-first space for notes, docs, and ideas. Your files stay in this browser and belong to you.\n\n## A workspace that stays yours\n\nEverything here is stored locally. Create folders, move between documents, and shape your own documentation without accounts or network services.\n\n## Markdown, without friction\n\nWrite with **plain Markdown** and see the rendered page alongside it. Use the toolbar for common formatting, or keep typing.\n\n> Good documentation is a small act of kindness to your future self.\n\n## Start with a simple list\n\n- Create a folder for a project\n- Capture decisions as they happen\n- Keep useful context close to the work\n\n
tiny note:  This preview updates as you type.\n\n
\n
def add(a, b) {\n  return a + b;\n}\n\n## What comes next\n\nYour workspace is ready to grow. Add a document from the sidebar, import existing Markdown, or export a copy whenever you need one.`,
    },
    {
      id: "doc-project-brief",
      workspaceId: starterWorkspaceId,
      folderId: "folder-guides",
      title: "Project brief.md",
      updatedAt: "2026-11-13T00:00:00.000Z",
      content: `# Project brief\n\nUse this page to keep a lightweight record of what you are building and why.\n\n## Purpose\n\nDescribe the problem this project solves in one or two clear sentences.\n\n## Decisions\n\n| Date | Decision | Reason |\n| --- | --- | --- |\n| 2026-11-13 | Keep source documents in Markdown | Portable, readable, and easy to own |\n\n## Open questions\n\n- What should the next small milestone achieve?\n- Which details need a source or reference?\n\n## Notes\n\nAdd links, meeting notes, and ideas as they become useful.`,
    },
    {
      id: "doc-quick-start",
      workspaceId: starterWorkspaceId,
      folderId: "folder-getting-started",
      title: "Quick start.md",
      updatedAt: "2026-11-13T00:00:00.000Z",
      content: `# Quick start\n\n## Create a note\n\nChoose **New file** in the workspace explorer and give the note a name.\n\n## Organize\n\nCreate nested folders to keep related notes together. Drag a Markdown file into this window to import it.\n\n## Keep a copy\n\nExport a note as Markdown or download a portable workspace archive from the workspace menu.`,
    },
  ];

  return {
    workspaces: [workspace],
    folders,
    documents,
    activeWorkspaceId: starterWorkspaceId,
    openDocumentIds: ["doc-welcome"],
    activeDocumentId: "doc-welcome",
    recentDocumentIds: ["doc-welcome"],
    preferences: { theme: "dark", fontSize: 14, wordWrap: true, autoSaveDelay: 700, aiProviderId: null, aiModelId: null },
  };
}

export function createWorkspaceState(name: string, now = new Date().toISOString()): Workspace {
  return { id: crypto.randomUUID(), name: name.trim() || "Untitled workspace", createdAt: now };
}

export function createMarkdownDocument(
  workspaceId: string,
  folderId: string | null,
  title: string,
  now = new Date().toISOString(),
): MarkdownDocument {
  const cleanTitle = title.trim().replace(/\.(md|markdown|txt)$/i, "");
  return {
    id: crypto.randomUUID(),
    workspaceId,
    folderId,
    title: `${cleanTitle || "Untitled"}.md`,
    content: `# ${cleanTitle || "Untitled"}\n\n`,
    updatedAt: now,
  };
}

export function createWorkspaceFolder(
  workspaceId: string,
  parentId: string | null,
  name: string,
): WorkspaceFolder {
  return { id: crypto.randomUUID(), workspaceId, parentId, name: name.trim() || "New folder" };
}

export function duplicateMarkdownDocument(
  document: MarkdownDocument,
  now = new Date().toISOString(),
): MarkdownDocument {
  return {
    ...document,
    id: crypto.randomUUID(),
    title: `${document.title.replace(/\.(md|markdown|txt)$/i, "")} copy.md`,
    updatedAt: now,
  };
}

export function renameMarkdownDocument(document: MarkdownDocument, title: string): MarkdownDocument {
  const cleanTitle = title.trim().replace(/\.(md|markdown|txt)$/i, "") || "Untitled";
  return { ...document, title: `${cleanTitle}.md`, updatedAt: new Date().toISOString() };
}

export function createWorkspaceBundle(
  state: WorkspaceState,
  workspaceId: string,
): WorkspaceBundle | null {
  const workspace = state.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) return null;
  return {
    format: "markdown-ai-workspace",
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace,
    folders: state.folders.filter((folder) => folder.workspaceId === workspaceId),
    documents: state.documents.filter((document) => document.workspaceId === workspaceId),
  };
}