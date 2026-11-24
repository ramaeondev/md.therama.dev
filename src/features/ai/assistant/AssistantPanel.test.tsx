import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteAppDatabase, resetAppDatabaseConnection } from "@/lib/indexedDb";

import { AssistantPanel } from "./AssistantPanel";
import { listConversations, listMessages, openConversation } from "./conversationStore";

const streamMock = vi.fn();

vi.mock("./chatService", () => ({
  streamAssistantReplyEvents: (...args: unknown[]) => streamMock(...args),
}));

const baseProps = {
  workspaceId: "workspace-a",
  workspaceName: "Workspace",
  documentId: "doc-1",
  documentTitle: "Notes.md",
  documentContent: "# Notes",
  prompts: ["Summarize this document"],
  isConnected: true,
  providerId: "gemini",
  modelId: "gemini-test",
  onConfigure: () => {},
};

function emitText(text: string, usage?: { inputTokens: number; outputTokens: number; totalTokens: number; source: "provider_reported" }) {
  return async function* stream() {
    for (const part of text.split("")) yield { type: "text" as const, text: part };
    yield { type: "done" as const, ...(usage ? { usage } : {}) };
  };
}

function setup() {
  return render(<AssistantPanel {...baseProps} />);
}

async function typeAndSend(text: string) {
  const textarea = screen.getByLabelText("Assistant message");
  await act(async () => {
    fireEvent.change(textarea, { target: { value: text } });
  });
  await act(async () => {
    screen.getByLabelText("Send message").click();
  });
}

async function waitForConversationMessages(workspaceId: string, expected: number) {
  await waitFor(async () => {
    const conversations = await listConversations(workspaceId);
    const first = conversations[0];
    if (!first) throw new Error("no conversation yet");
    const messages = await listMessages(first.id);
    expect(messages).toHaveLength(expected);
  }, { timeout: 3000 });
}

/** Waits until a conversation with this title has its messages persisted. */
async function waitForConversationTitled(workspaceId: string, title: string, messageCount = 2) {
  await waitFor(async () => {
    const conversation = (await listConversations(workspaceId)).find((entry) => entry.title === title);
    if (!conversation) throw new Error(`conversation "${title}" not saved yet`);
    expect(await listMessages(conversation.id)).toHaveLength(messageCount);
  }, { timeout: 3000 });
}

/** Clicks the history-list button for a conversation title (not the header). */
async function selectFromHistory(title: string) {
  await act(async () => {
    screen.getByLabelText("Conversation history").click();
  });
  const entry = await waitFor(() => {
    const button = screen.getAllByRole("button").find((node) => node.textContent === title);
    if (!button) throw new Error(`history entry "${title}" not listed`);
    return button;
  });
  await act(async () => {
    entry.click();
  });
}

/** Opens the history list and waits for a listed conversation to appear. */
async function openHistoryEntry(label: string) {
  await act(async () => {
    screen.getByLabelText("Conversation history").click();
  });
  return waitFor(() => screen.getByLabelText(label));
}

/** Reads the single conversation expected in a workspace, failing loudly otherwise. */
async function onlyConversation(workspaceId: string) {
  const conversations = await listConversations(workspaceId);
  expect(conversations).toHaveLength(1);
  const [conversation] = conversations;
  if (!conversation) throw new Error("expected one conversation");
  return conversation;
}

