import { expect, test } from "@playwright/test";

test("Markdown toolbar applies each formatting action", async ({ page }) => {
  await page.goto("/app");
  await page.waitForLoadState("networkidle");

  const editor = page.locator(".cm-content");
  await editor.fill("Toolbar sample");

  const formatting = [
    { name: "Bold", marker: "**" },
    { name: "Italic", marker: "_" },
    { name: "Heading 1", marker: "# " },
    { name: "Heading 2", marker: "## " },
    { name: "Bulleted list", marker: "- " },
    { name: "Numbered list", marker: "1. " },
    { name: "Quote", marker: "> " },
    { name: "Code block", marker: "```" },
    { name: "Table", marker: "| Column | Column |" },
  ];

  for (const action of formatting) {
    await editor.press("ControlOrMeta+a");
    await page.getByRole("button", { name: action.name, exact: true }).click();
    await expect(editor).toContainText(action.marker);
  }
});

test("search, editor views, outline, tabs, and assistant panel controls work", async ({ page }) => {
  await page.goto("/app");
  await page.waitForLoadState("networkidle");

  const search = page.getByRole("textbox", { name: "Search documents" });
  await search.fill("Quick start");
  await expect(page.getByRole("button", { name: "Quick start.md", exact: true })).toBeVisible();
  await search.fill("no matching title");
  await expect(page.getByText("No matching documents")).toBeVisible();
  await search.clear();

  await page.getByRole("button", { name: "Editor view" }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  await page.getByRole("button", { name: "Preview view" }).click();
  await expect(page.locator(".cm-content")).toHaveCount(0);
  await expect(page.locator("article")).toBeVisible();
  await page.getByRole("button", { name: "Split view" }).click();
  await expect(page.locator(".cm-content")).toBeVisible();

  await page.getByRole("button", { name: "Document outline" }).click();
  await expect(page.getByText("Outline", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "A workspace that stays yours" })).toBeVisible();
  await page.getByRole("button", { name: "Document outline" }).click();
  await expect(page.getByText("Outline", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Hide assistant panel" }).click();
  await expect(page.getByRole("complementary", { name: "AI Assistant" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show assistant panel" }).click();
  await expect(page.getByRole("complementary", { name: "AI Assistant" })).toBeVisible();

  await page.getByRole("button", { name: "Close Welcome.md tab" }).click();
  await expect(page.getByRole("button", { name: "Welcome.md", exact: true }).first()).toBeVisible();
});
