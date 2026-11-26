import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlignLeft,
  Bold,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  FileDown,
  FilePlus2,
  FolderPlus,
  Github,
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
  Sparkles,
  SplitSquareHorizontal,
  Table2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import JSZip from "jszip";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { AssistantPanel } from "@/features/ai/assistant/AssistantPanel";
import { REPOSITORY } from "@/features/open-source/repository";
import { GuidedTour, type GuidedTourStep } from "@/features/tour/GuidedTour";
import { markdownWritingSkills } from "@/features/ai/assistant/writingSkills";
import {
  generateMarkdownCompletion,
  rewriteSelectedMarkdown,
} from "@/features/ai/assistant/completionService";
import { syncWorkspaceDocuments } from "@/features/ai/rag/indexQueue";
import { ProviderError } from "@/features/ai/providers/errors";
import { openAiCompatibleProviderId } from "@/features/ai/providers/openaiCompatible";
import { PROXY_BASE_PATH } from "@/features/ai/providers/shared/proxyProtocol";
import { providerRegistry } from "@/features/ai/providers";
import {
  connectProvider,
  disconnectProvider,
  ensureCustomProvidersLoaded,
  getActiveProviderId,
  listConnectedProviders,
  providerDisplayName,
  removeCustomProvider,
  restoreConnectedProviders,
  saveCustomProvider,
  setActiveProvider,
  testProviderConnection,
  type CustomProviderDefinition,
} from "@/features/ai/settings/providerConfiguration";
import type { ConnectedProviderSummary } from "@/features/ai/settings/ProviderSettingsPanel";
import { LocalFolderConflictError, LocalFolderPermissionError, localFolderStorage } from "@/features/workspace/localFolderStorage";
import { MarkdownEditor, type MarkdownEditorHandle } from "@/features/editor/MarkdownEditor";
import { getMarkdownHeadings, MarkdownPreview } from "@/features/editor/MarkdownPreview";
import { WorkspaceExplorer, type ExplorerAction } from "@/features/workspace/WorkspaceExplorer";
import { WorkspaceSettings, type SettingsSection } from "@/features/workspace/WorkspaceSettings";
import {
  createMarkdownDocument,
  createStarterState,
  createWorkspaceBundle,
  createWorkspaceFolder,
  createWorkspaceState,
  duplicateMarkdownDocument,
  renameMarkdownDocument,
} from "@/features/workspace/model";
import { indexedDbStorage, type DocumentStorageAdapter } from "@/features/workspace/storage";
import type { MarkdownDocument, WorkspaceFolder, WorkspaceState } from "@/features/workspace/types";

type ViewMode = "editor" | "split" | "preview";

type WorkspaceModal =
  | { type: "new-document"; folderId: string | null; defaultValue: string }
  | { type: "new-folder"; parentId: string | null }
  | { type: "rename-document"; document: MarkdownDocument }
  | { type: "rename-folder"; folder: WorkspaceFolder }
  | { type: "new-workspace" }
  | { type: "delete-document"; document: MarkdownDocument }
  | {
      type: "delete-folder";
      folder: WorkspaceFolder;
      descendants: Set<string>;
      removedDocumentIds: Set<string>;
      description: string;
    };

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Markdown AI Workspace — Local-first Markdown" },
      {
        name: "description",
        content:
          "A private, local-first Markdown workspace for organizing and editing your documentation.",
      },
      { property: "og:title", content: "Markdown AI Workspace" },
      {
        property: "og:description",
        content: "A local-first space for your Markdown notes and documentation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspacePage,
});

const suggestedPrompts = markdownWritingSkills.map((skill) => skill.label);