describe("Assistant conversation UI", () => {
  beforeEach(async () => {
    streamMock.mockReset();
    resetAppDatabaseConnection();
    await deleteAppDatabase();
  });

  it("starts without a saved conversation", async () => {
    setup();
    await waitFor(() => expect(screen.getByLabelText("New conversation")).toBeInTheDocument());
    expect(await listConversations(baseProps.workspaceId)).toEqual([]);
  });

  it("persists a conversation and its messages after sending", async () => {
    streamMock.mockImplementation((input: { conversationId?: string }) => {
      expect(input.conversationId).toBeTruthy();
      return emitText("Hi there", { inputTokens: 5, outputTokens: 2, totalTokens: 7, source: "provider_reported" })();
    });
    setup();
    await typeAndSend("Hello assistant");
    await waitForConversationMessages(baseProps.workspaceId, 2);

    const conversation = await onlyConversation(baseProps.workspaceId);
    const messages = await listMessages(conversation.id);

    expect(messages.map((message) => [message.role, message.content, message.status])).toEqual([
      ["user", "Hello assistant", "complete"],
      ["assistant", "Hi there", "complete"],
    ]);
    expect(messages[1]?.usage).toMatchObject({ totalTokens: 7, source: "provider_reported" });
    expect(conversation.title).toBe("Hello assistant");
  });

  it("shows the adopted conversation title in the panel header", async () => {
    streamMock.mockImplementation(() => emitText("Answer")());
    setup();
    await typeAndSend("Explain the outline");
    await waitForConversationMessages(baseProps.workspaceId, 2);

    const headerTitle = await screen.findByTitle("Explain the outline");
    expect(headerTitle).toHaveTextContent("Explain the outline");
  });

  it("restores the last active conversation on mount", async () => {
    streamMock.mockImplementation(() => emitText("Restored answer")());
    setup();
    await typeAndSend("Persisted question");
    await waitForConversationTitled(baseProps.workspaceId, "Persisted question");

    // Simulate a reload: tear down the component and drop the cached DB handle.
    cleanup();
    resetAppDatabaseConnection();
    setup();

    await waitFor(() => expect(screen.getByText("Persisted question")).toBeInTheDocument());
    expect(screen.getByText("Restored answer")).toBeInTheDocument();
  });

  it("keeps partial text from a stopped stream and marks it interrupted", async () => {
    streamMock.mockImplementation((input: { signal: AbortSignal }) => {
      return (async function* stream() {
        yield { type: "text" as const, text: "Partial " };
        await new Promise<void>((resolve) => {
          input.signal.addEventListener("abort", () => resolve(), { once: true });
        });
        throw new DOMException("Aborted", "AbortError");
      })();
    });
    setup();
    await typeAndSend("Start then stop");

    await waitFor(() => expect(screen.getByLabelText("Stop generation")).toBeInTheDocument());
    await act(async () => {
      screen.getByLabelText("Stop generation").click();
    });

    await waitFor(async () => {
      const conversation = await onlyConversation(baseProps.workspaceId);
      const messages = await listMessages(conversation.id);
      const assistant = messages.find((message) => message.role === "assistant");
      expect(assistant?.status).toBe("interrupted");
      expect(assistant?.content).toBe("Partial ");
    });
    // The user message is never lost.
    const conversation = await onlyConversation(baseProps.workspaceId);
    expect((await listMessages(conversation.id)).filter((message) => message.role === "user")).toHaveLength(1);
  });

  it("stores only one assistant message even when the stream emits many chunks", async () => {
    streamMock.mockImplementation(() => emitText("chunk after chunk")());
    setup();
    await typeAndSend("Count my messages");

    await waitFor(async () => {
      const conversation = await onlyConversation(baseProps.workspaceId);
      const messages = await listMessages(conversation.id);
      expect(messages.filter((message) => message.role === "assistant")).toHaveLength(1);
      expect(messages.find((message) => message.role === "assistant")?.content).toBe("chunk after chunk");
    });
  });

  it("creates a second conversation and can switch back to the first", async () => {
    streamMock.mockImplementation(() => emitText("First answer")());
    setup();
    await typeAndSend("First question");
    await waitForConversationTitled(baseProps.workspaceId, "First question");

    await act(async () => {
      screen.getByLabelText("New conversation").click();
    });
    expect(screen.queryByText("First question")).not.toBeInTheDocument();

    streamMock.mockImplementation(() => emitText("Second answer")());
    await typeAndSend("Second question");
    await waitForConversationTitled(baseProps.workspaceId, "Second question");

    const conversations = await listConversations(baseProps.workspaceId);
    expect(conversations).toHaveLength(2);
    const first = conversations.find((entry) => entry.title === "First question");
    expect(first).toBeDefined();

    await selectFromHistory("First question");

    await waitFor(() => expect(screen.getByText("First answer")).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Second answer")).not.toBeInTheDocument());
    expect(await openConversation(first!)).toHaveLength(2);
  });

  it("renames a conversation from the history list", async () => {
    streamMock.mockImplementation(() => emitText("Answer")());
    setup();
    await typeAndSend("Rename me");
    await waitForConversationTitled(baseProps.workspaceId, "Rename me");

    await openHistoryEntry("Rename Rename me");
    await act(async () => {
      screen.getByLabelText("Rename Rename me").click();
    });
    const titleInput = screen.getByLabelText("Conversation title");
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: "Renamed thread" } });
    });
    await act(async () => {
      screen.getByText("Save").click();
    });

    await waitFor(async () => {
      const conversation = await onlyConversation(baseProps.workspaceId);
      expect(conversation.title).toBe("Renamed thread");
    });
  });

  it("deletes a conversation and its messages", async () => {
    streamMock.mockImplementation(() => emitText("Doomed answer")());
    setup();
    await typeAndSend("Delete me");
    await waitForConversationTitled(baseProps.workspaceId, "Delete me");

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await openHistoryEntry("Delete Delete me");
    await act(async () => {
      screen.getByLabelText("Delete Delete me").click();
    });

    await waitFor(async () => expect(await listConversations(baseProps.workspaceId)).toEqual([]));
    confirmSpy.mockRestore();
  });

  it("shows a failed assistant reply and offers a retry", async () => {
    streamMock.mockImplementation(() => {
      return async function* stream() {
        yield { type: "text" as const, text: "" };
        throw Object.assign(new Error("boom"), { name: "ProviderError", code: "provider_unavailable", message: "The AI provider is temporarily unavailable. Try again later." });
      };
    });
    setup();
    await typeAndSend("Will fail");

    await waitFor(() => expect(screen.getByText("Retry")).toBeInTheDocument());
    const conversation = await onlyConversation(baseProps.workspaceId);
    const messages = await listMessages(conversation.id);
    expect(messages.find((message) => message.role === "assistant")?.status).toBe("failed");
  });
});
