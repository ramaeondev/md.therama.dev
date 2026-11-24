import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import { deleteAppDatabase, resetAppDatabaseConnection } from "@/lib/indexedDb";

import {
  appendMessage,
  createConversationForWorkspace,
  deleteConversation,
  dropTrailingAssistantMessages,
  getActiveConversationId,
  listConversations,
  listMessages,
  openConversation,
  readConversation,
  renameConversation,
  setActiveConversation,
} from "./conversationStore";
import { indexedDbConversationStorage } from "./conversationStorage";
import { defaultConversationTitle } from "./conversationTypes";

const workspaceId = "workspace-a";

function createConversation(overrides: Partial<Parameters<typeof createConversationForWorkspace>[0]> = {}) {
  return createConversationForWorkspace({
    workspaceId,
    providerId: "gemini",
    modelId: "gemini-test",
    ...overrides,
  });
}

describe("conversation persistence", () => {
  beforeEach(async () => {
    resetAppDatabaseConnection();
    await deleteAppDatabase();
  });

  it("creates a conversation and restores it after a simulated reload", async () => {
    const created = await createConversation({ title: "Refactor notes" });

    // A reload means a brand-new module state reading the same database.
    resetAppDatabaseConnection();
    const restored = await readConversation(created.id);

    expect(restored).toMatchObject({
      id: created.id,
      workspaceId,
      title: "Refactor notes",
      providerId: "gemini",
      modelId: "gemini-test",
    });
    expect(restored?.createdAt).toBeTruthy();
    expect(restored?.updatedAt).toBeTruthy();
  });

  it("starts new conversations with a default title and adopts the opening question", async () => {
    const conversation = await createConversation();
    expect(conversation.title).toBe(defaultConversationTitle);

    await appendMessage({ conversationId: conversation.id, role: "user", content: "How do I structure this document?", status: "complete" });
    const titled = await readConversation(conversation.id);
    expect(titled?.title).toBe("How do I structure this document?");

    // A later message must not rename an already-titled conversation.
    await appendMessage({ conversationId: conversation.id, role: "user", content: "And what about headings?", status: "complete" });
    expect((await readConversation(conversation.id))?.title).toBe("How do I structure this document?");
  });

  it("lists conversations for a workspace newest-first and isolates other workspaces", async () => {
    const first = await createConversation({ title: "First", now: "2026-11-01T10:00:00.000Z" });
    const second = await createConversation({ title: "Second", now: "2026-11-02T10:00:00.000Z" });
    await createConversation({ workspaceId: "workspace-b", providerId: "gemini", modelId: "gemini-test", title: "Other" });

    const listed = await listConversations(workspaceId);

    expect(listed.map((entry) => entry.id)).toEqual([second.id, first.id]);
    expect(listed.every((entry) => entry.workspaceId === workspaceId)).toBe(true);
  });

  it("renames a conversation and bumps its updated timestamp", async () => {
    const conversation = await createConversation({ title: "Old title" });
    const renamed = await renameConversation(conversation, "  A better   title  ");

    expect(renamed.title).toBe("A better title");
    expect(renamed.updatedAt >= conversation.updatedAt).toBe(true);
    expect((await readConversation(conversation.id))?.title).toBe("A better title");
  });

  it("keeps the previous title when a rename is blank", async () => {
    const conversation = await createConversation({ title: "Keep me" });
    const renamed = await renameConversation(conversation, "   ");
    expect(renamed.title).toBe("Keep me");
  });

  it("persists messages in order and restores them when the conversation is reopened", async () => {
    const conversation = await createConversation();
    await appendMessage({ conversationId: conversation.id, role: "user", content: "Question", status: "complete", now: "2026-11-01T10:00:00.000Z" });
    await appendMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: "Answer",
      status: "complete",
      now: "2026-11-01T10:00:05.000Z",
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14, source: "provider_reported" },
    });

    resetAppDatabaseConnection();
    const messages = await openConversation(conversation);

    expect(messages.map((message) => [message.role, message.content, message.status])).toEqual([
      ["user", "Question", "complete"],
      ["assistant", "Answer", "complete"],
    ]);
    expect(messages[1]?.usage).toEqual({ inputTokens: 10, outputTokens: 4, totalTokens: 14, source: "provider_reported" });
  });

  it("switches the active conversation per workspace and restores it after a reload", async () => {
    const first = await createConversation({ title: "First" });
    const second = await createConversation({ title: "Second" });

    await openConversation(first);
    expect(await getActiveConversationId(workspaceId)).toBe(first.id);

    resetAppDatabaseConnection();
    expect(await getActiveConversationId(workspaceId)).toBe(first.id);

    await setActiveConversation(workspaceId, second.id);
    expect(await getActiveConversationId(workspaceId)).toBe(second.id);
    // Other workspaces keep their own pointer.
    expect(await getActiveConversationId("workspace-b")).toBeNull();
  });

  it("deletes a conversation with its messages and clears the active pointer", async () => {
    const conversation = await createConversation({ title: "Temporary" });
    const kept = await createConversation({ title: "Kept" });
    await appendMessage({ conversationId: conversation.id, role: "user", content: "Will be deleted", status: "complete" });
    await appendMessage({ conversationId: kept.id, role: "user", content: "Survives", status: "complete" });
    await openConversation(conversation);

    await deleteConversation(conversation);

    expect(await readConversation(conversation.id)).toBeNull();
    expect(await listMessages(conversation.id)).toEqual([]);
    expect(await getActiveConversationId(workspaceId)).toBeNull();
    // The other conversation is untouched.
    expect((await listMessages(kept.id)).map((message) => message.content)).toEqual(["Survives"]);
  });

  it("keeps an unrelated active pointer when a different conversation is deleted", async () => {
    const active = await createConversation({ title: "Active" });
    const other = await createConversation({ title: "Other" });
    await openConversation(active);

    await deleteConversation(other);

    expect(await getActiveConversationId(workspaceId)).toBe(active.id);
  });

  it("records interrupted and failed assistant messages without losing earlier history", async () => {
    const conversation = await createConversation();
    await appendMessage({ conversationId: conversation.id, role: "user", content: "First", status: "complete" });
    await appendMessage({ conversationId: conversation.id, role: "assistant", content: "Partial answ", status: "interrupted" });

    const messages = await listMessages(conversation.id);
    expect(messages.map((message) => message.status)).toEqual(["complete", "interrupted"]);
    expect(messages[1]?.content).toBe("Partial answ");

    await appendMessage({ conversationId: conversation.id, role: "user", content: "Second", status: "complete" });
    await appendMessage({ conversationId: conversation.id, role: "assistant", content: "", status: "failed", error: "The AI provider is temporarily unavailable. Try again later." });

    const afterFailure = await listMessages(conversation.id);
    expect(afterFailure).toHaveLength(4);
    expect(afterFailure[3]).toMatchObject({ status: "failed", error: expect.stringContaining("unavailable") });
  });

  it("drops only trailing assistant replies before a retry", async () => {
    const conversation = await createConversation();
    await appendMessage({ conversationId: conversation.id, role: "user", content: "Question", status: "complete" });
    await appendMessage({ conversationId: conversation.id, role: "assistant", content: "Broken", status: "failed", error: "failed" });

    const remaining = await dropTrailingAssistantMessages(conversation.id);

    expect(remaining.map((message) => message.role)).toEqual(["user"]);
    expect(await listMessages(conversation.id)).toHaveLength(1);
  });

  it("never stores credentials alongside conversations or messages", async () => {
    const secret = "super-secret-api-key";
    const conversation = await createConversation({ title: "Sensitive" });
    await appendMessage({ conversationId: conversation.id, role: "user", content: "Hello", status: "complete" });

    const stored = [
      ...await indexedDbConversationStorage.listConversations(workspaceId),
      ...await indexedDbConversationStorage.listMessages(conversation.id),
    ];

    expect(JSON.stringify(stored)).not.toContain(secret);
    const allowedKeys = new Set([
      "id", "workspaceId", "documentId", "title", "providerId", "modelId", "createdAt", "updatedAt",
      "conversationId", "role", "content", "status", "sequence", "usage", "error",
    ]);
    for (const record of stored) {
      for (const key of Object.keys(record)) expect(allowedKeys.has(key)).toBe(true);
    }
  });

  it("associates a conversation with an optional document", async () => {
    const conversation = await createConversation({ documentId: "doc-1" });
    expect((await readConversation(conversation.id))?.documentId).toBe("doc-1");

    const general = await createConversation({ title: "General" });
    expect((await readConversation(general.id))?.documentId).toBeUndefined();
  });
});
