import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRight, FilePlus2, LoaderCircle, RotateCcw, Sparkles, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { ProviderError } from "../providers/errors";
import { streamAssistantReply } from "./chatService";

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "streaming" | "complete" | "failed" | "stopped";
  contextUsed: boolean;
  error?: string;
};

type AssistantPanelProps = {
  workspaceName: string;
  documentTitle: string | null;
  documentContent: string;
  prompts: string[];
  isConnected: boolean;
  modelId: string | null;
  onConfigure: () => void;
};

export function AssistantPanel({
  workspaceName,
  documentTitle,
  documentContent,
  prompts,
  isConnected,
  modelId,
  onConfigure,
}: AssistantPanelProps) {
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [contextEnabled, setContextEnabled] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function sendMessage(text: string, retry = false) {
    const prompt = text.trim();
    if (!prompt || runningRef.current || !isConnected || !modelId) return;

    const contextUsed = contextEnabled && Boolean(documentTitle);
    const assistantId = crypto.randomUUID();
    const userEntry: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      status: "complete",
      contextUsed,
    };
    const assistantEntry: AssistantMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      status: "streaming",
      contextUsed,
    };
    let conversation = messages;
    if (retry) {
      const lastAssistantIndex = messages.reduce(
        (lastIndex, message, index) => message.role === "assistant" ? index : lastIndex,
        -1,
      );
      conversation = messages.slice(0, lastAssistantIndex);
    } else {
      conversation = [...messages, userEntry];
      setMessages((current) => [...current, userEntry]);
      setValue("");
    }
    setMessages((current) => [...current, assistantEntry]);
    runningRef.current = true;
    setIsGenerating(true);
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const requestMessages = conversation
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map(({ role, content }) => ({ role, content }));

      for await (const chunk of streamAssistantReply({
        model: modelId,
        messages: requestMessages,
        ...(contextUsed && documentTitle ? { documentContext: { title: documentTitle, content: documentContent } } : {}),
        signal: controller.signal,
      })) {
        setMessages((current) => current.map((message) =>
          message.id === assistantId ? { ...message, content: message.content + chunk } : message,
        ));
      }
      setMessages((current) => current.map((message) =>
        message.id === assistantId ? { ...message, status: controller.signal.aborted ? "stopped" : "complete" } : message,
      ));
    } catch (error) {
      const wasStopped = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
      const safeError = error instanceof ProviderError ? error.message : "The response could not be completed. Try again.";
      setMessages((current) => current.map((message) =>
        message.id === assistantId
          ? { ...message, status: wasStopped ? "stopped" : "failed", ...(!wasStopped && { error: safeError }) }
          : message,
      ));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      runningRef.current = false;
      setIsGenerating(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(value);
  }

  function stopGeneration() {
    controllerRef.current?.abort();
  }

  function startNewConversation() {
    controllerRef.current?.abort();
    setMessages([]);
    setValue("");
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-sidebar text-sidebar-foreground" aria-label="AI Assistant">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span>Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          {isGenerating && <Button variant="ghost" size="icon" className="h-7 w-7" title="Stop generation" aria-label="Stop generation" onClick={stopGeneration}><Square /></Button>}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="New conversation" aria-label="New conversation" onClick={startNewConversation}><FilePlus2 /></Button>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[10px] font-medium">{documentTitle ?? "No document selected"}</div>
            <div className="mt-0.5 truncate text-[9px] text-muted-foreground">{workspaceName} · {contextEnabled && documentTitle ? "document context on" : "general answers"}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Use document</span>
            <Switch checked={contextEnabled} onCheckedChange={setContextEnabled} disabled={!documentTitle} aria-label="Use current document as context" />
          </div>
        </div>
        <div className="truncate border-t border-border pt-2 text-[9px] text-muted-foreground" title={modelId ?? undefined}>
          {isConnected && modelId ? `Google Gemini · ${modelId}` : "No provider connected"}
        </div>
      </div>

      {!isConnected ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card"><Sparkles className="h-4 w-4 text-primary" /></div>
          <h2 className="mt-4 text-sm font-medium">Connect Gemini to begin</h2>
          <p className="mt-1 max-w-[230px] text-xs leading-5 text-muted-foreground">Your API key stays in this browser session and is never saved with your documents.</p>
          <Button className="mt-4" size="sm" onClick={onConfigure}>Configure Gemini</Button>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card"><Sparkles className="h-4 w-4 text-primary" /></div>
          <h2 className="mt-4 text-sm font-medium">What are you working on?</h2>
          <p className="mt-1 max-w-[230px] text-xs leading-5 text-muted-foreground">{contextEnabled && documentTitle ? `Answers can refer to ${documentTitle}.` : "Ask a question or choose a prompt to get started."}</p>
          <div className="mt-5 w-full text-left">
            <div className="mb-2 text-[10px] font-medium uppercase text-muted-foreground">Try asking</div>
            <div className="flex flex-wrap gap-1.5">
              {prompts.map((prompt) => <Button key={prompt} variant="outline" size="sm" className="h-auto max-w-full whitespace-normal px-2 py-1 text-left text-[10px] font-normal leading-4" onClick={() => setValue(prompt)}>{prompt}</Button>)}
            </div>
          </div>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-3" aria-live="polite" aria-label="Conversation">
            {messages.map((message) => (
              <article key={message.id} className={message.role === "user" ? "ml-3 border-l-2 border-primary/50 pl-3" : "mr-1"}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[9px] font-medium uppercase text-muted-foreground">
                  <span>{message.role === "user" ? "You" : "Gemini"}</span>
                  {message.contextUsed && <span className="normal-case">Document-grounded</span>}
                </div>
                {message.content ? (
                  <div className="markdown-prose text-xs leading-5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  </div>
                ) : message.status === "streaming" ? (
                  <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground"><LoaderCircle className="h-3 w-3 animate-spin" /> Thinking…</div>
                ) : null}
                {message.status === "failed" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-destructive">
                    <span>{message.error}</span>
                    {message.role === "assistant" && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void sendMessage(messages.filter((entry) => entry.role === "user").at(-1)?.content ?? "", true)}><RotateCcw /> Retry</Button>}
                  </div>
                )}
                {message.status === "stopped" && <div className="mt-1 text-[10px] text-muted-foreground">Generation stopped</div>}
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
            placeholder={isConnected ? "Ask about your writing…" : "Connect Gemini in Preferences to chat…"}
            rows={3}
            disabled={!isConnected || isGenerating}
            className="w-full resize-none bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted-foreground disabled:opacity-60"
            aria-label="Assistant message"
          />
          <div className="flex items-center justify-between border-t border-border pt-2">
            <div className="flex min-w-0 items-center gap-1 truncate text-[9px] text-muted-foreground" aria-live="polite">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isConnected ? "bg-primary" : "bg-muted-foreground"}`} />
              {isGenerating ? "Generating response" : isConnected ? modelId : "No provider connected"}
            </div>
            <Button type="submit" size="icon" className="h-7 w-7" title="Send message" aria-label="Send message" disabled={!value.trim() || !isConnected || !modelId || isGenerating}><ChevronRight /></Button>
          </div>
        </form>
        <p className="mt-2 text-center text-[9px] text-muted-foreground">Enter to send · Shift+Enter for a new line</p>
      </div>
    </aside>
  );
}