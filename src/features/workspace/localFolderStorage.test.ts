import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteAppDatabase, resetAppDatabaseConnection } from "@/lib/indexedDb";
import type { LocalWorkspaceManifest } from "./localFolderFormat";
import { createStarterState } from "./model";
import { localFolderStorage } from "./localFolderStorage";

class MemoryFileHandle {
  constructor(
    readonly name: string,
    private readonly files: Map<string, string>,
  ) {}

  async getFile() {
    const text = this.files.get(this.name) ?? "";
    return { name: this.name, text: async () => text } as File;
  }

  async createWritable() {
    let content = "";
    return {
      write: async (data: string | Blob) => {
        content = typeof data === "string" ? data : await data.text();
      },
      close: async () => this.files.set(this.name, content),
    };
  }
}

class MemoryDirectoryHandle {
  readonly files = new Map<string, string>();
  readonly directories = new Map<string, MemoryDirectoryHandle>();

  constructor(readonly name: string) {}

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name) && !options?.create) throw new DOMException("Missing file", "NotFoundError");
    if (!this.files.has(name)) this.files.set(name, "");
    return new MemoryFileHandle(name, this.files);
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    let directory = this.directories.get(name);
    if (!directory && !options?.create) throw new DOMException("Missing directory", "NotFoundError");
    if (!directory) {
      directory = new MemoryDirectoryHandle(name);
      this.directories.set(name, directory);
    }
    return directory;
  }

  async removeEntry(name: string) {
    this.files.delete(name);
    this.directories.delete(name);
  }

  async *values(): AsyncIterableIterator<MemoryFileHandle | MemoryDirectoryHandle> {
    for (const name of this.files.keys()) yield new MemoryFileHandle(name, this.files);
    for (const directory of this.directories.values()) yield directory;
  }

  async queryPermission() { return "granted" as PermissionState; }
  async requestPermission() { return "granted" as PermissionState; }

  async allFiles(prefix = ""): Promise<string[]> {
    const files = [...this.files.keys()].map((name) => `${prefix}${name}`);
    const nested = await Promise.all(
      [...this.directories.values()].map((directory) => directory.allFiles(`${prefix}${directory.name}/`)),
    );
    return [...files, ...nested.flat()].sort();
  }
}

describe("browser local-folder storage adapter", () => {
  let root: MemoryDirectoryHandle;

  beforeEach(async () => {
    resetAppDatabaseConnection();
    await deleteAppDatabase();
    localFolderStorage.lastManifest = null;
    root = new MemoryDirectoryHandle("Computer notes");
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: vi.fn(async () => root),
    });
  });

  it("copies Markdown and the metadata manifest to a selected empty folder", async () => {
    const state = createStarterState();
    const result = await localFolderStorage.connect(state);
    expect(result.folderName).toBe("Computer notes");
    const files = await root.allFiles();
    expect(files).toContain(".markdown-ai-workspace.json");
    expect(files.filter((file) => file.endsWith(".md"))).toHaveLength(state.documents.length);
    const manifest = root.files.get(".markdown-ai-workspace.json");
    expect(manifest).toBeTruthy();
    expect(manifest).not.toContain(state.documents[0]?.content);
    expect(await localFolderStorage.getFolderName()).toBe("Computer notes");
  });

  it("refuses an existing Markdown folder without the app manifest", async () => {
    root.files.set("personal.md", "Keep existing file");
    await expect(localFolderStorage.connect(createStarterState())).rejects.toThrow(
      "This folder already contains Markdown files",
    );
    expect(root.files.get("personal.md")).toBe("Keep existing file");
  });

  it("reconnects to a manifest-backed folder and detects tampered document contents", async () => {
    const state = createStarterState();
    await localFolderStorage.connect(state);
    localFolderStorage.lastManifest = null;
    const connected = await localFolderStorage.connect(null);
    expect(connected.state.documents).toHaveLength(state.documents.length);
    const manifest = localFolderStorage.lastManifest as LocalWorkspaceManifest | null;
    const documentRecord = manifest?.documents[0];
    expect(documentRecord).toBeDefined();
    if (!documentRecord) return;
    const pathParts = documentRecord.relativePath.split("/");
    const fileName = pathParts.pop();
    let directory = root;
    for (const part of pathParts) directory = directory.directories.get(part)!;
    directory.files.set(fileName!, "externally changed");
    await expect(localFolderStorage.connect(null)).rejects.toThrow("changed outside the app");
  });

  it("rejects malformed manifests and reports picker availability", async () => {
    expect(await localFolderStorage.hasPicker()).toBe(true);
    root.files.set(".markdown-ai-workspace.json", "{not json");
    await expect(localFolderStorage.connect(createStarterState())).rejects.toThrow();
    delete (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker;
    expect(await localFolderStorage.hasPicker()).toBe(false);
  });
});
