import { expect, test, type Page, type Route } from "@playwright/test";
import JSZip from "jszip";

const BASE_URL = "http://127.0.0.1:4189";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("markdown-ai-workspace-tour-complete", "true");
  });
  await installFakeOpenAi(page);
});

test("landing page opens the local workspace and explains the product", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /your notes stay yours/i })).toBeVisible();
  await expect(page.getByText(/no account, no cloud sync/i)).toBeVisible();
  await page.getByRole("link", { name: /start writing/i }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await expect(page.getByRole("region", { name: "Markdown workspace editor" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Welcome.md" }).first()).toBeVisible();
});

test("Documentation  documents features, local storage, providers, and MCP setup", async ({ page }) => {
  await page.goto("/guide");
  await expect(page.getByRole("heading", { name: "Features and setup guide" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everyday writing tools" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Browser storage or a computer folder" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect a provider with your own key" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Use your Markdown workspace from an MCP client" })).toBeVisible();
  await expect(page.getByText(/MD_WORKSPACE_ROOT/).first()).toBeVisible();
  await expect(page.getByText("search_documents", { exact: true })).toBeVisible();
  await expect(page.getByText(/MD_MCP_READ_ONLY/).first()).toBeVisible();
  await page.getByRole("link", { name: "Open workspace" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
});

test("workspace tour explains the main features and relevant settings panels", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Start guided tour" }).click();
  await expect(page.getByRole("heading", { name: "Workspaces stay on this device" })).toBeVisible();
  await expect(page.getByTestId("guided-tour")).toBeVisible();

  for (let index = 0; index < 14; index += 1) {
    await page.getByTestId("tour-step").getByRole("button", { name: /next/i }).click();
  }
  await expect(page.getByRole("heading", { name: "Connect a local MCP client" })).toBeVisible();
  await expect(page.getByTestId("guided-tour")).toContainText("local process");
  await expect(page.locator('[data-tour="mcp-guide"]')).toBeVisible();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByTestId("guided-tour")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("markdown-ai-workspace-tour-complete"))).toBe("true");
});

test("workspace CRUD, document search, editor views, and local persistence work", async ({ page }) => {
  await openWorkspace(page);

  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Folder name").fill("Meeting notes");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("Meeting notes", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "New file", exact: true }).last().click();
  await page.getByLabel("File name").fill("Sprint Plan");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("# Sprint Plan");
  await page.locator(".cm-content").fill("# Sprint Plan\n\nSearch target paragraph.");
  await expect(page.getByText("Saved locally")).toBeVisible({ timeout: 6_000 });

  const search = page.getByRole("textbox", { name: "Search documents" });
  await search.fill("target paragraph");
  await expect(page.getByRole("button", { name: "Sprint Plan.md" }).first()).toBeVisible();
  await search.fill("not present");
  await expect(page.getByText("No matching documents")).toBeVisible();
  await search.clear();

  await page.getByRole("button", { name: "Preview view" }).click();
  await expect(page.locator(".markdown-prose")).toContainText("Search target paragraph.");
  await page.getByRole("button", { name: "Editor view" }).click();
  await expect(page.locator(".cm-content")).toContainText("Search target paragraph.");

  await page.getByTitle("Sprint Plan.md").last().hover();
  await page.getByRole("button", { name: "Rename Sprint Plan.md" }).click();
  await page.getByLabel("Document name").fill("Sprint Plan Final");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sprint Plan Final.md" }).first()).toBeVisible();

  await page.getByTitle("Sprint Plan Final.md").last().hover();
  await page.getByRole("button", { name: "Duplicate Sprint Plan Final.md" }).click();
  await expect(page.getByRole("button", { name: "Sprint Plan Final copy.md" }).first()).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTitle("Sprint Plan Final.md").last().hover();
  await page.getByRole("button", { name: "Export Sprint Plan Final.md" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("Sprint Plan Final.md");

  await page.getByTitle("Sprint Plan Final copy.md").last().hover();
  await page.getByRole("button", { name: "Delete Sprint Plan Final copy.md" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sprint Plan Final copy.md" })).toHaveCount(0);

  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByLabel("Workspace name").fill("Research Space");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("button", { name: "Research Space" })).toBeVisible();
  await page.getByRole("button", { name: "Research Space" }).click();
  await page.getByRole("button", { name: "My workspace", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sprint Plan Final.md" })).toBeVisible();

  await page.reload();
  await expect(page.locator(".cm-content")).toContainText("Search target paragraph.");
});

test("workspace and Markdown imports/exports preserve local content", async ({ page }) => {
  await openWorkspace(page);
  const markdownInput = page.locator('input[type="file"][accept*=".md"]');
  await markdownInput.setInputFiles({
    name: "Imported note.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Imported note\n\nImported body"),
  });
  await expect(page.getByRole("button", { name: "Imported note.md" }).first()).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("Imported body");

  const workspaceDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export workspace" }).click();
  const download = await workspaceDownload;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const zipBytes = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of zipBytes) chunks.push(Buffer.from(chunk));
  const archive = await JSZip.loadAsync(Buffer.concat(chunks));
  expect(Object.keys(archive.files).some((name) => name.endsWith("Imported note.md"))).toBe(true);
  expect(await archive.file(/workspace\.json$/)[0]?.async("string")).toContain("Imported body");

  const importedZip = await JSZip.loadAsync(Buffer.concat(chunks));
  const backup = {
    name: "backup.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await importedZip.generateAsync({ type: "nodebuffer" })),
  };
  await page.locator('input[type="file"][accept*="application/zip"]').setInputFiles(backup);
  await expect(page.getByText(/Imported My workspace \(imported\)/)).toBeVisible({ timeout: 8_000 });
});

test("browser storage can switch to a local folder and back without deleting folder files", async ({ page }) => {
  await installFakeDirectoryPicker(page);
  await openWorkspace(page);
  await page.getByRole("button", { name: "Preferences" }).click();
  await page.getByRole("button", { name: "storage", exact: true }).click();
  await expect(page.getByText(/Documents are saved in this browser/)).toBeVisible();
  await page.getByRole("button", { name: "Connect local folder" }).click();
  await expect(page.getByText(/saved as files in “E2E Notes”/)).toBeVisible();
  const filesAfterConnect = await page.evaluate(() => (window as Window & { __fakeFiles?: () => string[] }).__fakeFiles?.() ?? []);
  expect(filesAfterConnect).toContain(".markdown-ai-workspace.json");
  expect(filesAfterConnect.some((file) => file.endsWith("Welcome.md"))).toBe(true);

  await page.getByRole("button", { name: "Use browser storage" }).click();
  await expect(page.getByText(/Documents are saved in this browser/)).toBeVisible();
  const filesAfterSwitch = await page.evaluate(() => (window as Window & { __fakeFiles?: () => string[] }).__fakeFiles?.() ?? []);
  expect(filesAfterSwitch).toEqual(filesAfterConnect);
  await expect(page.getByRole("link", { name: "MCP setup guide" })).toBeVisible();
});

test("AI provider, assistant, writing skills, inline completion, rewrite preview, and usage work with a fake API", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Preferences" }).click();
  await page.getByRole("button", { name: "AI providers", exact: true }).click();
  await page.getByLabel("OpenAI API key").fill("fake-openai-key");
  await page.getByRole("button", { name: "Connect OpenAI" }).click();
  await expect(page.getByRole("region", { name: "AI provider settings" }).getByText("gpt-4.1-mini", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  const composer = page.getByRole("textbox", { name: "Assistant message" });
  await composer.fill("Say hello from the fake provider");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Fake assistant reply", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Preferences" }).click();
  await page.getByRole("button", { name: "AI usage", exact: true }).click();
  await expect(page.getByText(/completed/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  const editor = page.locator(".cm-content");
  await editor.fill("A sentence that could be clearer.");
  await editor.press("Meta+A");
  await page.getByRole("button", { name: "Rewrite selected Markdown" }).click();
  await expect(page.locator(".cm-ai-completion")).toContainText("Clear rewritten passage.");
  await editor.press("Tab");
  await expect(editor).toContainText("Clear rewritten passage.");

  await page.getByRole("button", { name: "Suggest Markdown at cursor" }).click();
  await expect(page.locator(".cm-ai-completion")).toContainText("Fake inline continuation.");
  await editor.press("Escape");
  await expect(page.locator(".cm-ai-completion")).toHaveCount(0);
  await page.getByRole("button", { name: "Suggest Markdown at cursor" }).click();
  await expect(page.locator(".cm-ai-completion")).toBeVisible();
  await editor.press("Tab");
  await expect(editor).toContainText("Fake inline continuation.");

  await page.getByRole("button", { name: "Preferences" }).click();
  await page.getByRole("button", { name: "Workspace AI", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workspace intelligence" })).toBeVisible();
  await expect(page.getByText(/MiniLM L6 runs in this browser/)).toBeVisible();
});

async function openWorkspace(page: Page) {
  await page.goto(`${BASE_URL}/workspace`);
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await expect(page.getByRole("region", { name: "Markdown workspace editor" })).toBeVisible();
  await expect(page.getByText("Saved locally")).toBeVisible({ timeout: 8_000 });
}

async function installFakeOpenAi(page: Page) {
  await page.route("https://api.openai.com/**", async (route: Route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-origin": BASE_URL,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, openai-organization, openai-project",
      "access-control-max-age": "86400",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.headers()["authorization"] === "Bearer invalid-key") {
      await route.fulfill({ status: 401, headers: corsHeaders, json: { error: { message: "Invalid API key" } } });
      return;
    }
    if (new URL(request.url()).pathname.endsWith("/models")) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: {
          data: [
            { id: "gpt-4.1-mini", object: "model", created: 1, owned_by: "fake" },
            { id: "text-embedding-3-small", object: "model", created: 1, owned_by: "fake" },
          ],
        },
      });
      return;
    }
    const body = request.postDataJSON() as { stream?: boolean; messages?: Array<{ content?: string }> };
    const userContent = body.messages?.map((message) => message.content ?? "").join("\n") ?? "";
    const completion = userContent.includes("exact text to insert")
      ? "Fake inline continuation."
      : userContent.includes("Rewrite only the selected")
        ? "Clear rewritten passage."
        : "Fake assistant reply";
    if (!body.stream) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: { choices: [{ message: { role: "assistant", content: completion } }] },
      });
      return;
    }
    const stream = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: completion }, index: 0 }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");
    await route.fulfill({
      status: 200,
      headers: { ...corsHeaders, "content-type": "text/event-stream" },
      body: stream,
    });
  });
}

