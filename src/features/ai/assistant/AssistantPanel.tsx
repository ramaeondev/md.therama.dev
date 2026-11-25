import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronRight,
  FilePlus2,
  History,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isAbortError, ProviderError } from "../providers/errors";
import type { ProviderUsage } from "../providers/types";
import { EmbeddingError } from "../embeddings/errors";
import { retrieveWorkspaceContext } from "../rag/ragService";
import type { RetrievalSource } from "../rag/types";
import { streamAssistantReplyEvents } from "./chatService";
import {
  appendMessage,
  createConversationForWorkspace,
  deleteConversation,
  dropTrailingAssistantMessages,
  getActiveConversationId,
  listConversations,
  listMessages,
  readConversation,
  renameConversation,
  setActiveConversation,
} from "./conversationStore";
import type {
  Conversation,
  ConversationMessage,
  ConversationMessageStatus,
} from "./conversationTypes";

type DisplayMessage = ConversationMessage & {
  /** True while this reply is still being streamed and not yet persisted. */
  streaming?: boolean;
};

type AssistantPanelProps = {
  workspaceId: string;
  workspaceName: string;
  documentId: string | null;
  documentTitle: string | null;
  documentContent: string;
  prompts: string[];
  isConnected: boolean;
  providerId: string | null;
  /** Display name of the active provider, e.g. "OpenAI". */
  providerLabel?: string | null;
  modelId: string | null;
  onConfigure: () => void;
  onOpenSource?: (documentId: string, headingPath: string[]) => void;
};

/** Short, human label for an assistant reply's attribution. */
function assistantLabel(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): string {
  if (providerId === "gemini") return "Gemini";
  if (providerId === "openai") return "OpenAI";
  if (providerId?.startsWith("openai-compatible:")) return "Compatible";
  if (providerId) return providerId;
  return modelId ? "Assistant" : "Assistant";
}

