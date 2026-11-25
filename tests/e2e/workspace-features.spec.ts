import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("workspace, folders, documents, settings, import, and export work locally", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/app");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Folder name").fill("Project Notes");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("Project Notes", { exact: true })).toBeVisible();

  await page.getByText("Project Notes", { exact: true }).hover();
  await page.getByRole("button", { name: "New file in Project Notes" }).click();
  await expect(page.getByRole("dialog", { name: "New Markdown file" })).toBeVisible();
  await page.getByLabel("File name").fill("Planning");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("Planning.md", { exact: true }).first()).toBeVisible();

  await page
    .locator("aside")
    .getByRole("button", { name: "Planning.md", exact: true })
    .last()
    .hover();
  await page.getByRole("button", { name: "Rename Planning.md" }).click();
  await page.getByLabel("Document name").fill("Project Plan");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByText("Project Plan.md", { exact: true }).first()).toBeVisible();

  await page
    .locator("aside")
    .getByRole("button", { name: "Project Plan.md", exact: true })
    .last()
    .hover();
  await page.getByRole("button", { name: "Duplicate Project Plan.md" }).click();
  await expect(page.getByText("Project Plan copy.md", { exact: true }).first()).toBeVisible();
  await page
    .locator("aside")
    .getByRole("button", { name: "Project Plan copy.md", exact: true })
    .last()
    .hover();
  await page.getByRole("button", { name: "Delete Project Plan copy.md" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Project Plan copy.md", { exact: true })).toHaveCount(0);

  await page.getByText("Project Notes", { exact: true }).hover();
  await page.getByRole("button", { name: "Folder actions for Project Notes" }).click();
  await expect(page.getByRole("dialog", { name: "Rename folder" })).toBeVisible();
  await page.getByLabel("Folder name").fill("Archived Notes");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByText("Archived Notes", { exact: true })).toBeVisible();
  await page.getByText("Archived Notes", { exact: true }).hover();
  await page.getByRole("button", { name: "Delete folder Archived Notes" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Archived Notes", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Project Plan.md", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(page.getByRole("dialog", { name: "Preferences" })).toBeVisible();
  await page.getByRole("button", { name: "editor", exact: true }).click();
  await expect(page.getByLabel("Editor font size")).toBeVisible();
  await expect(page.getByLabel("Auto-save delay")).toBeVisible();
  await page.getByRole("button", { name: "Workspace AI", exact: true }).click();
  await expect(page.getByText("Workspace intelligence", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "AI usage", exact: true }).click();
  await expect(page.getByText("No AI requests yet", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "storage", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "Cloud sync disabled; sign in to enable" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "general", exact: true }).click();
  await expect(page.getByLabel("Wrap long lines")).toBeVisible();
  await page.getByRole("button", { name: "light", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/u);

  await page.getByRole("button", { name: "Import Markdown file" }).click();
  await page.locator('input[type="file"][accept*=".md"]').setInputFiles({
    name: "Imported Notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Imported Notes\n\nImported locally."),
  });
  await expect(page.getByText("Imported Notes.md", { exact: true }).first()).toBeVisible();

  const documentDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export workspace" }).click();
  const exportedWorkspace = await documentDownload;
  expect(exportedWorkspace.suggestedFilename()).toMatch(/\.zip$/u);

  await page.locator("button[aria-expanded]").filter({ hasText: "My workspace" }).click();
  await page.getByRole("button", { name: "Import workspace backup" }).click();
  const exportedPath = await exportedWorkspace.path();
  if (!exportedPath) throw new Error("Playwright did not save the workspace archive");
  await page.locator('input[type="file"][accept*=".zip"]').setInputFiles({
    name: exportedWorkspace.suggestedFilename(),
    mimeType: "application/zip",
    buffer: await readFile(exportedPath),
  });
  await expect(
    page.getByRole("button", { name: "My workspace (imported)", exact: true }).first(),
  ).toBeVisible();

  await page.locator('button[title="Create workspace"]').click();
  await expect(page.getByRole("dialog", { name: "New workspace" })).toBeVisible();
  await page.getByLabel("Workspace name").fill("Second Workspace");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("LOCAL·1 documents")).toBeVisible();
  await page.locator("button[aria-expanded]").filter({ hasText: "Second Workspace" }).click();
  await page.getByRole("button", { name: "My workspace", exact: true }).click();
  await expect(page.getByText("LOCAL·4 documents")).toBeVisible();
});

test("AI provider stays local and assistant chat supports history", async ({ page }) => {
  const testKey = "e2e-local-only-provider-key";
  let chatRequestSeen = false;
  await page.route("https://api.openai.com/v1/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        object: "list",
        data: [{ id: "gpt-4o-mini", object: "model", created: 0, owned_by: "openai" }],
      }),
    }),
  );
  await page.route("https://api.openai.com/v1/chat/completions", async (route) => {
    chatRequestSeen = (await route.request().headerValue("authorization")) === `Bearer ${testKey}`;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'data: {"choices":[{"delta":{"content":"E2E assistant reply"}}]}\n\ndata: [DONE]\n\n',
    });
  });

  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Preferences" }).click();
  await page.getByRole("button", { name: "AI providers", exact: true }).click();
  await page.getByLabel("OpenAI API key").fill(testKey);
  await page.getByRole("button", { name: "Connect OpenAI" }).click();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  const composer = page.getByRole("textbox", { name: "Assistant message" });
  await expect(composer).toBeEnabled();
  await composer.fill("Explain my workspace");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("E2E assistant reply", { exact: true })).toBeVisible();
  expect(chatRequestSeen).toBe(true);

  await page.getByRole("button", { name: "Conversation history" }).click();
  const historyEntry = page.getByRole("button", { name: "Explain my workspace", exact: true });
  await expect(historyEntry).toBeVisible();
  await historyEntry.hover();
  await page.getByRole("button", { name: "Rename Explain my workspace" }).click();
  await page.getByRole("textbox", { name: "Conversation title" }).fill("Workspace help");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const renamedHistoryEntry = page.getByRole("button", { name: "Workspace help", exact: true });
  await expect(renamedHistoryEntry).toBeVisible();
  await renamedHistoryEntry.hover();
  await page.getByRole("button", { name: "Delete Workspace help" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: "Workspace help", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(composer).toBeEmpty();
});
