import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MarkdownDocument, WorkspaceFolder } from "./types";

export type ExplorerAction =
  | { type: "new-document"; folderId: string | null }
  | { type: "new-folder"; folderId: string | null }
  | { type: "rename-document"; document: MarkdownDocument }
  | { type: "rename-folder"; folder: WorkspaceFolder }
  | { type: "duplicate-document"; document: MarkdownDocument }
  | { type: "delete-document"; document: MarkdownDocument }
  | { type: "delete-folder"; folder: WorkspaceFolder };

type WorkspaceExplorerProps = {
  workspaceName: string;
  documents: MarkdownDocument[];
  folders: WorkspaceFolder[];
  activeDocumentId: string | null;
  recentDocumentIds: string[];
  onOpenDocument: (id: string) => void;
  onAction: (action: ExplorerAction) => void;
};

export function WorkspaceExplorer({
  workspaceName,
  documents,
  folders,
  activeDocumentId,
  recentDocumentIds,
  onOpenDocument,
  onAction,
}: WorkspaceExplorerProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(["folder-generated"]));
  const normalizedQuery = query.trim().toLowerCase();
  const filteredDocuments = useMemo(
    () =>
      documents.filter((document) =>
        `${document.title} ${document.content}`.toLowerCase().includes(normalizedQuery),
      ),
    [documents, normalizedQuery],
  );
  const recentDocuments = recentDocumentIds
    .map((id) => documents.find((document) => document.id === id))
    .filter((document): document is MarkdownDocument => Boolean(document));

  function toggleFolder(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderTree(parentId: string | null, depth = 0): React.ReactNode {
    const childFolders = folders.filter((folder) => folder.parentId === parentId);
    const childDocuments = filteredDocuments.filter((document) => document.folderId === parentId);
    return (
      <div>
        {childFolders.map((folder) => {
          const isCollapsed = collapsed.has(folder.id);
          const folderDocuments = filteredDocuments.filter((document) => document.folderId === folder.id);
          const folderChildren = folders.some((item) => item.parentId === folder.id);
          const visible = !normalizedQuery || folderDocuments.length > 0 || folderChildren;
          if (!visible) return null;
          return (
            <div key={folder.id}>
              <div className="group flex h-8 items-center gap-1 pr-1" style={{ paddingLeft: `${depth * 14 + 4}px` }}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground"
                  onClick={() => toggleFolder(folder.id)}
                  aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${folder.name}`}
                >
                  {isCollapsed ? <ChevronRight /> : <ChevronDown />}
                </Button>
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">{folder.name}</span>
                <div className="hidden shrink-0 items-center group-hover:flex group-focus-within:flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground"
                    title="New file in folder"
                    aria-label={`New file in ${folder.name}`}
                    onClick={() => onAction({ type: "new-document", folderId: folder.id })}
                  >
                    <FilePlus2 />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground"
                    title="Folder actions"
                    aria-label={`Folder actions for ${folder.name}`}
                    onClick={() => onAction({ type: "rename-folder", folder })}
                  >
                    <MoreHorizontal />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    title="Delete folder"
                    aria-label={`Delete folder ${folder.name}`}
                    onClick={() => onAction({ type: "delete-folder", folder })}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {!isCollapsed && renderTree(folder.id, depth + 1)}
            </div>
          );
        })}
        {childDocuments.map((document) => (
          <DocumentRow
            key={document.id}
            document={document}
            active={document.id === activeDocumentId}
            depth={depth}
            onOpen={onOpenDocument}
            onAction={onAction}
          />
        ))}
      </div>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">Markdown</div>
          <div className="text-[10px] uppercase text-muted-foreground">Local workspace</div>
        </div>
        <span className="h-2 w-2 rounded-full bg-primary" title="Stored on this device" />
      </div>

      <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
        <div className="min-w-0 truncate text-sm font-medium" title={workspaceName}>{workspaceName}</div>
        <div className="flex shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="New folder" aria-label="New folder" onClick={() => onAction({ type: "new-folder", folderId: null })}>
            <FolderPlus />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="New file" aria-label="New file" onClick={() => onAction({ type: "new-document", folderId: null })}>
            <FilePlus2 />
          </Button>
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a document"
            aria-label="Search documents"
            className="h-8 border-transparent bg-background/50 pl-8 text-xs shadow-none focus-visible:border-ring"
          />
          {query && (
            <span className="absolute right-2.5 top-2.5 text-[10px] tabular-nums text-muted-foreground">
              {filteredDocuments.length}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {!normalizedQuery && recentDocuments.length > 0 && (
          <section className="mb-5">
            <div className="px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase text-muted-foreground">Recent</div>
            {recentDocuments.slice(0, 4).map((document) => (
              <DocumentRow
                key={`recent-${document.id}`}
                document={document}
                active={document.id === activeDocumentId}
                depth={0}
                compact
                onOpen={onOpenDocument}
                onAction={onAction}
              />
            ))}
          </section>
        )}
        <div className="flex h-7 items-center justify-between px-2 text-[10px] font-semibold uppercase text-muted-foreground">
          <span>{normalizedQuery ? "Search results" : "Files"}</span>
          {!normalizedQuery && <span className="tabular-nums">{documents.length}</span>}
        </div>
        {renderTree(null)}
        {normalizedQuery && filteredDocuments.length === 0 && (
          <div className="px-3 py-5 text-xs text-muted-foreground">No matching documents</div>
        )}
      </div>

      <div className="border-t border-border px-4 py-3 text-[10px] text-muted-foreground">
        <span className="font-mono">LOCAL</span><span className="px-2">·</span>{documents.length} documents
      </div>
    </aside>
  );
}

function DocumentRow({
  document,
  active,
  depth,
  compact = false,
  onOpen,
  onAction,
}: {
  document: MarkdownDocument;
  active: boolean;
  depth: number;
  compact?: boolean;
  onOpen: (id: string) => void;
  onAction: (action: ExplorerAction) => void;
}) {
  return (
    <div className={cn("group flex h-8 items-center rounded-sm pr-1", active && "bg-accent text-accent-foreground")} style={{ paddingLeft: `${depth * 14 + 4}px` }}>
      <Button
        variant="ghost"
        className="h-8 min-w-0 flex-1 justify-start gap-2 px-2 text-left font-normal hover:bg-transparent"
        onClick={() => onOpen(document.id)}
        title={document.title}
      >
        <FileText className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
        <span className="truncate text-xs">{document.title}</span>
      </Button>
      {!compact && (
        <div className="hidden shrink-0 items-center group-hover:flex group-focus-within:flex">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" title="Duplicate document" aria-label={`Duplicate ${document.title}`} onClick={() => onAction({ type: "duplicate-document", document })}><Copy /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" title="Rename document" aria-label={`Rename ${document.title}`} onClick={() => onAction({ type: "rename-document", document })}><Pencil /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" title="Delete document" aria-label={`Delete ${document.title}`} onClick={() => onAction({ type: "delete-document", document })}><Trash2 /></Button>
        </div>
      )}
    </div>
  );
}