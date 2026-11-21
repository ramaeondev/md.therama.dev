import { createFileRoute } from "@tanstack/react-router";
import {
  AlignLeft,
  Bold,
  Braces,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  FilePlus2,
  FolderPlus,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  LoaderCircle,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Quote,
  Search,
  Settings2,
  SplitSquareHorizontal,
  Table2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import JSZip from "jszip";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { AssistantPanel } from "@/features/ai/assistant/AssistantPanel";
import { ProviderError } from "@/features/ai/providers/errors";
import type { ProviderModel } from "@/features/ai/providers/types";
import { connectGemini, disconnectGemini, testGeminiConnection } from "@/features/ai/settings/providerConfiguration";
import { MarkdownEditor, type MarkdownEditorHandle } from "@/features/editor/MarkdownEditor";
import { getMarkdownHeadings, MarkdownPreview } from "@/features/editor/MarkdownPreview";
import { WorkspaceExplorer, type ExplorerAction } from "@/features/workspace/WorkspaceExplorer";
import { WorkspaceSettings, type ProviderConnectionStatus, type SettingsSection } from "@/features/workspace/WorkspaceSettings";
import {
  createMarkdownDocument,
  createStarterState,
  createWorkspaceBundle,
  createWorkspaceFolder,
  createWorkspaceState,
  duplicateMarkdownDocument,
  renameMarkdownDocument,
} from "@/features/workspace/model";
import { indexedDbStorage } from "@/features/workspace/storage";
import type { MarkdownDocument, WorkspaceState } from "@/features/workspace/types";

type ViewMode = "editor" | "split" | "preview";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Markdown AI Workspace — Local-first Markdown" },
      { name: "description", content: "A private, local-first Markdown workspace for organizing and editing your documentation." },
      { property: "og:title", content: "Markdown AI Workspace" },
      { property: "og:description", content: "A local-first space for your Markdown notes and documentation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspacePage,
});

const suggestedPrompts = [
  "Summarize this document",
  "Explain this section",
  "Find potential issues",
  "Generate documentation",
  "Rephrase selected text",
];