export function AssistantPanel({
  workspaceId,
  workspaceName,
  documentId,
  documentTitle,
  documentContent,
  prompts,
  isConnected,
  providerId,
  providerLabel,
  modelId,
  onConfigure,
  onOpenSource,
}: AssistantPanelProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [pendingDeleteConversation, setPendingDeleteConversation] = useState<Conversation | null>(
    null,
  );
  const [value, setValue] = useState("");
  const [contextMode, setContextMode] = useState<"none" | "active-document" | "workspace">("none");
  const [isGenerating, setIsGenerating] = useState(false);
  const canChat = isConnected && Boolean(modelId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const conversationRef = useRef<Conversation | null>(null);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const refreshConversations = useCallback(async () => {
    setConversations(await listConversations(workspaceId));
  }, [workspaceId]);

  // Restore the last active conversation for this workspace, falling back to the
  // most recent one, so a reload lands where the user left off.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await listConversations(workspaceId);
      const activeId = await getActiveConversationId(workspaceId);
      const restored = list.find((entry) => entry.id === activeId) ?? list[0] ?? null;
      if (cancelled) return;
      setConversations(list);
      setConversation(restored);
      if (restored) {
        const restoredMessages = await listMessages(restored.id);
        if (cancelled) return;
        setMessages(restoredMessages);
        await setActiveConversation(workspaceId, restored.id);
      } else {
        setMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function ensureConversation(): Promise<Conversation> {
    const current = conversationRef.current;
    if (current) return current;
    const created = await createConversationForWorkspace({
      workspaceId,
      providerId: providerId ?? "gemini",
      modelId: modelId ?? "",
      ...(contextMode === "active-document" && documentId ? { documentId } : {}),
    });
    conversationRef.current = created;
    setConversation(created);
    void refreshConversations();
    return created;
  }

  async function switchConversation(target: Conversation) {
    controllerRef.current?.abort();
    setHistoryOpen(false);
    setConversation(target);
    conversationRef.current = target;
    setMessages(await listMessages(target.id));
    await setActiveConversation(workspaceId, target.id);
  }

  async function startNewConversation() {
    controllerRef.current?.abort();
    setValue("");
    setHistoryOpen(false);
    // Defer creation until the first message so empty conversations never pile up.
    setConversation(null);
    conversationRef.current = null;
    setMessages([]);
    await setActiveConversation(workspaceId, null);
  }

  async function commitRename(target: Conversation) {
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title) return;
    const updated = await renameConversation(target, title);
    setConversations(await listConversations(workspaceId));
    if (conversationRef.current?.id === updated.id) {
      setConversation(updated);
      conversationRef.current = updated;
    }
  }

  function removeConversation(target: Conversation) {
    setPendingDeleteConversation(target);
  }

  async function confirmRemoveConversation(target: Conversation) {
    setPendingDeleteConversation(null);
    await deleteConversation(target);
    const remaining = await listConversations(workspaceId);
    setConversations(remaining);
    if (conversationRef.current?.id === target.id) {
      const next = remaining[0] ?? null;
      setConversation(next);
      conversationRef.current = next;
      setMessages(next ? await listMessages(next.id) : []);
      await setActiveConversation(workspaceId, next?.id ?? null);
    }
  }

  async function sendMessage(text: string, retry = false) {
    const prompt = text.trim();
    if (!prompt || runningRef.current || !isConnected || !modelId) return;

    const target = await ensureConversation();
    const contextUsed =
      contextMode === "active-document" && Boolean(documentTitle) && Boolean(documentContent);

    // A retry replaces the trailing assistant reply instead of appending to it.
    const history = retry
      ? await dropTrailingAssistantMessages(target.id)
      : await listMessages(target.id);

    if (!retry) {
      const userMessage = await appendMessage({
        conversationId: target.id,
        role: "user",
        content: prompt,
        status: "complete",
      });
      setMessages([...history, userMessage]);
      setValue("");
      history.push(userMessage);
    } else {
      setMessages(history);
    }

    const assistantId = crypto.randomUUID();
    const draft: DisplayMessage = {
      id: assistantId,
      conversationId: target.id,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      status: "complete",
      sequence: Number.MAX_SAFE_INTEGER,
      streaming: true,
      ...(providerId ? { providerId } : {}),
      ...(modelId ? { modelId } : {}),
    };
    setMessages((current) => [...current, draft]);
    runningRef.current = true;
    setIsGenerating(true);

    const controller = new AbortController();
    controllerRef.current = controller;
    let buffered = "";
    let usage: ProviderUsage | undefined;
    // Attribution comes from the adapter that actually served the request, so a
    // switch mid-stream can never mislabel a reply.
    let responseProviderId: string | undefined;
    let responseModelId: string | undefined;
    let responseSources: RetrievalSource[] = [];
    let finalStatus: ConversationMessageStatus = "complete";
    let failureMessage: string | undefined;

    try {
      const requestMessages = history
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map(({ role, content }) => ({ role, content }));

      const workspaceContext =
        contextMode === "workspace"
          ? await retrieveWorkspaceContext(workspaceId, prompt, { signal: controller.signal })
          : undefined;
      responseSources = workspaceContext?.sources ?? [];

      for await (const event of streamAssistantReplyEvents({
        model: modelId,
        messages: requestMessages,
        ...(contextUsed && documentTitle
          ? { documentContext: { title: documentTitle, content: documentContent } }
          : {}),
        ...(workspaceContext ? { workspaceContext: workspaceContext.text } : {}),
        signal: controller.signal,
        conversationId: target.id,
      })) {
        if (event.type === "text") {
          // Buffered in render state only; storage is written once, at the end.
          buffered += event.text;
          const snapshot = buffered;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: snapshot } : message,
            ),
          );
        } else if (event.type === "done") {
          usage = event.usage;
          responseProviderId = event.providerId;
          responseModelId = event.modelId;
        }
      }
      if (controller.signal.aborted) finalStatus = "interrupted";
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        finalStatus = "interrupted";
      } else {
        finalStatus = "failed";
        failureMessage =
          error instanceof ProviderError
            ? error.message
            : error instanceof EmbeddingError
              ? error.message
              : "The response could not be completed. Try again.";
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      runningRef.current = false;
      setIsGenerating(false);
    }

    const attributedProviderId = responseProviderId ?? providerId ?? undefined;
    const attributedModelId = responseModelId ?? modelId ?? undefined;

    // Persist exactly one terminal assistant message, including partial text.
    try {
      const stored = await appendMessage({
        conversationId: target.id,
        role: "assistant",
        content: buffered,
        status: finalStatus,
        ...(usage ? { usage } : {}),
        ...(attributedProviderId ? { providerId: attributedProviderId } : {}),
        ...(attributedModelId ? { modelId: attributedModelId } : {}),
        ...(responseSources.length ? { sources: responseSources } : {}),
        ...(failureMessage ? { error: failureMessage } : {}),
      });
      setMessages((current) =>
        current.map((message) => (message.id === assistantId ? { ...stored } : message)),
      );
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                streaming: false,
                status: finalStatus,
                ...(attributedProviderId ? { providerId: attributedProviderId } : {}),
                ...(attributedModelId ? { modelId: attributedModelId } : {}),
                ...(responseSources.length ? { sources: responseSources } : {}),
              }
            : message,
        ),
      );
    }
    // Reflect a title adopted from the opening question, or a bumped updatedAt.
    // Guarded so a slow refresh cannot resurrect a conversation the user has
    // already replaced with a new one.
    const refreshed = await readConversation(target.id);
    if (refreshed && conversationRef.current?.id === refreshed.id) {
      setConversation(refreshed);
      conversationRef.current = refreshed;
    }
    await refreshConversations();
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(value);
  }

  function stopGeneration() {
    controllerRef.current?.abort();
  }

  const isEmpty = messages.length === 0;
  const lastUserMessage =
    messages.filter((message) => message.role === "user").at(-1)?.content ?? "";

  return (
    <aside
      className="flex h-full min-h-0 flex-col border-l border-border bg-sidebar text-sidebar-foreground"
      aria-label="AI Assistant"
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate" title={conversation?.title}>
            {conversation?.title ?? "Assistant"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isGenerating && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Stop generation"
              aria-label="Stop generation"
              onClick={stopGeneration}
            >
              <Square />
            </Button>
          )}
          <Button
            variant={historyOpen ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            title="Conversation history"
            aria-label="Conversation history"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <History />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            title="New conversation"
            aria-label="New conversation"
            onClick={() => void startNewConversation()}
          >
            <FilePlus2 />
          </Button>
        </div>
      </div>

      {historyOpen && (
        <div className="max-h-64 shrink-0 overflow-y-auto border-b border-border bg-popover p-1">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
            This workspace
          </div>
          {conversations.length === 0 && (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">
              No saved conversations yet.
            </p>
          )}
          {conversations.map((entry) => (
            <div
              key={entry.id}
              className={`group flex items-center gap-1 rounded-sm px-1 ${entry.id === conversation?.id ? "bg-secondary" : ""}`}
            >
              {renamingId === entry.id ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-1 py-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void commitRename(entry);
                  }}
                >
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                    className="min-w-0 flex-1 rounded-sm border border-input bg-background px-1 py-0.5 text-[11px] outline-none"
                    aria-label="Conversation title"
                  />
                  <Button type="submit" variant="ghost" size="sm" className="h-6 px-1 text-[10px]">
                    Save
                  </Button>
                </form>
              ) : (
                <>
                  <button
                    className="min-w-0 flex-1 truncate px-1 py-1.5 text-left text-[11px]"
                    onClick={() => void switchConversation(entry)}
                    aria-current={entry.id === conversation?.id ? "true" : undefined}
                  >
                    {entry.title}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    title="Rename conversation"
                    aria-label={`Rename ${entry.title}`}
                    onClick={() => {
                      setRenamingId(entry.id);
                      setRenameDraft(entry.title);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    title="Delete conversation"
                    aria-label={`Delete ${entry.title}`}
                    onClick={() => void removeConversation(entry)}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="mt-0.5 truncate text-[9px] text-muted-foreground">
              {workspaceName} ·{" "}
              {contextMode === "workspace"
                ? "workspace context"
                : contextMode === "active-document"
                  ? "active document context"
                  : "no document context"}
            </div>
          </div>
        </div>
        <label className="space-y-1 text-[10px]">
          <span className="text-muted-foreground">Answer using</span>
          <select
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            value={contextMode}
            onChange={(event) => setContextMode(event.target.value as typeof contextMode)}
            aria-label="Answer using"
          >
            <option value="none">No document context</option>
            <option value="active-document" disabled={!documentTitle}>
              Active document
            </option>
            <option value="workspace">Entire workspace</option>
          </select>
        </label>
        {contextMode === "workspace" && (
          <p className="text-[9px] leading-4 text-muted-foreground">
            Relevant excerpts are retrieved locally and sent with your question to the selected chat
            provider.
          </p>
        )}
        <div
          className="truncate border-t border-border pt-2 text-[9px] text-muted-foreground"
          title={modelId ?? undefined}
        >
          {isConnected
            ? `${providerLabel ?? "Provider"} · ${modelId ?? "no model selected"}`
            : "No provider connected"}
        </div>
      </div>

      {!canChat ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <h2 className="mt-4 text-sm font-medium">
            {isConnected ? "Choose a model" : "Connect an AI provider to begin"}
          </h2>
          <p className="mt-1 max-w-[230px] text-xs leading-5 text-muted-foreground">
            {isConnected
              ? "Select an available model in Preferences before sending a message."
              : "Your API key stays on this device and is never saved with your documents."}
          </p>
          <Button className="mt-4" size="sm" onClick={onConfigure}>
            {isConnected ? "Choose model" : "Configure providers"}
          </Button>
        </div>
      ) : isEmpty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <h2 className="mt-4 text-sm font-medium">What are you working on?</h2>
          <p className="mt-1 max-w-[230px] text-xs leading-5 text-muted-foreground">
            {contextMode === "active-document" && documentTitle
              ? `Answers can refer to ${documentTitle}.`
              : contextMode === "workspace"
                ? "Ask about information across your indexed documents."
                : "Ask a question or choose a prompt to get started."}
          </p>
          <div className="mt-5 w-full text-left">
            <div className="mb-2 text-[10px] font-medium uppercase text-muted-foreground">
              Try asking
            </div>
            <div className="flex flex-wrap gap-1.5">
              {prompts.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  size="sm"
                  className="h-auto max-w-full whitespace-normal px-2 py-1 text-left text-[10px] font-normal leading-4"
                  onClick={() => setValue(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-3" aria-live="polite" aria-label="Conversation">
            {messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === "user" ? "ml-3 border-l-2 border-primary/50 pl-3" : "mr-1"
                }
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-[9px] font-medium uppercase text-muted-foreground">
                  <span title={message.modelId ?? undefined}>
                    {message.role === "user"
                      ? "You"
                      : assistantLabel(
                          message.providerId ?? providerId,
                          message.modelId ?? modelId,
                        )}
                  </span>
                  {message.usage && (
                    <span className="normal-case">{message.usage.totalTokens ?? "?"} tokens</span>
                  )}
                </div>
                {message.content ? (
                  <div className="markdown-prose text-xs leading-5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  </div>
                ) : message.streaming ? (
                  <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                    <LoaderCircle className="h-3 w-3 animate-spin" /> Thinking…
                  </div>
                ) : null}
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-border pt-2" aria-label="Sources">
                    <div className="text-[9px] font-semibold uppercase text-muted-foreground">
                      Sources
                    </div>
                    {message.sources.map((source) => (
                      <button
                        key={source.chunkId}
                        type="button"
                        className="block w-full truncate text-left text-[10px] text-primary underline-offset-2 hover:underline"
                        title={`${source.documentTitle}${source.headingPath.length ? ` → ${source.headingPath.join(" → ")}` : ""}`}
                        onClick={() => onOpenSource?.(source.documentId, source.headingPath)}
                      >
                        {source.documentTitle}
                        {source.headingPath.length ? ` → ${source.headingPath.join(" → ")}` : ""}
                      </button>
                    ))}
                  </div>
                )}
                {message.status === "failed" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-destructive">
                    <span>{message.error}</span>
                    {message.role === "assistant" && lastUserMessage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => void sendMessage(lastUserMessage, true)}
                      >
                        <RotateCcw /> Retry
                      </Button>
                    )}
                  </div>
                )}
                {message.status === "interrupted" && (
                  <div className="mt-1 text-[10px] text-muted-foreground">Generation stopped</div>
                )}
              </article>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      )}

      <div className="shrink-0 border-t border-border p-3">
        <form onSubmit={submit} className="rounded-md border border-border bg-background p-2">
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              canChat
                ? "Ask about your writing…"
                : isConnected
                  ? "Select a model in Preferences…"
                  : "Connect an AI provider in Preferences to chat…"
            }
            rows={3}
            disabled={!canChat || isGenerating}
            className="w-full resize-none bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted-foreground disabled:opacity-60"
            aria-label="Assistant message"
          />
          <div className="flex items-center justify-between border-t border-border pt-2">
            <div
              className="flex min-w-0 items-center gap-1 truncate text-[9px] text-muted-foreground"
              aria-live="polite"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${isConnected ? "bg-primary" : "bg-muted-foreground"}`}
              />
              {isGenerating
                ? "Generating response"
                : canChat
                  ? modelId
                  : isConnected
                    ? "Select a model"
                    : "No provider connected"}
            </div>
            <Button
              type="submit"
              size="icon"
              className="h-7 w-7"
              title="Send message"
              aria-label="Send message"
              disabled={!value.trim() || !canChat || isGenerating}
            >
              <ChevronRight />
            </Button>
          </div>
        </form>
        <p className="mt-2 text-center text-[9px] text-muted-foreground">
          Enter to send · Shift+Enter for a new line
        </p>
      </div>
      <ConfirmDialog
        open={Boolean(pendingDeleteConversation)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteConversation(null);
        }}
        title="Delete conversation"
        description={
          pendingDeleteConversation
            ? `Delete “${pendingDeleteConversation.title}”? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (pendingDeleteConversation) {
            void confirmRemoveConversation(pendingDeleteConversation);
          }
        }}
      />
    </aside>
  );
}
