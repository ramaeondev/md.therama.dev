import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const fakeApiUrl = "http://127.0.0.1:54321";
const email = "markdown.e2e@example.com";
const originalPassword = "E2E-Initial-Password-123";
const resetPassword = "E2E-Reset-Password-456";
const byokKey = "e2e-local-only-provider-key";

type FakeApiState = {
  users: Array<{ id: string; email: string; name: string; confirmed: boolean }>;
  documents: Array<{
    user_id: string;
    document_id: string;
    payload_ciphertext: string;
    payload_iv: string;
    revision: number;
    deleted_at: string | null;
  }>;
  devices: Array<{ user_id: string; device_id: string }>;
  calls: Array<{ method: string; path: string }>;
  providerKeySeen: boolean;
};

async function getFakeState(request: APIRequestContext): Promise<FakeApiState> {
  const response = await request.get(`${fakeApiUrl}/__test/state`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as FakeApiState;
}

async function mailboxLink(request: APIRequestContext, type: "signup" | "recovery") {
  const response = await request.get(
    `${fakeApiUrl}/__test/mailbox?email=${encodeURIComponent(email)}`,
  );
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as {
    messages: Array<{ type: string; link: string }>;
  };
  const message = payload.messages.find((entry) => entry.type === type);
  expect(message, `expected a ${type} email in the fake mailbox`).toBeDefined();
  return message!.link;
}

async function openStorageSettings(page: Page) {
  await page.getByRole("button", { name: "Preferences" }).click();
  await page.getByRole("button", { name: "storage", exact: true }).click();
}

async function waitForPath(page: Page, pathname: string) {
  await page.waitForURL((url) => url.pathname === pathname);
}

async function readLocalCredential(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("markdown-ai-workspace");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise<{ value?: unknown } | undefined>((resolve, reject) => {
      const transaction = database.transaction("app-meta", "readonly");
      const request = transaction.objectStore("app-meta").get("ai-provider-credentials");
      request.onsuccess = () => resolve(request.result as { value?: unknown } | undefined);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return record?.value ?? [];
  });
}

test.beforeEach(async ({ request }) => {
  await request.post(`${fakeApiUrl}/__test/reset`);
});

test("guest deletion, verified signup, first sync, pause/resume, reset, sign-in/out, and workspace deletion", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  // The app's production API URL is rewritten inside this isolated browser
  // context. The fake local service remains the only backend reached by E2E.
  await page.route("https://api-v3.therama.dev/**", async (route) => {
    const response = await route.fetch({
      url: route.request().url().replace("https://api-v3.therama.dev", fakeApiUrl),
    });
    await route.fulfill({ response });
  });
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Your knowledge, in Markdown" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  // Reproduce the reported bug: an anonymous user deletes the last workspace,
  // leaving a valid local workspace record with no documents.
  await page.getByRole("button", { name: "Delete current workspace" }).click({ noWaitAfter: true });
  const guestDeleteDialog = page.getByRole("alertdialog");
  await expect(guestDeleteDialog).toBeVisible({ timeout: 5_000 });
  await guestDeleteDialog.getByRole("button", { name: "Delete workspace" }).click();
  await expect(page.getByText("LOCAL·0 documents")).toBeVisible();

  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(originalPassword);
  await page.getByPlaceholder("Your name").fill("Markdown E2E User");
  await expect(page.getByPlaceholder("Your name")).toHaveValue("Markdown E2E User");
  expect(
    await page.locator("form").evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect
    .poll(async () =>
      (await getFakeState(request)).calls.some((call) => call.path === "/auth/v1/signup"),
    )
    .toBe(true);
  await expect(page.getByRole("status")).toContainText("confirm your address before signing in");
  await expect(page).toHaveURL(/\/signup$/u);

  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(originalPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Email not confirmed");

  // The fake API captures the confirmation email, then the browser follows its
  // one-time link exactly as a user would from an inbox.
  await page.goto(await mailboxLink(request, "signup"));
  await waitForPath(page, "/app");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Your knowledge, in Markdown" })).toBeVisible();

  // Confirmation releases the account; sign in explicitly to start its sync.
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(originalPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await waitForPath(page, "/app");
  await page.waitForLoadState("networkidle");

  await openStorageSettings(page);
  const syncToggle = page.getByRole("switch", { name: "Enable encrypted cloud sync" });
  await expect(syncToggle).toBeChecked();
  await expect(page.getByText("Save your recovery key", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "I saved this recovery key" }).click();

  await expect.poll(async () => (await getFakeState(request)).documents.length).toBe(3);
  await expect(page.getByText("Synced", { exact: false })).toBeVisible();
  await expect(page.getByText("LOCAL·3 documents")).toBeVisible();

  const firstSync = await getFakeState(request);
  expect(firstSync.users).toEqual([
    expect.objectContaining({ email, name: "Markdown E2E User", confirmed: true }),
  ]);
  expect(firstSync.devices).toHaveLength(1);
  expect(
    firstSync.documents.every((document) => document.payload_ciphertext && document.payload_iv),
  ).toBe(true);
  expect(JSON.stringify(firstSync.documents)).not.toContain("Your knowledge, in Markdown");
  expect(firstSync.providerKeySeen).toBe(false);

  // Pause sync, edit locally, and verify the fake API receives no new document
  // until sync is explicitly resumed.
  await syncToggle.click();
  await expect(syncToggle).not.toBeChecked();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "New file" }).first().click();
  const newDocumentDialog = page.getByRole("dialog", { name: "New Markdown file" });
  await newDocumentDialog.getByLabel("File name").fill("Paused sync note");
  await newDocumentDialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Paused sync note.md").first()).toBeVisible();
  await page.waitForTimeout(1_000);
  expect((await getFakeState(request)).documents).toHaveLength(3);

  await openStorageSettings(page);
  await syncToggle.click();
  await expect(syncToggle).toBeChecked();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(async () => (await getFakeState(request)).documents.length).toBe(4);

  // BYOK is stored in this browser's IndexedDB and sent only to the provider.
  // The intercepted provider request never reaches the fake workspace API.
  let providerReceivedKey = false;
  await page.route("https://api.openai.com/v1/models", async (route) => {
    providerReceivedKey =
      (await route.request().headerValue("authorization")) === `Bearer ${byokKey}`;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        object: "list",
        data: [{ id: "gpt-4o-mini", object: "model", created: 0, owned_by: "openai" }],
      }),
    });
  });
  await page.getByRole("button", { name: "Preferences" }).click();
  await page.getByRole("button", { name: "AI providers", exact: true }).click();
  await page.getByLabel("OpenAI API key").fill(byokKey);
  await page.getByRole("button", { name: "Connect OpenAI" }).click();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await expect.poll(async () => JSON.stringify(await readLocalCredential(page))).toContain(byokKey);
  expect(providerReceivedKey).toBe(true);
  const apiStateWithProvider = await getFakeState(request);
  expect(JSON.stringify(apiStateWithProvider)).not.toContain(byokKey);
  expect(apiStateWithProvider.providerKeySeen).toBe(false);

  // Sign-out returns home, clears the local provider key, and leaves Markdown
  // documents available to the same browser without an account.
  await page.getByRole("button", { name: "storage", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/");
  expect(await readLocalCredential(page)).toEqual([]);
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("LOCAL·4 documents")).toBeVisible();

  // Request a reset email, follow the fake mailbox link, and update the
  // password through the reset page before signing back in.
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("you’ll receive a password reset link");
  await page.goto(await mailboxLink(request, "recovery"));
  await waitForPath(page, "/reset-password");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("New password").fill(resetPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await page.waitForURL("**/login", { timeout: 10_000 });
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(resetPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/app");
  await expect(page.getByText("LOCAL·4 documents")).toBeVisible();

  // Reconnect a local-only key so deletion can prove it leaves BYOK intact.
  await page.route("https://api.openai.com/v1/models", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        object: "list",
        data: [{ id: "gpt-4o-mini", object: "model", created: 0, owned_by: "openai" }],
      }),
    }),
  );
  await page.getByRole("button", { name: "Preferences" }).click();
  await page.getByRole("button", { name: "AI providers", exact: true }).click();
  await page.getByLabel("OpenAI API key").fill(byokKey);
  await page.getByRole("button", { name: "Connect OpenAI" }).click();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Delete current workspace" }).click();
  const accountDeleteDialog = page.getByRole("alertdialog");
  await expect(accountDeleteDialog).toBeVisible();
  await accountDeleteDialog.getByRole("button", { name: "Delete workspace" }).click();
  await expect(page.getByText("LOCAL·0 documents")).toBeVisible();
  await expect.poll(async () => JSON.stringify(await readLocalCredential(page))).toContain(byokKey);

  await expect
    .poll(async () => {
      const state = await getFakeState(request);
      return state.documents.filter((document) => document.deleted_at).length;
    })
    .toBe(4);

  // A reload must not recreate the starter documents after a real prior sync
  // and tombstones; the empty workspace remains deliberate.
  await page.reload();
  await expect(page.getByText("LOCAL·0 documents")).toBeVisible();
  await expect(page.getByText("Welcome.md")).toHaveCount(0);
});
