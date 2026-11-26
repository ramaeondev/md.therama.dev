import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceExplorer, type ExplorerAction } from "./WorkspaceExplorer";
import type { MarkdownDocument, WorkspaceFolder } from "./types";

const document: MarkdownDocument = {
  id: "doc-a",
  workspaceId: "workspace-a",
  folderId: null,
  title: "Notes.md",
  content: "Searchable content",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const folder: WorkspaceFolder = {
  id: "folder-a",
  workspaceId: "workspace-a",
  parentId: null,
  name: "Research",
};

function setup() {
  const actions: ExplorerAction[] = [];
  const onOpenDocument = vi.fn();
  render(
    <WorkspaceExplorer
      workspaceName="Workspace A"
      documents={[document]}
      folders={[folder]}
      activeDocumentId={document.id}
      recentDocumentIds={[document.id]}
      onOpenDocument={onOpenDocument}
      onAction={(action) => actions.push(action)}
    />,
  );
  return { actions, onOpenDocument };
}

describe("Workspace explorer controls", () => {
  it("opens documents and dispatches new-folder and new-file actions", () => {
    const { actions, onOpenDocument } = setup();
    fireEvent.click(screen.getAllByRole("button", { name: "Notes.md" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    expect(onOpenDocument).toHaveBeenCalledWith(document.id);
    expect(actions.map((action) => action.type)).toEqual(["new-folder", "new-document"]);
    expect(actions[0]).toMatchObject({ folderId: null });
  });

  it("supports duplicate, export, rename, and delete for each document", () => {
    const { actions } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Notes.md" }));
    fireEvent.click(screen.getByRole("button", { name: "Export Notes.md" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename Notes.md" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Notes.md" }));
    expect(actions.map((action) => action.type)).toEqual([
      "duplicate-document",
      "export-document",
      "rename-document",
      "delete-document",
    ]);
    for (const action of actions) expect(action).toMatchObject({ document });
  });

  it("filters document title and body text and reports result count", () => {
    setup();
    const search = screen.getByRole("textbox", { name: "Search documents" });
    fireEvent.change(search, { target: { value: "searchable" } });
    expect(screen.getByRole("button", { name: "Notes.md" })).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "absent" } });
    expect(screen.getByText("No matching documents")).toBeInTheDocument();
  });

  it("expands and collapses folder contents and routes folder actions", () => {
    const nestedDocument = { ...document, folderId: folder.id };
    const actions: ExplorerAction[] = [];
    render(
      <WorkspaceExplorer
        workspaceName="Workspace A"
        documents={[nestedDocument]}
        folders={[folder]}
        activeDocumentId={nestedDocument.id}
        recentDocumentIds={[]}
        onOpenDocument={vi.fn()}
        onAction={(action) => actions.push(action)}
      />,
    );
    expect(screen.getByRole("button", { name: "Notes.md" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Research" }));
    expect(screen.queryByRole("button", { name: "Notes.md" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand Research" }));
    expect(screen.getByRole("button", { name: "Notes.md" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New file in Research" }));
    fireEvent.click(screen.getByRole("button", { name: "Folder actions for Research" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete folder Research" }));
    expect(actions.map((action) => action.type)).toEqual([
      "new-document",
      "rename-folder",
      "delete-folder",
    ]);
  });
});
