import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  documentRelativePath,
  isLocalWorkspaceManifest,
  isSafeRelativeMarkdownPath,
  safePathSegment,
  type LocalDocumentRecord,
  type LocalWorkspaceManifest,
} from "../../src/features/workspace/localFolderFormat.ts";
import type { MarkdownDocument, WorkspaceFolder } from "../../src/features/workspace/types.ts";

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function folderRelativePath(manifest: LocalWorkspaceManifest, folder: WorkspaceFolder): string {
  const workspace = manifest.workspaces.find((entry) => entry.id === folder.workspaceId);
  if (!workspace) throw new Error("Workspace was not found.");
  const segments = [`${safePathSegment(workspace.name)}--${workspace.id.slice(0, 8)}`];
  let current: WorkspaceFolder | undefined = folder;
  const visited = new Set<string>();
  const parents: string[] = [];
  while (current) {
    if (visited.has(current.id)) throw new Error("Folder hierarchy contains a cycle.");
    visited.add(current.id);
    parents.unshift(safePathSegment(current.name));
    current = current.parentId
      ? manifest.folders.find(
          (entry) => entry.id === current?.parentId && entry.workspaceId === folder.workspaceId,
        )
      : undefined;
  }
  return [...segments, ...parents].join("/");
}

async function atomicWrite(target: string, content: string): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export class WorkspaceRepository {
  readonly root: string;
  private rootRealPath: string | null = null;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async initialize(): Promise<LocalWorkspaceManifest> {
    this.rootRealPath = await realpath(this.root);
    return this.readManifest();
  }

  private async canonicalRoot(): Promise<string> {
    this.rootRealPath ??= await realpath(this.root);
    return this.rootRealPath;
  }

  async readManifest(): Promise<LocalWorkspaceManifest> {
    const manifestPath = path.join(await this.canonicalRoot(), ".markdown-ai-workspace.json");
    if ((await lstat(manifestPath)).isSymbolicLink()) throw new Error("Workspace manifest cannot be a symbolic link.");
    const parsed: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!isLocalWorkspaceManifest(parsed)) {
      throw new Error("Unsupported Markdown workspace manifest.");
    }
    for (const document of parsed.documents) {
      if (!isSafeRelativeMarkdownPath(document.relativePath)) {
        throw new Error(`Unsafe Markdown path in workspace manifest: ${document.relativePath}`);
      }
    }
    return parsed;
  }

  private async resolveMarkdownPath(relativePath: string, allowMissing = false): Promise<string> {
    if (!isSafeRelativeMarkdownPath(relativePath)) throw new Error("Invalid Markdown file path.");
    const root = await this.canonicalRoot();
    const absolute = path.resolve(root, relativePath);
    if (!absolute.startsWith(root + path.sep)) throw new Error("Markdown path escaped the workspace.");
    if (allowMissing) {
      let ancestor = root;
      for (const segment of path.dirname(relativePath).split("/").filter(Boolean)) {
        ancestor = path.join(ancestor, segment);
        try {
          const resolved = await realpath(ancestor);
          if (!resolved.startsWith(root + path.sep)) {
            throw new Error("Markdown path escaped the workspace.");
          }
          ancestor = resolved;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
          throw error;
        }
      }
      return absolute;
    }
    const canonical = await realpath(absolute);
    if (!canonical.startsWith(root + path.sep)) throw new Error("Markdown path escaped the workspace.");
    return canonical;
  }

  async listDocuments(workspaceId?: string, query = "") {
    const manifest = await this.readManifest();
    const normalized = query.trim().toLocaleLowerCase();
    const documents = [];
    for (const entry of manifest.documents) {
      if (workspaceId && entry.workspaceId !== workspaceId) continue;
      const { content } = await this.readDocument(entry.id, manifest);
      if (normalized && !`${entry.title}\n${content}`.toLocaleLowerCase().includes(normalized)) continue;
      documents.push({
        id: entry.id,
        workspaceId: entry.workspaceId,
        workspaceName: manifest.workspaces.find((workspace) => workspace.id === entry.workspaceId)?.name,
        folderId: entry.folderId,
        title: entry.title,
        relativePath: entry.relativePath,
        updatedAt: entry.updatedAt,
        contentHash: contentHash(content),
      });
    }
    return documents;
  }

  async readDocument(documentId: string, knownManifest?: LocalWorkspaceManifest) {
    const manifest = knownManifest ?? (await this.readManifest());
    const entry = manifest.documents.find((document) => document.id === documentId);
    if (!entry) throw new Error("Document not found.");
    const absolute = await this.resolveMarkdownPath(entry.relativePath);
    const content = await readFile(absolute, "utf8");
    return { entry, content, hash: contentHash(content), manifest };
  }

  private async writeManifest(manifest: LocalWorkspaceManifest): Promise<void> {
    await atomicWrite(
      path.join(await this.canonicalRoot(), ".markdown-ai-workspace.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }

  async createDocument(input: {
    workspaceId: string;
    folderId: string | null;
    title: string;
    content: string;
  }) {
    const manifest = await this.readManifest();
    const workspace = manifest.workspaces.find((entry) => entry.id === input.workspaceId);
    if (!workspace) throw new Error("Workspace not found.");
    if (input.folderId && !manifest.folders.some((entry) => entry.id === input.folderId && entry.workspaceId === input.workspaceId)) {
      throw new Error("Folder not found in this workspace.");
    }
    const title = `${safePathSegment(input.title.replace(/\.(md|markdown|txt)$/i, ""))}.md`;
    const document: MarkdownDocument = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      folderId: input.folderId,
      title,
      content: input.content,
      updatedAt: new Date().toISOString(),
    };
    const relativePath = documentRelativePath(manifest, document);
    if (manifest.documents.some((entry) => entry.relativePath === relativePath)) {
      throw new Error("A document with this name already exists in that folder.");
    }
    const target = await this.resolveMarkdownPath(relativePath, true);
    await mkdir(path.dirname(target), { recursive: true });
    const parent = await realpath(path.dirname(target));
    const rootPath = await this.canonicalRoot();
    if (!parent.startsWith(rootPath + path.sep)) throw new Error("Markdown path escaped the workspace.");
    const contentHashValue = contentHash(input.content);
    await atomicWrite(target, input.content);
    const record: LocalDocumentRecord = { ...document, relativePath, contentHash: contentHashValue };
    const next = { ...manifest, revision: manifest.revision + 1, documents: [...manifest.documents, record] };
    await this.writeManifest(next);
    return { id: document.id, title, relativePath, contentHash: contentHashValue };
  }

  async updateDocument(documentId: string, expectedHash: string, content: string) {
    const { entry, hash, manifest } = await this.readDocument(documentId);
    if (hash !== expectedHash) {
      throw new Error("Document changed since it was read. Read it again before updating.");
    }
    const target = await this.resolveMarkdownPath(entry.relativePath);
    await atomicWrite(target, content);
    const nextHash = contentHash(content);
    const updatedAt = new Date().toISOString();
    const documents = manifest.documents.map((document) =>
      document.id === documentId ? { ...document, contentHash: nextHash, updatedAt } : document,
    );
    await this.writeManifest({ ...manifest, revision: manifest.revision + 1, documents });
    return { documentId, contentHash: nextHash, updatedAt };
  }

  async renameDocument(documentId: string, title: string, expectedHash: string) {
    const { entry, content, hash, manifest } = await this.readDocument(documentId);
    if (hash !== expectedHash) {
      throw new Error("Document changed since it was read. Read it again before renaming.");
    }
    const document: MarkdownDocument = {
      id: entry.id,
      workspaceId: entry.workspaceId,
      folderId: entry.folderId,
      title: `${safePathSegment(title.replace(/\.(md|markdown|txt)$/i, ""))}.md`,
      content,
      updatedAt: new Date().toISOString(),
    };
    const relativePath = documentRelativePath(manifest, document);
    if (relativePath !== entry.relativePath && manifest.documents.some((item) => item.relativePath === relativePath)) {
      throw new Error("A document with this name already exists in that folder.");
    }
    if (relativePath === entry.relativePath) {
      return { documentId, title: document.title, relativePath, contentHash: hash };
    }
    const target = await this.resolveMarkdownPath(relativePath, true);
    await mkdir(path.dirname(target), { recursive: true });
    await atomicWrite(target, content);
    const oldTarget = await this.resolveMarkdownPath(entry.relativePath);
    await rm(oldTarget, { force: true });
    const documents = manifest.documents.map((item) =>
      item.id === documentId
        ? { ...item, title: document.title, relativePath, updatedAt: document.updatedAt }
        : item,
    );
    await this.writeManifest({ ...manifest, revision: manifest.revision + 1, documents });
    return { documentId, title: document.title, relativePath, contentHash: hash };
  }

  async createFolder(workspaceId: string, parentId: string | null, name: string) {
    const manifest = await this.readManifest();
    if (!manifest.workspaces.some((entry) => entry.id === workspaceId)) throw new Error("Workspace not found.");
    if (parentId && !manifest.folders.some((entry) => entry.id === parentId && entry.workspaceId === workspaceId)) {
      throw new Error("Parent folder not found in this workspace.");
    }
    const folder: WorkspaceFolder = {
      id: randomUUID(),
      workspaceId,
      parentId,
      name: safePathSegment(name),
    };
    const next = { ...manifest, folders: [...manifest.folders, folder] };
    const folderPath = folderRelativePath(next, folder);
    if (manifest.folders.some((entry) => folderRelativePath(manifest, entry) === folderPath)) {
      throw new Error("A folder with this name already exists at that location.");
    }
    const root = await this.canonicalRoot();
    const target = path.resolve(root, folderPath);
    if (!target.startsWith(root + path.sep)) throw new Error("Folder path escaped the workspace.");
    let ancestor = root;
    for (const segment of folderPath.split("/")) {
      ancestor = path.join(ancestor, segment);
      try {
        const resolved = await realpath(ancestor);
        if (!resolved.startsWith(root + path.sep)) throw new Error("Folder path escaped the workspace.");
        ancestor = resolved;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
        throw error;
      }
    }
    await mkdir(target, { recursive: true });
    const canonicalTarget = await realpath(target);
    if (!canonicalTarget.startsWith(root + path.sep)) throw new Error("Folder path escaped the workspace.");
    await this.writeManifest({ ...next, revision: manifest.revision + 1 });
    return { id: folder.id, name: folder.name, workspaceId, parentId, relativePath: folderPath };
  }
}

export function isReadOnly(): boolean {
  return !["0", "false", "no"].includes((process.env.MD_MCP_READ_ONLY ?? "true").toLowerCase());
}