function WorkspacePage() {
  const [state, setState] = useState<WorkspaceState>(() => createStarterState());
  const [hydrated, setHydrated] = useState(false);
  const [localFolderName, setLocalFolderName] = useState<string | null>(null);
  const [localFolderSupported, setLocalFolderSupported] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [mode, setMode] = useState<ViewMode>("split");
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [completionStatus, setCompletionStatus] = useState<"idle" | "loading" | "suggested">("idle");
  const [selectedMarkdownLength, setSelectedMarkdownLength] = useState(0);
  const [importing, setImporting] = useState(false);
  const [connectedProviders, setConnectedProviders] = useState<ConnectedProviderSummary[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [customProviders, setCustomProviders] = useState<CustomProviderDefinition[]>([]);
  const [busyProviderId, setBusyProviderId] = useState<string | null>(null);
  const [providerStatuses, setProviderStatuses] = useState<
    Record<string, "connecting" | "testing" | "failed">
  >({});
  const [providerErrors, setProviderErrors] = useState<Record<string, string>>({});
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>("general");
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(null);
  const [workspaceModal, setWorkspaceModal] = useState<WorkspaceModal | null>(null);
  const [pendingSourceJump, setPendingSourceJump] = useState<{
    documentId: string;
    headingPath: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const skipNextSave = useRef(true);
  const storageRef = useRef<DocumentStorageAdapter>(indexedDbStorage);
  const activeWorkspace =
    state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ??
    state.workspaces[0];
  const documents = useMemo(
    () => state.documents.filter((document) => document.workspaceId === state.activeWorkspaceId),
    [state.documents, state.activeWorkspaceId],
  );
  const folders = state.folders.filter((folder) => folder.workspaceId === state.activeWorkspaceId);
  const activeDocument =
    documents.find((document) => document.id === state.activeDocumentId) ?? documents[0] ?? null;
  const canSuggestCompletion = Boolean(
    activeDocument &&
      state.preferences.aiProviderId &&
      activeProviderId === state.preferences.aiProviderId &&
      state.preferences.aiModelId &&
      connectedProviders.some((entry) => entry.providerId === state.preferences.aiProviderId),
  );
  const openDocuments = state.openDocumentIds
    .map((id) => documents.find((document) => document.id === id))
    .filter((document): document is MarkdownDocument => Boolean(document));
  const headings = useMemo(
    () => getMarkdownHeadings(activeDocument?.content ?? ""),
    [activeDocument?.content],
  );
  const wordCount = (activeDocument?.content.trim().match(/\S+/g) ?? []).length;
  const charCount = activeDocument?.content.length ?? 0;

  const handleTourStepChange = useCallback((step: GuidedTourStep) => {
    if (step.openAssistant) setAssistantOpen(true);
    if (step.settingsSection) {
      setSettingsInitialSection(step.settingsSection);
      setSettingsOpen(true);
    } else {
      setSettingsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (hydrated && window.localStorage.getItem("markdown-ai-workspace-tour-complete") !== "true") {
      setTourOpen(true);
    }
  }, [hydrated]);

  useEffect(() => {
    if (!pendingSourceJump || activeDocument?.id !== pendingSourceJump.documentId) return;
    const heading = pendingSourceJump.headingPath.at(-1);
    if (heading) editorRef.current?.jumpToHeading(heading, pendingSourceJump.headingPath);
    setPendingSourceJump(null);
  }, [activeDocument?.id, pendingSourceJump]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLocalFolderSupported(await localFolderStorage.hasPicker());
      const savedFolderName = await localFolderStorage.getFolderName();
      if (savedFolderName) {
        setLocalFolderName(savedFolderName);
        try {
          const folderState = await localFolderStorage.loadSaved();
          if (!cancelled && folderState) {
            storageRef.current = localFolderStorage;
            setState(folderState);
            setHydrated(true);
            return;
          }
        } catch (error) {
          if (error instanceof LocalFolderPermissionError) {
            setLocalFolderName(null);
            toast.error("Reconnect your local workspace folder in Preferences to use MCP changes.");
          } else {
            setLocalFolderName(null);
            toast.error("The local workspace folder could not be opened.");
          }
        }
      }
      const stored = await indexedDbStorage.load();
      if (cancelled) return;
        if (stored) {
          const migrated: WorkspaceState = {
            ...stored,
            workspaces: stored.workspaces?.length
              ? stored.workspaces
              : createStarterState().workspaces,
            folders: stored.folders ?? [],
            documents: stored.documents ?? [],
            openDocumentIds: stored.openDocumentIds ?? [],
            recentDocumentIds: stored.recentDocumentIds ?? [],
            preferences: { ...createStarterState().preferences, ...stored.preferences },
          };
          const activeExists = migrated.workspaces.some(
            (workspace) => workspace.id === migrated.activeWorkspaceId,
          );
          setState({
            ...migrated,
            activeWorkspaceId: activeExists
              ? migrated.activeWorkspaceId
              : (migrated.workspaces[0]?.id ?? createStarterState().activeWorkspaceId),
          });
        }
        setHydrated(true);
    })().catch(() => {
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

  // Register saved compatible-provider definitions so their adapters exist
  // before settings or chat resolve a provider.
  useEffect(() => {
    let cancelled = false;
    void ensureCustomProvidersLoaded().then((definitions) => {
      if (!cancelled) setCustomProviders(definitions);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore providers whose keys were kept from a previous visit, so a refresh
  // does not make the user paste the key again. A provider stays connected
  // until the user clears it in Preferences.
  useEffect(() => {
    if (!hydrated) return;
    const preferredProviderId = state.preferences.aiProviderId;
    let cancelled = false;
    void restoreConnectedProviders(preferredProviderId).then((restored) => {
      if (cancelled) return;
      setConnectedProviders(restored);
      const activeId = getActiveProviderId();
      setActiveProviderId(activeId);
      if (!activeId) return;
      // Keep preferences pointing at a provider that actually has a key, and
      // restore its saved model when it is still available.
      setState((current) => {
        const models = restored.find((entry) => entry.providerId === activeId)?.models ?? [];
        const modelId =
          models.find((model) => model.id === current.preferences.aiModelId)?.id ??
          current.preferences.aiSelectedModels?.[activeId] ??
          models.find((model) => model.capabilities.textGeneration)?.id ??
          models[0]?.id ??
          null;
        if (
          current.preferences.aiProviderId === activeId &&
          current.preferences.aiModelId === modelId
        )
          return current;
        return {
          ...current,
          preferences: { ...current.preferences, aiProviderId: activeId, aiModelId: modelId },
        };
      });
    });
    return () => {
      cancelled = true;
    };
    // Runs once per hydrated load; later preference edits must not re-restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      setSaveStatus("saved");
      return;
    }
    setSaveStatus("saving");
    const timer = window.setTimeout(() => {
      void storageRef.current
        .save(state)
        .then(() => setSaveStatus("saved"))
        .catch((error: unknown) => {
          setSaveStatus("error");
          toast.error(
            error instanceof LocalFolderConflictError || error instanceof LocalFolderPermissionError
              ? error.message
              : "Your changes could not be saved locally.",
          );
        });
    }, state.preferences.autoSaveDelay);
    return () => window.clearTimeout(timer);
  }, [hydrated, state]);

  useEffect(() => {
    if (!hydrated) return;
    void syncWorkspaceDocuments(
      state.activeWorkspaceId,
      documents.map((document) => ({
        workspaceId: document.workspaceId,
        documentId: document.id,
        documentTitle: document.title,
        folderId: document.folderId,
        content: document.content,
      })),
    );
  }, [hydrated, state.activeWorkspaceId, documents]);

  const updateState = useCallback((updater: (current: WorkspaceState) => WorkspaceState) => {
    setState((current) => updater(current));
  }, []);

  const openDocument = useCallback(
    (id: string) => {
      updateState((current) => ({
        ...current,
        activeDocumentId: id,
        openDocumentIds: current.openDocumentIds.includes(id)
          ? current.openDocumentIds
          : [...current.openDocumentIds, id],
        recentDocumentIds: [
          id,
          ...current.recentDocumentIds.filter((recentId) => recentId !== id),
        ].slice(0, 10),
      }));
    },
    [updateState],
  );

  const openSource = useCallback(
    (documentId: string, headingPath: string[]) => {
      setPendingSourceJump(headingPath.length ? { documentId, headingPath } : null);
      openDocument(documentId);
    },
    [openDocument],
  );

  const updateDocumentContent = useCallback(
    (id: string, content: string) => {
      const updatedAt = new Date().toISOString();
      updateState((current) => ({
        ...current,
        documents: current.documents.map((document) =>
          document.id === id ? { ...document, content, updatedAt } : document,
        ),
      }));
    },
    [updateState],
  );

  function commitCreateDocument(folderId: string | null, name: string, content?: string) {
    if (!name.trim()) return;
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

  function createDocument(folderId: string | null = null, title?: string, content?: string) {
    if (title !== undefined) {
      commitCreateDocument(folderId, title, content);
      return;
    }
    const fallback = `Untitled ${documents.length + 1}`;
    setWorkspaceModal({ type: "new-document", folderId, defaultValue: fallback });
  }

  function commitCreateFolder(parentId: string | null, name: string) {
    if (!name.trim()) return;
    const folder = createWorkspaceFolder(state.activeWorkspaceId, parentId, name);
    updateState((current) => ({ ...current, folders: [...current.folders, folder] }));
  }

  function createFolder(parentId: string | null = null, name?: string) {
    if (name !== undefined) {
      commitCreateFolder(parentId, name);
      return;
    }
    setWorkspaceModal({ type: "new-folder", parentId });
  }

  function handleExplorerAction(action: ExplorerAction) {
    if (action.type === "new-document") createDocument(action.folderId);
    if (action.type === "new-folder") createFolder(action.folderId);
    if (action.type === "rename-document") {
      setWorkspaceModal({ type: "rename-document", document: action.document });
    }
    if (action.type === "rename-folder") {
      setWorkspaceModal({ type: "rename-folder", folder: action.folder });
    }
    if (action.type === "duplicate-document") {
      const copy = duplicateMarkdownDocument(action.document);
      updateState((current) => ({ ...current, documents: [...current.documents, copy] }));
      toast.success(`Created ${copy.title}`);
    }
    if (action.type === "export-document") exportDocument(action.document);
    if (action.type === "delete-document") {
      setWorkspaceModal({ type: "delete-document", document: action.document });
    }
    if (action.type === "delete-folder") deleteFolder(action.folder);
  }

  function confirmDeleteDocument(target: MarkdownDocument) {
    updateState((current) => {
      const remaining = current.documents.filter((document) => document.id !== target.id);
      const nextActive =
        current.activeDocumentId === target.id
          ? (remaining.find((document) => document.workspaceId === current.activeWorkspaceId)?.id ??
            null)
          : current.activeDocumentId;
      return {
        ...current,
        documents: remaining,
        openDocumentIds: current.openDocumentIds.filter((id) => id !== target.id),
        recentDocumentIds: current.recentDocumentIds.filter((id) => id !== target.id),
        activeDocumentId: nextActive,
      };
    });
  }

  function deleteFolder(folder: WorkspaceFolder) {
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
    const contained = documents.filter(
      (document) => document.folderId && descendants.has(document.folderId),
    );
    const description = contained.length
      ? `Delete “${folder.name}” and its ${contained.length} document(s)? This cannot be undone.`
      : `Delete folder “${folder.name}”? This cannot be undone.`;
    const removedDocumentIds = new Set(contained.map((document) => document.id));
    setWorkspaceModal({
      type: "delete-folder",
      folder,
      descendants,
      removedDocumentIds,
      description,
    });
  }

  function confirmDeleteFolder(descendants: Set<string>, removedDocumentIds: Set<string>) {
    updateState((current) => {
      const remaining = current.documents.filter(
        (document) => !removedDocumentIds.has(document.id),
      );
      return {
        ...current,
        folders: current.folders.filter((item) => !descendants.has(item.id)),
        documents: remaining,
        openDocumentIds: current.openDocumentIds.filter((id) => !removedDocumentIds.has(id)),
        recentDocumentIds: current.recentDocumentIds.filter((id) => !removedDocumentIds.has(id)),
        activeDocumentId:
          current.activeDocumentId && removedDocumentIds.has(current.activeDocumentId)
            ? (remaining.find((document) => document.workspaceId === current.activeWorkspaceId)
                ?.id ?? null)
            : current.activeDocumentId,
      };
    });
  }

  function createWorkspace() {
    setWorkspaceMenuOpen(false);
    setWorkspaceModal({ type: "new-workspace" });
  }

  function commitCreateWorkspace(name: string) {
    if (!name.trim()) return;
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
        activeDocumentId:
          current.activeDocumentId === id ? (nextTabs.at(-1) ?? null) : current.activeDocumentId,
      };
    });
  }

  async function importFiles(files: FileList | File[]) {
    const markdownFiles = Array.from(files).filter((file) =>
      /\.(md|markdown|txt)$/i.test(file.name),
    );
    if (markdownFiles.length === 0) {
      toast.error("Choose a .md, .markdown, or .txt file.");
      return;
    }
    setImporting(true);
    try {
      for (const file of markdownFiles) {
        createDocument(null, file.name, await file.text());
      }
      toast.success(
        `Imported ${markdownFiles.length} Markdown ${markdownFiles.length === 1 ? "file" : "files"}`,
      );
    } catch {
      toast.error("One or more files could not be read.");
    } finally {
      setImporting(false);
    }
  }

  function exportDocument(document: MarkdownDocument) {
    downloadBlob(
      new Blob([document.content], { type: "text/markdown;charset=utf-8" }),
      document.title,
    );
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
        const newWorkspace = {
          ...raw.workspace,
          id: crypto.randomUUID(),
          name: `${raw.workspace.name} (imported)`,
        };
        const folderIdMap = new Map(raw.folders.map((folder) => [folder.id, crypto.randomUUID()]));
        const importedFolders = raw.folders.map((folder) => ({
          ...folder,
          id: folderIdMap.get(folder.id) ?? crypto.randomUUID(),
          workspaceId: newWorkspace.id,
          parentId: folder.parentId ? (folderIdMap.get(folder.parentId) ?? null) : null,
        }));
        const importedDocuments = raw.documents.map((document) => ({
          ...document,
          id: crypto.randomUUID(),
          workspaceId: newWorkspace.id,
          folderId: document.folderId ? (folderIdMap.get(document.folderId) ?? null) : null,
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
      const markdownEntries = Object.values(zip.files).filter(
        (entry) => !entry.dir && /\.(md|markdown|txt)$/i.test(entry.name),
      );
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

  function refreshProviderState() {
    setConnectedProviders(listConnectedProviders());
    setActiveProviderId(getActiveProviderId());
  }

  const handleConnectProvider = useCallback(
    async (providerId: string, apiKey: string): Promise<boolean> => {
      setBusyProviderId(providerId);
      setProviderStatuses((current) => ({ ...current, [providerId]: "connecting" }));
      setProviderErrors((current) => {
        const { [providerId]: _cleared, ...rest } = current;
        return rest;
      });
      try {
        const { models } = await connectProvider(providerId, apiKey);
        refreshProviderState();
        setProviderStatuses((current) => {
          const { [providerId]: _cleared, ...rest } = current;
          return rest;
        });
        updateState((current) => {
          // Prefer the model previously chosen for this provider, then the first
          // chat-capable one, so reconnecting never silently downgrades.
          const saved = current.preferences.aiSelectedModels?.[providerId];
          const selected =
            models.find((model) => model.id === saved) ??
            models.find((model) => model.capabilities.textGeneration) ??
            models[0];
          return {
            ...current,
            preferences: {
              ...current.preferences,
              aiProviderId: providerId,
              aiModelId: selected?.id ?? null,
              aiSelectedModels: {
                ...(current.preferences.aiSelectedModels ?? {}),
                ...(selected ? { [providerId]: selected.id } : {}),
              },
            },
          };
        });
        toast.success(`${providerDisplayName(providerId)} connected`);
        return true;
      } catch (error) {
        const message =
          error instanceof ProviderError
            ? error.message
            : "Connection failed. Check the key and endpoint, then try again.";
        setProviderStatuses((current) => ({ ...current, [providerId]: "failed" }));
        setProviderErrors((current) => ({ ...current, [providerId]: message }));
        toast.error(message);
        return false;
      } finally {
        setBusyProviderId(null);
      }
    },
    [updateState],
  );

  const handleTestProvider = useCallback(
    async (providerId: string): Promise<boolean> => {
      setBusyProviderId(providerId);
      setProviderStatuses((current) => ({ ...current, [providerId]: "testing" }));
      try {
        const { models } = await testProviderConnection(providerId);
        refreshProviderState();
        setProviderStatuses((current) => {
          const { [providerId]: _cleared, ...rest } = current;
          return rest;
        });
        setProviderErrors((current) => {
          const { [providerId]: _cleared, ...rest } = current;
          return rest;
        });
        updateState((current) => {
          const saved = current.preferences.aiSelectedModels?.[providerId];
          const nextModel = models.some((model) => model.id === saved)
            ? (saved ?? null)
            : current.preferences.aiProviderId === providerId &&
                models.some((model) => model.id === current.preferences.aiModelId)
              ? current.preferences.aiModelId
              : (models.find((model) => model.capabilities.textGeneration)?.id ?? null);
          return {
            ...current,
            preferences: {
              ...current.preferences,
              ...(nextModel
                ? {
                    aiSelectedModels: {
                      ...(current.preferences.aiSelectedModels ?? {}),
                      [providerId]: nextModel,
                    },
                  }
                : {}),
              ...(current.preferences.aiProviderId === providerId ? { aiModelId: nextModel } : {}),
            },
          };
        });
        toast.success(`${providerDisplayName(providerId)} connection is working`);
        return true;
      } catch (error) {
        const message =
          error instanceof ProviderError
            ? error.message
            : "Connection failed. Check the key and endpoint, then try again.";
        // Keep the provider connected: a transient failure (offline, provider
        // outage) must not erase a key the user chose to keep. The key is only
        // removed when the user disconnects the provider.
        setProviderStatuses((current) => ({ ...current, [providerId]: "failed" }));
        setProviderErrors((current) => ({ ...current, [providerId]: message }));
        toast.error(message);
        return false;
      } finally {
        setBusyProviderId(null);
      }
    },
    [updateState],
  );

  const handleDisconnectProvider = useCallback(
    (providerId: string) => {
      disconnectProvider(providerId);
      refreshProviderState();
      setProviderStatuses((current) => {
        const { [providerId]: _cleared, ...rest } = current;
        return rest;
      });
      setProviderErrors((current) => {
        const { [providerId]: _cleared, ...rest } = current;
        return rest;
      });
      updateState((current) => ({
        ...current,
        preferences: {
          ...current.preferences,
          ...(current.preferences.aiProviderId === providerId
            ? { aiProviderId: null, aiModelId: null }
            : {}),
        },
      }));
      toast.message(`${providerDisplayName(providerId)} key cleared from this session`);
    },
    [updateState],
  );

  const handleSelectProvider = useCallback(
    (providerId: string) => {
      try {
        setActiveProvider(providerId);
        refreshProviderState();
        updateState((current) => {
          const models =
            listConnectedProviders().find((entry) => entry.providerId === providerId)?.models ?? [];
          const saved = current.preferences.aiSelectedModels?.[providerId];
          const modelId = models.some((model) => model.id === saved)
            ? (saved ?? null)
            : (models.find((model) => model.capabilities.textGeneration)?.id ??
              models[0]?.id ??
              null);
          return {
            ...current,
            preferences: { ...current.preferences, aiProviderId: providerId, aiModelId: modelId },
          };
        });
      } catch (error) {
        toast.error(
          error instanceof ProviderError ? error.message : "That provider is not connected.",
        );
      }
    },
    [updateState],
  );

  const handleSelectModel = useCallback(
    (providerId: string, modelId: string) => {
      updateState((current) => ({
        ...current,
        preferences: {
          ...current.preferences,
          aiModelId:
            current.preferences.aiProviderId === providerId
              ? modelId
              : current.preferences.aiModelId,
          aiSelectedModels: {
            ...(current.preferences.aiSelectedModels ?? {}),
            [providerId]: modelId,
          },
        },
      }));
    },
    [updateState],
  );

  const handleAddCustomProvider = useCallback(
    async (input: {
      displayName: string;
      baseUrl: string;
      apiKey: string;
      useRelay: boolean;
    }): Promise<boolean> => {
      const id = openAiCompatibleProviderId(input.displayName, [
        ...providerRegistry.list().map((provider) => provider.descriptor.id),
      ]);
      try {
        await saveCustomProvider({
          id,
          displayName: input.displayName,
          baseUrl: input.baseUrl,
          ...(input.useRelay ? { proxyBasePath: PROXY_BASE_PATH } : {}),
        });
      } catch (error) {
        toast.error(
          error instanceof ProviderError ? error.message : "That endpoint could not be used.",
        );
        return false;
      }
      const connected = await handleConnectProvider(id, input.apiKey);
      setCustomProviders(await ensureCustomProvidersLoaded());
      if (!connected) {
        // Keep the definition so the user can fix the key without retyping the URL.
        setProviderErrors((current) => ({
          ...current,
          [id]: current[id] ?? "Could not connect with that key.",
        }));
      }
      return connected;
    },
    [handleConnectProvider],
  );

  const handleRemoveCustomProvider = useCallback(
    async (providerId: string) => {
      await removeCustomProvider(providerId);
      refreshProviderState();
      setCustomProviders(await ensureCustomProvidersLoaded());
      updateState((current) => ({
        ...current,
        preferences: {
          ...current.preferences,
          ...(current.preferences.aiProviderId === providerId
            ? { aiProviderId: null, aiModelId: null }
            : {}),
        },
      }));
    },
    [updateState],
  );

  function openAISettings() {
    setSettingsInitialSection("ai");
    setSettingsOpen(true);
  }

  const setPreferences = (preferences: WorkspaceState["preferences"]) => {
    updateState((current) => ({ ...current, preferences }));
  };

  async function connectLocalFolder() {
    try {
      const result = await localFolderStorage.connect(state);
      storageRef.current = localFolderStorage;
      setState(result.state);
      setLocalFolderName(result.folderName);
      setSaveStatus("saved");
      toast.success(`Connected local folder “${result.folderName}”`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect the local folder.");
    }
  }

  async function disconnectLocalFolder() {
    try {
      await indexedDbStorage.save(state);
      await localFolderStorage.disconnect();
      storageRef.current = indexedDbStorage;
      setLocalFolderName(null);
      setSaveStatus("saved");
      toast.success("Switched to browser storage. Files in the connected folder were kept.");
    } catch {
      toast.error("Could not switch storage. Your connected folder remains active.");
    }
  }

  return (
    <main
      className="workspace-shell flex h-dvh min-h-[520px] flex-col overflow-hidden bg-background text-foreground"
      data-hydrated={hydrated ? "true" : "false"}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <header className="flex h-12 shrink-0 items-center border-b border-border bg-background">
        <div className="flex h-full w-[276px] shrink-0 items-center border-r border-border px-3">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="mr-2 h-7 w-7 shrink-0 p-1"
            title="About Markdown AI Workspace"
          >
            <Link to="/about" aria-label="About Markdown AI Workspace">
              <img
                src="https://cdn.therama.dev/shared/favicon.ico"
                alt=""
                className="size-5 object-contain"
                width={20}
                height={20}
              />
            </Link>
          </Button>
          <button
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            data-tour="workspace-switcher"
            onClick={() => setWorkspaceMenuOpen((open) => !open)}
            aria-expanded={workspaceMenuOpen}
          >
            <span className="truncate text-xs font-medium">
              {activeWorkspace?.name ?? "Workspace"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="ml-1 h-7 w-7 text-muted-foreground"
            title="Create workspace"
            aria-label="Create workspace"
            data-tour="create-workspace"
            onClick={createWorkspace}
          >
            <FolderPlus />
          </Button>
          {workspaceMenuOpen && (
            <div className="absolute left-3 top-11 z-50 w-60 rounded-md border border-border bg-popover p-1 shadow-xl">
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
                Workspaces on this device
              </div>
              {state.workspaces.map((workspace) => (
                <Button
                  key={workspace.id}
                  variant={workspace.id === state.activeWorkspaceId ? "secondary" : "ghost"}
                  className="h-8 w-full justify-start text-xs"
                  onClick={() => switchWorkspace(workspace.id)}
                >
                  <span className="truncate">{workspace.name}</span>
                  {workspace.id === state.activeWorkspaceId && <Check className="ml-auto" />}
                </Button>
              ))}
              <div className="my-1 border-t border-border" />
              <Button
                variant="ghost"
                className="h-8 w-full justify-start text-xs"
                onClick={createWorkspace}
              >
                <FolderPlus /> Create workspace
              </Button>
              <Button
                variant="ghost"
                className="h-8 w-full justify-start text-xs"
                onClick={() => folderInputRef.current?.click()}
              >
                <Upload /> Import workspace backup
              </Button>
              <Button
                variant="ghost"
                className="h-8 w-full justify-start text-xs"
                onClick={() => void exportWorkspace()}
              >
                <Download /> Export this workspace
              </Button>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between px-3">
          <div className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
            {activeDocument && (
              <>
                <span className="truncate">{activeDocument.title}</span>
                <ChevronRight className="h-3 w-3" />
                <span>
                  {mode === "split" ? "Split view" : mode === "editor" ? "Editor" : "Preview"}
                </span>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div
              className="hidden items-center gap-1 text-[10px] text-muted-foreground sm:flex"
              aria-live="polite"
            >
              {saveStatus === "saving" ? (
                <>
                  <LoaderCircle className="h-3 w-3 animate-spin" /> Saving
                </>
              ) : saveStatus === "error" ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> Save failed
                </>
              ) : (
                <>
                  <Check className="h-3 w-3 text-primary" /> Saved locally
                </>
              )}
            </div>
            <div className="flex items-center gap-1" data-tour="import-export">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                title="Import Markdown file"
                aria-label="Import Markdown file"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                title="Export workspace"
                aria-label="Export workspace"
                onClick={() => void exportWorkspace()}
              >
                <FileDown />
              </Button>
            </div>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              title="Open Documentation "
            >
              <Link to="/guide" aria-label="Open Documentation "><BookOpen /></Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              title="Source code on GitHub (open source, MIT)"
            >
              <a
                href={REPOSITORY.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Source code on GitHub (open source, MIT)"
              >
                <Github />
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              title="Preferences"
              aria-label="Preferences"
              data-tour="preferences-button"
              onClick={() => {
                setSettingsInitialSection("general");
                setSettingsOpen(true);
              }}
            >
              <Settings2 />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              title={assistantOpen ? "Hide assistant panel" : "Show assistant panel"}
              aria-label={assistantOpen ? "Hide assistant panel" : "Show assistant panel"}
              data-tour="assistant-toggle"
              onClick={() => setAssistantOpen((open) => !open)}
            >
              {assistantOpen ? <PanelRightClose /> : <PanelRightOpen />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              title="Start guided tour"
              aria-label="Start guided tour"
              onClick={() => setTourOpen(true)}
            >
              <CircleHelp />
            </Button>
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
              recentDocumentIds={state.recentDocumentIds.filter((id) =>
                documents.some((document) => document.id === id),
              )}
              onOpenDocument={openDocument}
              onAction={handleExplorerAction}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="60%" minSize="36%" className="min-w-0">
            <section
              className="flex h-full min-h-0 flex-col bg-background"
              aria-label="Markdown workspace editor"
              data-tour="editor"
            >
              <div className="flex h-10 shrink-0 items-stretch border-b border-border bg-background">
                <div className="flex min-w-0 flex-1 overflow-x-auto">
                  {openDocuments.map((document) => (
                    <div
                      key={document.id}
                      className={`group flex max-w-48 shrink-0 items-center border-r border-border ${activeDocument?.id === document.id ? "bg-card" : "bg-muted/30"}`}
                    >
                      <button
                        onClick={() => openDocument(document.id)}
                        className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-xs"
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${saveStatus === "saving" && activeDocument?.id === document.id ? "bg-primary" : "bg-muted-foreground/50"}`}
                        />
                        <span className="truncate">{document.title}</span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mr-1 h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        title="Close tab"
                        aria-label={`Close ${document.title} tab`}
                        onClick={(event) => closeTab(document.id, event)}
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="m-1 h-7 w-7 shrink-0 text-muted-foreground"
                  title="New file"
                  aria-label="New file"
                  onClick={() => createDocument()}
                >
                  <FilePlus2 />
                </Button>
              </div>

              <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-y-1 border-b border-border px-2 py-1" data-tour="writing-toolbar">
                <div className="flex items-center gap-0.5">
                  <ToolbarButton label="Bold" onClick={() => editorRef.current?.format("**", "**")}>
                    <Bold />
                  </ToolbarButton>
                  <ToolbarButton label="Italic" onClick={() => editorRef.current?.format("_", "_")}>
                    <Italic />
                  </ToolbarButton>
                  <span className="mx-1 h-4 w-px bg-border" />
                  <ToolbarButton label="Heading 1" onClick={() => editorRef.current?.format("# ")}>
                    <Heading1 />
                  </ToolbarButton>
                  <ToolbarButton label="Heading 2" onClick={() => editorRef.current?.format("## ")}>
                    <Heading2 />
                  </ToolbarButton>
                  <span className="mx-1 h-4 w-px bg-border" />
                  <ToolbarButton
                    label="Bulleted list"
                    onClick={() => editorRef.current?.format("- ")}
                  >
                    <List />
                  </ToolbarButton>
                  <ToolbarButton
                    label="Numbered list"
                    onClick={() => editorRef.current?.format("1. ")}
                  >
                    <ListOrdered />
                  </ToolbarButton>
                  <ToolbarButton label="Quote" onClick={() => editorRef.current?.format("> ")}>
                    <Quote />
                  </ToolbarButton>
                  <ToolbarButton
                    label="Code block"
                    onClick={() => editorRef.current?.format("```\n", "\n``` ")}
                  >
                    <Braces />
                  </ToolbarButton>
                  <ToolbarButton
                    label="Table"
                    onClick={() =>
                      editorRef.current?.format(
                        "| Column | Column |\n| --- | --- |\n| Cell | Cell |\n",
                      )
                    }
                  >
                    <Table2 />
                  </ToolbarButton>
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-1" data-tour="inline-ai">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    title="Preview an AI rewrite of the selected Markdown; press Tab to replace it."
                    aria-label="Rewrite selected Markdown"
                    disabled={!canSuggestCompletion || selectedMarkdownLength === 0 || completionStatus === "loading" || mode === "preview"}
                    onClick={() => void editorRef.current?.requestRewrite()}
                  >
                    <Sparkles />
                    <span className="hidden sm:inline">Rewrite</span>
                  </Button>
                  <Button
                    variant={completionStatus === "suggested" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    title={
                      completionStatus === "suggested"
                        ? "Suggestion ready. Press Tab to accept or Escape to dismiss."
                        : "Suggest Markdown at the cursor (⌘/Ctrl+Shift+Space)"
                    }
                    aria-label={
                      completionStatus === "loading"
                        ? "Generating inline suggestion"
                        : completionStatus === "suggested"
                          ? "Suggestion ready; press Tab to accept"
                          : "Suggest Markdown at cursor"
                    }
                    disabled={!canSuggestCompletion || completionStatus === "loading" || mode === "preview"}
                    onClick={() => void editorRef.current?.requestCompletion()}
                  >
                    {completionStatus === "loading" ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Sparkles />
                    )}
                    <span className="hidden sm:inline">
                      {completionStatus === "suggested" ? "Suggestion ready" : "Suggest"}
                    </span>
                  </Button>
                  </div>
                  <div className="mr-1 hidden items-center gap-0.5 border-r border-border pr-1 sm:flex">
                    {(["editor", "split", "preview"] as const).map((viewMode) => {
                      const Icon =
                        viewMode === "editor"
                          ? AlignLeft
                          : viewMode === "split"
                            ? SplitSquareHorizontal
                            : Search;
                      return (
                        <Button
                          key={viewMode}
                          variant={mode === viewMode ? "secondary" : "ghost"}
                          size="icon"
                          className="h-7 w-7"
                          title={`${viewMode.slice(0, 1).toUpperCase()}${viewMode.slice(1)} view`}
                          aria-label={`${viewMode.slice(0, 1).toUpperCase()}${viewMode.slice(1)} view`}
                          onClick={() => setMode(viewMode)}
                        >
                          <Icon />
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant={showOutline ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    title="Document outline"
                    aria-label="Document outline"
                    onClick={() => setShowOutline((visible) => !visible)}
                  >
                    <MoreHorizontal />
                  </Button>
                </div>
              </div>

              {showOutline && (
                <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-muted/20 px-3 py-2">
                  <span className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">
                    Outline
                  </span>
                  {headings.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      Add headings to navigate this document.
                    </span>
                  )}
                  {headings.map((heading, index) => (
                    <Button
                      key={`${heading.id}-${index}`}
                      variant="ghost"
                      className="h-6 shrink-0 text-xs font-normal"
                      onClick={() => editorRef.current?.jumpToHeading(heading.text)}
                    >
                      <span className="text-muted-foreground">{"#".repeat(heading.level)}</span>
                      {heading.text}
                    </Button>
                  ))}
                </div>
              )}

              {activeDocument ? (
                <div className="flex min-h-0 flex-1">
                  {(mode === "editor" || mode === "split") && (
                    <div
                      className={`min-h-0 min-w-0 flex-1 overflow-hidden ${mode === "split" ? "border-r border-border" : ""}`}
                    >
                      <MarkdownEditor
                        ref={editorRef}
                        value={activeDocument.content}
                        onChange={(content) => updateDocumentContent(activeDocument.id, content)}
                        fontSize={state.preferences.fontSize}
                        wordWrap={state.preferences.wordWrap}
                        onRequestCompletion={(prefix, suffix, signal) =>
                          generateMarkdownCompletion({
                            model: state.preferences.aiModelId ?? "",
                            prefix,
                            suffix,
                            signal,
                          })
                        }
                        onRequestRewrite={(prefix, selected, suffix, signal) =>
                          rewriteSelectedMarkdown({
                            model: state.preferences.aiModelId ?? "",
                            prefix,
                            selected,
                            suffix,
                            signal,
                          })
                        }
                        onSelectionChange={(selectedText) =>
                          setSelectedMarkdownLength(selectedText.length)
                        }
                        onCompletionStatusChange={setCompletionStatus}
                        onCompletionError={(error) =>
                          toast.error(error instanceof Error ? error.message : "Could not generate a Markdown suggestion.")
                        }
                      />
                    </div>
                  )}
                  {(mode === "preview" || mode === "split") && (
                    <ScrollArea
                      className={`h-full min-w-0 ${mode === "split" ? "flex-1" : "w-full"}`}
                    >
                      <MarkdownPreview content={activeDocument.content} />
                    </ScrollArea>
                  )}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
                  <div className="max-w-sm">
                    <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card">
                      <FilePlus2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <h2 className="text-sm font-medium">No document open</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Create a Markdown file or import one to start writing.
                    </p>
                    <div className="mt-4 flex justify-center gap-2">
                      <Button size="sm" onClick={() => createDocument()}>
                        <FilePlus2 /> New file
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload /> Import
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-background px-3 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span>Markdown</span>
                  <span>
                    {activeDocument
                      ? activeDocument.title.split(".").at(-1)?.toUpperCase()
                      : "No file"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span>{wordCount} words</span>
                  <span>{charCount} characters</span>
                  <span>UTF-8</span>
                </div>
              </footer>
            </section>
          </ResizablePanel>
          {assistantOpen && <ResizableHandle withHandle />}
          {assistantOpen && (
            <ResizablePanel defaultSize="21%" minSize="17%" maxSize="30%" className="min-w-0">
              <AssistantPanel
                workspaceId={state.activeWorkspaceId}
                workspaceName={activeWorkspace?.name ?? "Workspace"}
                documentId={activeDocument?.id ?? null}
                documentTitle={activeDocument?.title ?? null}
                documentContent={activeDocument?.content ?? ""}
                prompts={suggestedPrompts}
                isConnected={
                  Boolean(state.preferences.aiProviderId) &&
                  connectedProviders.some(
                    (entry) => entry.providerId === state.preferences.aiProviderId,
                  )
                }
                providerId={state.preferences.aiProviderId}
                providerLabel={
                  state.preferences.aiProviderId
                    ? providerDisplayName(state.preferences.aiProviderId)
                    : null
                }
                modelId={state.preferences.aiModelId}
                onConfigure={openAISettings}
                onOpenSource={openSource}
                onInsertIntoDocument={(content) => editorRef.current?.insertText(content)}
              />
            </ResizablePanel>
          )}
        </ResizablePanelGroup>
      </div>

      <GuidedTour
        open={tourOpen}
        onClose={() => {
          setTourOpen(false);
          setSettingsOpen(false);
        }}
        onStepChange={handleTourStepChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void importFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importWorkspace(file);
          event.target.value = "";
        }}
      />
      {importing && (
        <div className="fixed bottom-10 right-4 z-50 flex items-center gap-2 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Importing files…
        </div>
      )}
      <WorkspaceSettings
        open={settingsOpen}
        modal={!tourOpen}
        onOpenChange={setSettingsOpen}
        preferences={state.preferences}
        onChange={setPreferences}
        initialSection={settingsInitialSection}
        workspaceId={state.activeWorkspaceId}
        documents={documents}
        connectedProviders={connectedProviders}
        activeProviderId={activeProviderId}
        customProviders={customProviders}
        busyProviderId={busyProviderId}
        statusByProvider={providerStatuses}
        errorByProvider={providerErrors}
        onConnectProvider={handleConnectProvider}
        onTestProvider={handleTestProvider}
        onDisconnectProvider={handleDisconnectProvider}
        onSelectProvider={handleSelectProvider}
        onSelectModel={handleSelectModel}
        onAddCustomProvider={handleAddCustomProvider}
        onRemoveCustomProvider={handleRemoveCustomProvider}
        localFolderName={localFolderName}
        localFolderSupported={localFolderSupported}
        onConnectLocalFolder={connectLocalFolder}
        onDisconnectLocalFolder={disconnectLocalFolder}
      />

      <PromptDialog
        open={
          workspaceModal?.type === "new-document" ||
          workspaceModal?.type === "new-folder" ||
          workspaceModal?.type === "rename-document" ||
          workspaceModal?.type === "rename-folder" ||
          workspaceModal?.type === "new-workspace"
        }
        onOpenChange={(open) => {
          if (!open) setWorkspaceModal(null);
        }}
        title={
          workspaceModal?.type === "new-document"
            ? "New Markdown file"
            : workspaceModal?.type === "new-folder"
              ? "New folder"
              : workspaceModal?.type === "rename-document"
                ? "Rename document"
                : workspaceModal?.type === "rename-folder"
                  ? "Rename folder"
                  : workspaceModal?.type === "new-workspace"
                    ? "New workspace"
                    : ""
        }
        label={
          workspaceModal?.type === "new-document"
            ? "File name"
            : workspaceModal?.type === "new-folder"
              ? "Folder name"
              : workspaceModal?.type === "rename-document"
                ? "Document name"
                : workspaceModal?.type === "rename-folder"
                  ? "Folder name"
                  : workspaceModal?.type === "new-workspace"
                    ? "Workspace name"
                    : undefined
        }
        placeholder={workspaceModal?.type === "new-folder" ? "e.g. Meeting notes" : undefined}
        defaultValue={
          workspaceModal?.type === "new-document"
            ? workspaceModal.defaultValue
            : workspaceModal?.type === "rename-document"
              ? workspaceModal.document.title.replace(/\.(md|markdown|txt)$/i, "")
              : workspaceModal?.type === "rename-folder"
                ? workspaceModal.folder.name
                : workspaceModal?.type === "new-workspace"
                  ? "New workspace"
                  : ""
        }
        submitLabel={
          workspaceModal?.type === "rename-document" || workspaceModal?.type === "rename-folder"
            ? "Rename"
            : "Create"
        }
        onSubmit={(value) => {
          if (!workspaceModal) return;
          if (workspaceModal.type === "new-document") {
            commitCreateDocument(workspaceModal.folderId, value);
          } else if (workspaceModal.type === "new-folder") {
            commitCreateFolder(workspaceModal.parentId, value);
          } else if (workspaceModal.type === "rename-document") {
            updateState((current) => ({
              ...current,
              documents: current.documents.map((document) =>
                document.id === workspaceModal.document.id
                  ? renameMarkdownDocument(document, value)
                  : document,
              ),
            }));
          } else if (workspaceModal.type === "rename-folder") {
            updateState((current) => ({
              ...current,
              folders: current.folders.map((folder) =>
                folder.id === workspaceModal.folder.id ? { ...folder, name: value } : folder,
              ),
            }));
          } else if (workspaceModal.type === "new-workspace") {
            commitCreateWorkspace(value);
          }
        }}
      />

      <ConfirmDialog
        open={
          workspaceModal?.type === "delete-document" || workspaceModal?.type === "delete-folder"
        }
        onOpenChange={(open) => {
          if (!open) setWorkspaceModal(null);
        }}
        title={
          workspaceModal?.type === "delete-document"
            ? "Delete document"
            : workspaceModal?.type === "delete-folder"
              ? "Delete folder"
              : ""
        }
        description={
          workspaceModal?.type === "delete-document"
            ? `Delete “${workspaceModal.document.title}”? This cannot be undone.`
            : workspaceModal?.type === "delete-folder"
              ? workspaceModal.description
              : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (!workspaceModal) return;
          if (workspaceModal.type === "delete-document") {
            confirmDeleteDocument(workspaceModal.document);
          } else if (workspaceModal.type === "delete-folder") {
            confirmDeleteFolder(workspaceModal.descendants, workspaceModal.removedDocumentIds);
          }
          setWorkspaceModal(null);
        }}
      />
    </main>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
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

function isWorkspaceBundle(
  value: unknown,
): value is NonNullable<ReturnType<typeof createWorkspaceBundle>> {
  if (!value || typeof value !== "object") return false;
  const bundle = value as Partial<NonNullable<ReturnType<typeof createWorkspaceBundle>>>;
  return (
    bundle.format === "markdown-ai-workspace" &&
    bundle.version === 1 &&
    typeof bundle.workspace?.name === "string" &&
    Array.isArray(bundle.folders) &&
    Array.isArray(bundle.documents) &&
    bundle.documents.every(
      (document) =>
        typeof document.id === "string" &&
        typeof document.title === "string" &&
        typeof document.content === "string",
    )
  );
}