function WorkspacePage() {
  const [state, setState] = useState<WorkspaceState>(() => createStarterState());
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [mode, setMode] = useState<ViewMode>("split");
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [importing, setImporting] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderConnectionStatus>("not-configured");
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([]);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>("general");
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const skipNextSave = useRef(true);
  const activeWorkspace = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0];
  const documents = state.documents.filter((document) => document.workspaceId === state.activeWorkspaceId);
  const folders = state.folders.filter((folder) => folder.workspaceId === state.activeWorkspaceId);
  const activeDocument = documents.find((document) => document.id === state.activeDocumentId) ?? documents[0] ?? null;
  const openDocuments = state.openDocumentIds
    .map((id) => documents.find((document) => document.id === id))
    .filter((document): document is MarkdownDocument => Boolean(document));
  const headings = useMemo(() => getMarkdownHeadings(activeDocument?.content ?? ""), [activeDocument?.content]);
  const wordCount = (activeDocument?.content.trim().match(/\S+/g) ?? []).length;
  const charCount = activeDocument?.content.length ?? 0;

  useEffect(() => {
    let cancelled = false;
    void indexedDbStorage
      .load()
      .then((stored) => {
        if (cancelled) return;
        if (stored) {
          const migrated: WorkspaceState = {
            ...stored,
            workspaces: stored.workspaces?.length ? stored.workspaces : createStarterState().workspaces,
            folders: stored.folders ?? [],
            documents: stored.documents ?? [],
            openDocumentIds: stored.openDocumentIds ?? [],
            recentDocumentIds: stored.recentDocumentIds ?? [],
            preferences: { ...createStarterState().preferences, ...stored.preferences },
          };
          const activeExists = migrated.workspaces.some((workspace) => workspace.id === migrated.activeWorkspaceId);
          setState({
            ...migrated,
            activeWorkspaceId: activeExists ? migrated.activeWorkspaceId : migrated.workspaces[0]?.id ?? createStarterState().activeWorkspaceId,
          });
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) {
          setHydrated(true);
          toast.error("Local storage could not be opened in this browser.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle("dark", state.preferences.theme === "dark");
  }, [hydrated, state.preferences.theme]);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      setSaveStatus("saved");
      return;
    }
    setSaveStatus("saving");
    const timer = window.setTimeout(() => {
      void indexedDbStorage
        .save(state)
        .then(() => setSaveStatus("saved"))
        .catch(() => {
          setSaveStatus("error");
          toast.error("Your changes could not be saved locally.");
        });
    }, state.preferences.autoSaveDelay);
    return () => window.clearTimeout(timer);
  }, [hydrated, state]);

  const updateState = useCallback((updater: (current: WorkspaceState) => WorkspaceState) => {
    setState((current) => updater(current));
  }, []);

  const openDocument = useCallback((id: string) => {
    updateState((current) => ({
      ...current,
      activeDocumentId: id,
      openDocumentIds: current.openDocumentIds.includes(id) ? current.openDocumentIds : [...current.openDocumentIds, id],
      recentDocumentIds: [id, ...current.recentDocumentIds.filter((recentId) => recentId !== id)].slice(0, 10),
    }));
  }, [updateState]);

  const updateDocumentContent = useCallback((id: string, content: string) => {
    const updatedAt = new Date().toISOString();
    updateState((current) => ({
      ...current,
      documents: current.documents.map((document) => document.id === id ? { ...document, content, updatedAt } : document),
    }));
  }, [updateState]);

  function createDocument(folderId: string | null = null, title?: string, content?: string) {
    const fallback = `Untitled ${documents.length + 1}`;
    const name = title ?? window.prompt("Name this Markdown file", fallback);
    if (!name?.trim()) return;
    const document = createMarkdownDocument(state.activeWorkspaceId, folderId, name);
    if (content !== undefined) {
      document.content = content;
      document.updatedAt = new Date().toISOString();
    }
    updateState((current) => ({
      ...current,
      documents: [...current.documents, document],
      openDocumentIds: [...current.openDocumentIds, document.id],
      activeDocumentId: document.id,
      recentDocumentIds: [document.id, ...current.recentDocumentIds].slice(0, 10),
    }));
  }

  function createFolder(parentId: string | null = null, name?: string) {
    const folderName = name ?? window.prompt("Name this folder");
    if (!folderName?.trim()) return;
    const folder = createWorkspaceFolder(state.activeWorkspaceId, parentId, folderName);
    updateState((current) => ({ ...current, folders: [...current.folders, folder] }));
  }

  function handleExplorerAction(action: ExplorerAction) {
    if (action.type === "new-document") createDocument(action.folderId);
    if (action.type === "new-folder") createFolder(action.folderId);
    if (action.type === "rename-document") {
      const title = window.prompt("Rename document", action.document.title.replace(/\.(md|markdown|txt)$/i, ""));
      if (title?.trim()) updateState((current) => ({
        ...current,
        documents: current.documents.map((document) => document.id === action.document.id ? renameMarkdownDocument(document, title) : document),
      }));
    }
    if (action.type === "rename-folder") {
      const name = window.prompt("Rename folder", action.folder.name);
      if (name?.trim()) updateState((current) => ({
        ...current,
        folders: current.folders.map((folder) => folder.id === action.folder.id ? { ...folder, name: name.trim() } : folder),
      }));
    }
    if (action.type === "duplicate-document") {
      const copy = duplicateMarkdownDocument(action.document);
      updateState((current) => ({ ...current, documents: [...current.documents, copy] }));
      toast.success(`Created ${copy.title}`);
    }
    if (action.type === "delete-document") {
      if (!window.confirm(`Delete “${action.document.title}”? This cannot be undone.`)) return;
      updateState((current) => {
        const remaining = current.documents.filter((document) => document.id !== action.document.id);
        const nextActive = current.activeDocumentId === action.document.id
          ? remaining.find((document) => document.workspaceId === current.activeWorkspaceId)?.id ?? null
          : current.activeDocumentId;
        return {
          ...current,
          documents: remaining,
          openDocumentIds: current.openDocumentIds.filter((id) => id !== action.document.id),
          recentDocumentIds: current.recentDocumentIds.filter((id) => id !== action.document.id),
          activeDocumentId: nextActive,
        };
      });
    }
    if (action.type === "delete-folder") deleteFolder(action.folder);
  }

  function deleteFolder(folder: (typeof folders)[number]) {
    const descendants = new Set<string>([folder.id]);
    let hasNewDescendant = true;
    while (hasNewDescendant) {
      hasNewDescendant = false;
      for (const child of folders) {
        if (child.parentId && descendants.has(child.parentId) && !descendants.has(child.id)) {
          descendants.add(child.id);
          hasNewDescendant = true;
        }
      }
    }
    const contained = documents.filter((document) => document.folderId && descendants.has(document.folderId));
    const confirmText = contained.length ? `Delete “${folder.name}” and its ${contained.length} document(s)?` : `Delete folder “${folder.name}”?`;
    if (!window.confirm(confirmText)) return;
    const removedDocumentIds = new Set(contained.map((document) => document.id));
    updateState((current) => {
      const remaining = current.documents.filter((document) => !removedDocumentIds.has(document.id));
      return {
        ...current,
        folders: current.folders.filter((item) => !descendants.has(item.id)),
        documents: remaining,
        openDocumentIds: current.openDocumentIds.filter((id) => !removedDocumentIds.has(id)),
        recentDocumentIds: current.recentDocumentIds.filter((id) => !removedDocumentIds.has(id)),
        activeDocumentId: current.activeDocumentId && removedDocumentIds.has(current.activeDocumentId)
          ? remaining.find((document) => document.workspaceId === current.activeWorkspaceId)?.id ?? null
          : current.activeDocumentId,
      };
    });
  }

  function createWorkspace() {
    const name = window.prompt("Name your workspace", "New workspace");
    if (!name?.trim()) return;
    const workspace = createWorkspaceState(name);
    updateState((current) => ({
      ...current,
      workspaces: [...current.workspaces, workspace],
      activeWorkspaceId: workspace.id,
      activeDocumentId: null,
      openDocumentIds: [],
      recentDocumentIds: [],
    }));
    setCreatedWorkspaceId(workspace.id);
    setWorkspaceMenuOpen(false);
  }

  useEffect(() => {
    if (!createdWorkspaceId || state.activeWorkspaceId !== createdWorkspaceId) return;
    const folder = createWorkspaceFolder(createdWorkspaceId, null, "Notes");
    const document = createMarkdownDocument(createdWorkspaceId, folder.id, "Welcome");
    document.content = `# Welcome to ${activeWorkspace?.name ?? "your workspace"}\n\nCreate a note, add a folder, or import existing Markdown to get started. Your documents stay in this browser.\n`;
    setCreatedWorkspaceId(null);
    updateState((current) => ({
      ...current,
      folders: [...current.folders, folder],
      documents: [...current.documents, document],
      openDocumentIds: [document.id],
      activeDocumentId: document.id,
      recentDocumentIds: [document.id],
    }));
  }, [activeWorkspace?.name, createdWorkspaceId, state.activeWorkspaceId, updateState]);

  function switchWorkspace(id: string) {
    const nextDocument = state.documents.find((document) => document.workspaceId === id);
    updateState((current) => ({
      ...current,
      activeWorkspaceId: id,
      activeDocumentId: nextDocument?.id ?? null,
      openDocumentIds: nextDocument ? [nextDocument.id] : [],
    }));
    setWorkspaceMenuOpen(false);
  }

  function closeTab(id: string, event: React.MouseEvent) {
    event.stopPropagation();
    updateState((current) => {
      const nextTabs = current.openDocumentIds.filter((item) => item !== id);
      return {
        ...current,
        openDocumentIds: nextTabs,
        activeDocumentId: current.activeDocumentId === id ? nextTabs.at(-1) ?? null : current.activeDocumentId,
      };
    });
  }

  async function importFiles(files: FileList | File[]) {
    const markdownFiles = Array.from(files).filter((file) => /\.(md|markdown|txt)$/i.test(file.name));
    if (markdownFiles.length === 0) {
      toast.error("Choose a .md, .markdown, or .txt file.");
      return;
    }
    setImporting(true);
    try {
      for (const file of markdownFiles) {
        createDocument(null, file.name, await file.text());
      }
      toast.success(`Imported ${markdownFiles.length} Markdown ${markdownFiles.length === 1 ? "file" : "files"}`);
    } catch {
      toast.error("One or more files could not be read.");
    } finally {
      setImporting(false);
    }
  }

  function exportDocument(document: MarkdownDocument) {
    downloadBlob(new Blob([document.content], { type: "text/markdown;charset=utf-8" }), document.title);
    toast.success(`Exported ${document.title}`);
  }

  async function exportWorkspace() {
    const bundle = createWorkspaceBundle(state, state.activeWorkspaceId);
    if (!bundle) return;
    const zip = new JSZip();
    const folderById = new Map(bundle.folders.map((folder) => [folder.id, folder]));
    function folderPath(folderId: string | null): string {
      if (!folderId) return "";
      const folder = folderById.get(folderId);
      if (!folder) return "";
      return `${folderPath(folder.parentId)}${safeFileName(folder.name)}/`;
    }
    for (const document of bundle.documents) {
      zip.file(`${folderPath(document.folderId)}${safeFileName(document.title)}`, document.content);
    }
    zip.file(".markdown-ai-workspace.json", JSON.stringify(bundle, null, 2));
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `${safeFileName(bundle.workspace.name)}.zip`);
    toast.success("Workspace exported");
  }

  async function importWorkspace(file: File) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error("Choose a workspace .zip backup.");
      return;
    }
    try {
      const zip = await JSZip.loadAsync(file);
      const manifestFile = zip.file(".markdown-ai-workspace.json");
      if (manifestFile) {
        const raw = JSON.parse(await manifestFile.async("string")) as unknown;
        if (!isWorkspaceBundle(raw)) throw new Error("Invalid workspace archive");
        const newWorkspace = { ...raw.workspace, id: crypto.randomUUID(), name: `${raw.workspace.name} (imported)` };
        const folderIdMap = new Map(raw.folders.map((folder) => [folder.id, crypto.randomUUID()]));
        const importedFolders = raw.folders.map((folder) => ({
          ...folder,
          id: folderIdMap.get(folder.id) ?? crypto.randomUUID(),
          workspaceId: newWorkspace.id,
          parentId: folder.parentId ? folderIdMap.get(folder.parentId) ?? null : null,
        }));
        const importedDocuments = raw.documents.map((document) => ({
          ...document,
          id: crypto.randomUUID(),
          workspaceId: newWorkspace.id,
          folderId: document.folderId ? folderIdMap.get(document.folderId) ?? null : null,
        }));
        updateState((current) => ({
          ...current,
          workspaces: [...current.workspaces, newWorkspace],
          folders: [...current.folders, ...importedFolders],
          documents: [...current.documents, ...importedDocuments],
          activeWorkspaceId: newWorkspace.id,
          activeDocumentId: importedDocuments[0]?.id ?? null,
          openDocumentIds: importedDocuments.slice(0, 1).map((document) => document.id),
          recentDocumentIds: importedDocuments.slice(0, 10).map((document) => document.id),
        }));
        toast.success(`Imported ${newWorkspace.name}`);
        return;
      }
      const markdownEntries = Object.values(zip.files).filter((entry) => !entry.dir && /\.(md|markdown|txt)$/i.test(entry.name));
      if (markdownEntries.length === 0) throw new Error("No Markdown files found");
      const workspace = createWorkspaceState(file.name.replace(/\.zip$/i, ""));
      const foldersByPath = new Map<string, string>();
      const importedDocuments: MarkdownDocument[] = [];
      for (const entry of markdownEntries) {
        const pathParts = entry.name.split("/").filter(Boolean);
        const title = pathParts.pop();
        if (!title) continue;
        let parentId: string | null = null;
        let currentPath = "";
        for (const folderName of pathParts) {
          currentPath += `${folderName}/`;
          let id = foldersByPath.get(currentPath);
          if (!id) {
            const folder = createWorkspaceFolder(workspace.id, parentId, folderName);
            foldersByPath.set(currentPath, folder.id);
            id = folder.id;
            updateState((current) => ({ ...current, folders: [...current.folders, folder] }));
          }
          parentId = id;
        }
        importedDocuments.push({
          ...createMarkdownDocument(workspace.id, parentId, title),
          content: await entry.async("string"),
        });
      }
      updateState((current) => ({
        ...current,
        workspaces: [...current.workspaces, workspace],
        documents: [...current.documents, ...importedDocuments],
        activeWorkspaceId: workspace.id,
        activeDocumentId: importedDocuments[0]?.id ?? null,
        openDocumentIds: importedDocuments.slice(0, 1).map((document) => document.id),
      }));
      toast.success(`Imported ${workspace.name}`);
    } catch {
      toast.error("This archive could not be imported.");
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    void importFiles(event.dataTransfer.files);
  }

  async function handleConnectGemini(apiKey: string): Promise<boolean> {
    setProviderStatus("connecting");
    try {
      const { models } = await connectGemini(apiKey);
      setProviderModels(models);
      setProviderStatus("connected");
      updateState((current) => {
        const selected = models.find((model) => model.id === current.preferences.aiModelId) ?? models[0];
        return {
          ...current,
          preferences: {
            ...current.preferences,
            aiProviderId: "gemini",
            aiModelId: selected?.id ?? null,
          },
        };
      });
      toast.success("Gemini connected");
      return true;
    } catch (error) {
      setProviderStatus("failed");
      setProviderModels([]);
      toast.error(error instanceof ProviderError ? error.message : "Gemini connection failed. Check your key and try again.");
      return false;
    }
  }

  async function handleTestGemini() {
    setProviderStatus("testing");
    try {
      const { models } = await testGeminiConnection();
      setProviderModels(models);
      setProviderStatus("connected");
      updateState((current) => ({
        ...current,
        preferences: {
          ...current.preferences,
          aiProviderId: "gemini",
          aiModelId: models.some((model) => model.id === current.preferences.aiModelId)
            ? current.preferences.aiModelId
            : models[0]?.id ?? null,
        },
      }));
      toast.success("Gemini connection is working");
    } catch (error) {
      disconnectGemini();
      setProviderStatus("failed");
      setProviderModels([]);
      toast.error(error instanceof ProviderError ? error.message : "Gemini connection failed. Check your key and try again.");
    }
  }

  function handleDisconnectGemini() {
    disconnectGemini();
    setProviderStatus("not-configured");
    setProviderModels([]);
    toast.message("Gemini key cleared from this session");
  }

  function openAISettings() {
    setSettingsInitialSection("ai");
    setSettingsOpen(true);
  }

  const setPreferences = (preferences: WorkspaceState["preferences"]) => {
    updateState((current) => ({ ...current, preferences }));
  };

  return (
    <main className="workspace-shell flex h-dvh min-h-[520px] flex-col overflow-hidden bg-background text-foreground" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <header className="flex h-12 shrink-0 items-center border-b border-border bg-background">
        <div className="flex h-full w-[276px] shrink-0 items-center border-r border-border px-3">
          <Button variant="ghost" size="icon" className="mr-2 h-7 w-7 text-muted-foreground" title="Toggle sidebar" aria-label="Toggle sidebar">
            <ChevronLeft />
          </Button>
          <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setWorkspaceMenuOpen((open) => !open)} aria-expanded={workspaceMenuOpen}>
            <span className="truncate text-xs font-medium">{activeWorkspace?.name ?? "Workspace"}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
          <Button variant="ghost" size="icon" className="ml-1 h-7 w-7 text-muted-foreground" title="Create workspace" aria-label="Create workspace" onClick={createWorkspace}><FolderPlus /></Button>
          {workspaceMenuOpen && (
            <div className="absolute left-3 top-11 z-50 w-60 rounded-md border border-border bg-popover p-1 shadow-xl">
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground">Workspaces on this device</div>
              {state.workspaces.map((workspace) => (
                <Button key={workspace.id} variant={workspace.id === state.activeWorkspaceId ? "secondary" : "ghost"} className="h-8 w-full justify-start text-xs" onClick={() => switchWorkspace(workspace.id)}>
                  <span className="truncate">{workspace.name}</span>{workspace.id === state.activeWorkspaceId && <Check className="ml-auto" />}
                </Button>
              ))}
              <div className="my-1 border-t border-border" />
              <Button variant="ghost" className="h-8 w-full justify-start text-xs" onClick={createWorkspace}><FolderPlus /> Create workspace</Button>
              <Button variant="ghost" className="h-8 w-full justify-start text-xs" onClick={() => folderInputRef.current?.click()}><Upload /> Import workspace backup</Button>
              <Button variant="ghost" className="h-8 w-full justify-start text-xs" onClick={() => void exportWorkspace()}><Download /> Export this workspace</Button>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between px-3">
          <div className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
            {activeDocument && <><span className="truncate">{activeDocument.title}</span><ChevronRight className="h-3 w-3" /><span>{mode === "split" ? "Split view" : mode === "editor" ? "Editor" : "Preview"}</span></>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-1 text-[10px] text-muted-foreground sm:flex" aria-live="polite">
              {saveStatus === "saving" ? <><LoaderCircle className="h-3 w-3 animate-spin" /> Saving</> : saveStatus === "error" ? <><span className="h-1.5 w-1.5 rounded-full bg-destructive" /> Save failed</> : <><Check className="h-3 w-3 text-primary" /> Saved locally</>}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="Import Markdown file" aria-label="Import Markdown file" onClick={() => fileInputRef.current?.click()}><Upload /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="Export workspace" aria-label="Export workspace" onClick={() => void exportWorkspace()}><FileDown /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="Preferences" aria-label="Preferences" onClick={() => { setSettingsInitialSection("general"); setSettingsOpen(true); }}><Settings2 /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title={assistantOpen ? "Hide assistant panel" : "Show assistant panel"} aria-label={assistantOpen ? "Hide assistant panel" : "Show assistant panel"} onClick={() => setAssistantOpen((open) => !open)}>{assistantOpen ? <PanelRightClose /> : <PanelRightOpen />}</Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="19%" minSize="15%" maxSize="28%" className="min-w-0">
            <WorkspaceExplorer
              workspaceName={activeWorkspace?.name ?? "Workspace"}
              documents={documents}
              folders={folders}
              activeDocumentId={activeDocument?.id ?? null}
              recentDocumentIds={state.recentDocumentIds.filter((id) => documents.some((document) => document.id === id))}
              onOpenDocument={openDocument}
              onAction={handleExplorerAction}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="60%" minSize="36%" className="min-w-0">
            <section className="flex h-full min-h-0 flex-col bg-background" aria-label="Markdown workspace editor">
              <div className="flex h-10 shrink-0 items-stretch border-b border-border bg-background">
                <div className="flex min-w-0 flex-1 overflow-x-auto">
                  {openDocuments.map((document) => (
                    <div key={document.id} className={`group flex max-w-48 shrink-0 items-center border-r border-border ${activeDocument?.id === document.id ? "bg-card" : "bg-muted/30"}`}>
                      <button onClick={() => openDocument(document.id)} className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-xs">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${saveStatus === "saving" && activeDocument?.id === document.id ? "bg-primary" : "bg-muted-foreground/50"}`} />
                        <span className="truncate">{document.title}</span>
                      </button>
                      <Button variant="ghost" size="icon" className="mr-1 h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100" title="Close tab" aria-label={`Close ${document.title} tab`} onClick={(event) => closeTab(document.id, event)}><X /></Button>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" size="icon" className="m-1 h-7 w-7 shrink-0 text-muted-foreground" title="New file" aria-label="New file" onClick={() => createDocument()}><FilePlus2 /></Button>
              </div>

              <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-y-1 border-b border-border px-2 py-1">
                <div className="flex items-center gap-0.5">
                  <ToolbarButton label="Bold" onClick={() => editorRef.current?.format("**", "**")}><Bold /></ToolbarButton>
                  <ToolbarButton label="Italic" onClick={() => editorRef.current?.format("_", "_")}><Italic /></ToolbarButton>
                  <span className="mx-1 h-4 w-px bg-border" />
                  <ToolbarButton label="Heading 1" onClick={() => editorRef.current?.format("# ")}><Heading1 /></ToolbarButton>
                  <ToolbarButton label="Heading 2" onClick={() => editorRef.current?.format("## ")}><Heading2 /></ToolbarButton>
                  <span className="mx-1 h-4 w-px bg-border" />
                  <ToolbarButton label="Bulleted list" onClick={() => editorRef.current?.format("- ")}><List /></ToolbarButton>
                  <ToolbarButton label="Numbered list" onClick={() => editorRef.current?.format("1. ")}><ListOrdered /></ToolbarButton>
                  <ToolbarButton label="Quote" onClick={() => editorRef.current?.format("> ")}><Quote /></ToolbarButton>
                  <ToolbarButton label="Code block" onClick={() => editorRef.current?.format("```\n", "\n``` ")}><Braces /></ToolbarButton>
                  <ToolbarButton label="Table" onClick={() => editorRef.current?.format("| Column | Column |\n| --- | --- |\n| Cell | Cell |\n")}><Table2 /></ToolbarButton>
                </div>
                <div className="flex items-center gap-1">
                  <div className="mr-1 hidden items-center gap-0.5 border-r border-border pr-1 sm:flex">
                    {(["editor", "split", "preview"] as const).map((viewMode) => {
                      const Icon = viewMode === "editor" ? AlignLeft : viewMode === "split" ? SplitSquareHorizontal : Search;
                      return (
                        <Button key={viewMode} variant={mode === viewMode ? "secondary" : "ghost"} size="icon" className="h-7 w-7" title={`${viewMode.slice(0, 1).toUpperCase()}${viewMode.slice(1)} view`} aria-label={`${viewMode.slice(0, 1).toUpperCase()}${viewMode.slice(1)} view`} onClick={() => setMode(viewMode)}><Icon /></Button>
                      );
                    })}
                  </div>
                  <Button variant={showOutline ? "secondary" : "ghost"} size="icon" className="h-7 w-7 text-muted-foreground" title="Document outline" aria-label="Document outline" onClick={() => setShowOutline((visible) => !visible)}><MoreHorizontal /></Button>
                </div>
              </div>

              {showOutline && (
                <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-muted/20 px-3 py-2">
                  <span className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">Outline</span>
                  {headings.length === 0 && <span className="text-xs text-muted-foreground">Add headings to navigate this document.</span>}
                  {headings.map((heading, index) => (
                    <Button key={`${heading.id}-${index}`} variant="ghost" className="h-6 shrink-0 text-xs font-normal" onClick={() => editorRef.current?.jumpToHeading(heading.text)}>
                      <span className="text-muted-foreground">{"#".repeat(heading.level)}</span>{heading.text}
                    </Button>
                  ))}
                </div>
              )}

              {activeDocument ? (
                <div className="flex min-h-0 flex-1">
                  {(mode === "editor" || mode === "split") && (
                    <div className={`min-h-0 min-w-0 flex-1 overflow-hidden ${mode === "split" ? "border-r border-border" : ""}`}>
                      <MarkdownEditor
                        ref={editorRef}
                        value={activeDocument.content}
                        onChange={(content) => updateDocumentContent(activeDocument.id, content)}
                        fontSize={state.preferences.fontSize}
                        wordWrap={state.preferences.wordWrap}
                      />
                    </div>
                  )}
                  {(mode === "preview" || mode === "split") && (
                    <ScrollArea className={`h-full min-w-0 ${mode === "split" ? "flex-1" : "w-full"}`}>
                      <MarkdownPreview content={activeDocument.content} />
                    </ScrollArea>
                  )}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
                  <div className="max-w-sm">
                    <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card"><FilePlus2 className="h-5 w-5 text-muted-foreground" /></div>
                    <h2 className="text-sm font-medium">No document open</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Create a Markdown file or import one to start writing.</p>
                    <div className="mt-4 flex justify-center gap-2">
                      <Button size="sm" onClick={() => createDocument()}><FilePlus2 /> New file</Button>
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload /> Import</Button>
                    </div>
                  </div>
                </div>
              )}

              <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-background px-3 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-3"><span>Markdown</span><span>{activeDocument ? activeDocument.title.split(".").at(-1)?.toUpperCase() : "No file"}</span></div>
                <div className="flex items-center gap-3"><span>{wordCount} words</span><span>{charCount} characters</span><span>UTF-8</span></div>
              </footer>
            </section>
          </ResizablePanel>
          {assistantOpen && <ResizableHandle withHandle />}
          {assistantOpen && (
            <ResizablePanel defaultSize="21%" minSize="17%" maxSize="30%" className="min-w-0">
              <AssistantPanel
                workspaceName={activeWorkspace?.name ?? "Workspace"}
                documentTitle={activeDocument?.title ?? null}
                documentContent={activeDocument?.content ?? ""}
                prompts={suggestedPrompts}
                isConnected={providerStatus === "connected" && state.preferences.aiProviderId === "gemini"}
                modelId={state.preferences.aiProviderId === "gemini" ? state.preferences.aiModelId : null}
                onConfigure={openAISettings}
              />
            </ResizablePanel>
          )}
        </ResizablePanelGroup>
      </div>

      <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple className="hidden" onChange={(event) => { if (event.target.files) void importFiles(event.target.files); event.target.value = ""; }} />
      <input ref={folderInputRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importWorkspace(file); event.target.value = ""; }} />
      {importing && <div className="fixed bottom-10 right-4 z-50 flex items-center gap-2 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Importing files…</div>}
      <WorkspaceSettings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        preferences={state.preferences}
        onChange={setPreferences}
        initialSection={settingsInitialSection}
        providerStatus={providerStatus}
        providerModels={providerModels}
        onConnectGemini={handleConnectGemini}
        onTestGemini={() => void handleTestGemini()}
        onDisconnectGemini={handleDisconnectGemini}
      />
    </main>
  );
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title={label} aria-label={label} onClick={onClick}>{children}</Button>;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]/g, "-");
}

function isWorkspaceBundle(value: unknown): value is NonNullable<ReturnType<typeof createWorkspaceBundle>> {
  if (!value || typeof value !== "object") return false;
  const bundle = value as Partial<NonNullable<ReturnType<typeof createWorkspaceBundle>>>;
  return bundle.format === "markdown-ai-workspace" && bundle.version === 1
    && typeof bundle.workspace?.name === "string"
    && Array.isArray(bundle.folders)
    && Array.isArray(bundle.documents)
    && bundle.documents.every((document) => typeof document.id === "string" && typeof document.title === "string" && typeof document.content === "string");
}