async function installFakeDirectoryPicker(page: Page) {
  await page.addInitScript(() => {
    type E2EFileHandle = {
      name: string;
      getFile(): Promise<File>;
      createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>;
    };
    type E2EDirectoryHandle = {
      name: string;
      files: Map<string, string>;
      directories: Map<string, E2EDirectoryHandle>;
      getFileHandle(name: string, options?: { create?: boolean }): Promise<E2EFileHandle>;
      getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<E2EDirectoryHandle>;
      removeEntry(name: string): Promise<void>;
      values(): AsyncIterableIterator<E2EFileHandle | E2EDirectoryHandle>;
      queryPermission(): Promise<PermissionState>;
      requestPermission(): Promise<PermissionState>;
    };
    class E2EFile implements E2EFileHandle {
      constructor(readonly name: string, private readonly parent: E2EDirectoryHandle) {}
      async getFile() {
        return new File([this.parent.files.get(this.name) ?? ""], this.name);
      }
      async createWritable() {
        let content = "";
        return {
          write: async (data: string | Blob) => {
            content = typeof data === "string" ? data : await data.text();
          },
          close: async () => {
            this.parent.files.set(this.name, content);
          },
        };
      }
    }
    class E2EDirectory implements E2EDirectoryHandle {
      readonly files = new Map<string, string>();
      readonly directories = new Map<string, E2EDirectoryHandle>();
      constructor(readonly name: string) {}
      async getFileHandle(name: string, options?: { create?: boolean }) {
        if (!this.files.has(name) && !options?.create) throw new DOMException("Missing", "NotFoundError");
        if (!this.files.has(name)) this.files.set(name, "");
        return new E2EFile(name, this);
      }
      async getDirectoryHandle(name: string, options?: { create?: boolean }) {
        let directory = this.directories.get(name);
        if (!directory && !options?.create) throw new DOMException("Missing", "NotFoundError");
        if (!directory) {
          directory = new E2EDirectory(name);
          this.directories.set(name, directory);
        }
        return directory;
      }
      async removeEntry(name: string) {
        this.files.delete(name);
        this.directories.delete(name);
      }
      async *values() {
        for (const name of this.files.keys()) yield new E2EFile(name, this);
        for (const directory of this.directories.values()) yield directory;
      }
      async queryPermission() { return "granted" as PermissionState; }
      async requestPermission() { return "granted" as PermissionState; }
    }

    const handleKey = "markdown-local-workspace-directory";
    const root = new E2EDirectory("E2E Notes");
    let savedHandle: E2EDirectoryHandle | null = null;
    const storePrototype = IDBObjectStore.prototype;
    const originalPut = storePrototype.put;
    const originalDelete = storePrototype.delete;
    const originalGet = storePrototype.get;
    const resultGetter = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "result")?.get;
    storePrototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (value && typeof value === "object" && "key" in value && value.key === handleKey) {
        savedHandle = (value as unknown as { handle: E2EDirectoryHandle }).handle;
        return originalPut.call(this, { key: handleKey, handle: null }, key);
      }
      return originalPut.call(this, value, key);
    } as typeof storePrototype.put;
    storePrototype.delete = function (this: IDBObjectStore, key: IDBValidKey) {
      if (key === handleKey) savedHandle = null;
      return originalDelete.call(this, key);
    };
    storePrototype.get = function (this: IDBObjectStore, key: IDBValidKey) {
      const request = originalGet.call(this, key);
      if (key === handleKey && resultGetter) {
        Object.defineProperty(request, "result", {
          configurable: true,
          get() {
            const stored = resultGetter.call(this) as { key: string } | undefined;
            return stored ? { key: handleKey, handle: savedHandle } : stored;
          },
        });
      }
      return request;
    };
    Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: async () => root });
    Object.defineProperty(window, "__fakeFiles", {
      value: () => {
        const paths: string[] = [];
        const walk = (directory: E2EDirectoryHandle, prefix = "") => {
          for (const name of directory.files.keys()) paths.push(`${prefix}${name}`);
          for (const child of directory.directories.values()) walk(child, `${prefix}${child.name}/`);
        };
        walk(root);
        return paths.sort();
      },
    });
  });
}
