import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  documentRelativePath,
  toLocalWorkspaceManifest,
  type LocalWorkspaceManifest,
} from "../../src/features/workspace/localFolderFormat.ts";
import type { MarkdownDocument, WorkspaceState } from "../../src/features/workspace/types.ts";
import { WorkspaceRepository } from "./repository.js";

const workspaceId = "workspace-test";
const documentId = "document-1";
const workspaceState = (): WorkspaceState => ({
  workspaces: [{ id: workspaceId, name: "Test project", createdAt: "2026-01-01T00:00:00.000Z" }],
  folders: [],
  documents: [],
  activeWorkspaceId: workspaceId,
  openDocumentIds: [],
  activeDocumentId: null,
  recentDocumentIds: [],
  preferences: {
    theme: "dark",
    fontSize: 14,
    wordWrap: true,
    autoSaveDelay: 700,
    aiProviderId: null,
    aiModelId: null,
  },
});

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

describe("MCP local Markdown repository", () => {
  let root: string;
  let outside: string;
  let initialManifest: LocalWorkspaceManifest;
  let repository: WorkspaceRepository;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "md-workspace-mcp-"));
    outside = await mkdtemp(path.join(os.tmpdir(), "md-workspace-outside-"));
    const state = workspaceState();
    const document: MarkdownDocument = {
      id: documentId,
      workspaceId,
      folderId: null,
      title: "Welcome.md",
      content: "# Welcome\n\nLocal-only notes.",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    state.documents = [document];
    state.openDocumentIds = [document.id];
    state.activeDocumentId = document.id;
    const relativePath = documentRelativePath(state, document);
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, document.content, "utf8");
    const { content: _content, ...metadata } = document;
    initialManifest = toLocalWorkspaceManifest(
      state,
      [{ ...metadata, relativePath, contentHash: hash(document.content) }],
      1,
    );
    await writeFile(path.join(root, ".markdown-ai-workspace.json"), JSON.stringify(initialManifest));
    repository = new WorkspaceRepository(root);
    await repository.initialize();
  });

  afterEach(async () => {
    await Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]);
  });

  it("lists workspace and document metadata without embedding document text", async () => {
    const manifest = await repository.readManifest();
    const documents = await repository.listDocuments();
    assert.deepEqual(manifest.workspaces.map((entry) => entry.id), [workspaceId]);
    assert.equal(documents.length, 1);
    assert.equal(documents[0]?.title, "Welcome.md");
    assert.equal("content" in (documents[0] ?? {}), false);
    assert.equal(documents[0]?.contentHash, hash("# Welcome\n\nLocal-only notes."));
  });

  it("filters document search by text and workspace case-insensitively", async () => {
    assert.equal((await repository.listDocuments(undefined, "LOCAL-ONLY")).length, 1);
    assert.equal((await repository.listDocuments("other-workspace")).length, 0);
    assert.equal((await repository.listDocuments(workspaceId, "missing phrase")).length, 0);
  });

  it("reads the exact file and supplies an optimistic concurrency hash", async () => {
    const document = await repository.readDocument(documentId);
    assert.equal(document.content, "# Welcome\n\nLocal-only notes.");
    assert.equal(document.hash, hash(document.content));
    assert.equal(document.entry.relativePath, initialManifest.documents[0]?.relativePath);
  });

  it("creates Markdown files, sanitizes titles, and advances the manifest revision", async () => {
    const created = await repository.createDocument({
      workspaceId,
      folderId: null,
      title: "Planning/Notes.md",
      content: "# Plan",
    });
    assert.equal(created.title, "Planning-Notes.md");
    assert.equal(created.contentHash, hash("# Plan"));
    assert.match(created.relativePath, /Planning-Notes\.md$/);
    assert.equal(await readFile(path.join(root, created.relativePath), "utf8"), "# Plan");
    assert.equal((await repository.readManifest()).revision, 2);
  });

  it("rejects duplicate documents and missing workspace or folder references", async () => {
    await assert.rejects(
      repository.createDocument({ workspaceId, folderId: null, title: "Welcome", content: "duplicate" }),
      /already exists/,
    );
    await assert.rejects(
      repository.createDocument({ workspaceId: "missing", folderId: null, title: "New", content: "" }),
      /Workspace not found/,
    );
    await assert.rejects(
      repository.createDocument({ workspaceId, folderId: "missing", title: "New", content: "" }),
      /Folder not found/,
    );
  });

  it("updates only when the caller's hash is current", async () => {
    const current = await repository.readDocument(documentId);
    await assert.rejects(
      repository.updateDocument(documentId, "0".repeat(64), "# Stale"),
      /changed since it was read/,
    );
    assert.equal((await repository.readDocument(documentId)).content, current.content);
    const updated = await repository.updateDocument(documentId, current.hash, "# Updated");
    assert.equal(updated.contentHash, hash("# Updated"));
    assert.equal((await repository.readDocument(documentId)).content, "# Updated");
  });

  it("renames without changing content, rejects name collisions, and treats same-name rename as a no-op", async () => {
    const original = await repository.readDocument(documentId);
    const sameName = await repository.renameDocument(documentId, "Welcome.md", original.hash);
    assert.equal(sameName.relativePath, original.entry.relativePath);
    assert.equal((await repository.readManifest()).revision, 1);

    const second = await repository.createDocument({ workspaceId, folderId: null, title: "Existing", content: "second" });
    await assert.rejects(
      repository.renameDocument(documentId, "Existing", original.hash),
      /already exists/,
    );
    const renamed = await repository.renameDocument(documentId, "Renamed", original.hash);
    assert.equal(renamed.title, "Renamed.md");
    assert.equal(await readFile(path.join(root, renamed.relativePath), "utf8"), original.content);
    assert.equal((await repository.listDocuments()).length, 2);
    assert.equal((await repository.readDocument(second.id)).content, "second");
  });

  it("creates nested folders and rejects missing parents or duplicate paths", async () => {
    const parent = await repository.createFolder(workspaceId, null, "Notes");
    const child = await repository.createFolder(workspaceId, parent.id, "Research");
    assert.equal(child.parentId, parent.id);
    assert.match(child.relativePath, /Notes\/Research$/);
    await assert.rejects(repository.createFolder(workspaceId, "missing", "Broken"), /Parent folder not found/);
    await assert.rejects(repository.createFolder(workspaceId, null, "Notes"), /already exists/);
  });

  it("rejects path traversal in a manifest", async () => {
    const unsafe = {
      ...initialManifest,
      documents: [{ ...initialManifest.documents[0], relativePath: "../stolen.md" }],
    };
    await writeFile(path.join(root, ".markdown-ai-workspace.json"), JSON.stringify(unsafe));
    await assert.rejects(repository.readManifest(), /Unsafe Markdown path/);
  });

  it("rejects symlinked document paths that escape the selected root", async () => {
    const outsideFile = path.join(outside, "outside.md");
    await writeFile(outsideFile, "private");
    await symlink(outside, path.join(root, "escape"), "dir");
    const manifest = {
      ...initialManifest,
      documents: [{ ...initialManifest.documents[0], relativePath: "escape/outside.md" }],
    };
    await writeFile(path.join(root, ".markdown-ai-workspace.json"), JSON.stringify(manifest));
    await assert.rejects(repository.readDocument(documentId), /escaped the workspace/);
  });

  it("rejects a symlinked workspace manifest", async () => {
    const realManifest = path.join(outside, "manifest.json");
    await writeFile(realManifest, JSON.stringify(initialManifest));
    await rm(path.join(root, ".markdown-ai-workspace.json"));
    await symlink(realManifest, path.join(root, ".markdown-ai-workspace.json"));
    await assert.rejects(repository.readManifest(), /cannot be a symbolic link/);
  });
});
