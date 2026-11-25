import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProviderModel } from "../providers/types";
import type { CustomProviderDefinition } from "./customProviderStorage";

export type ConnectedProviderSummary = {
  providerId: string;
  displayName: string;
  models: ProviderModel[];
  connectedAt: string;
};

export type ProviderSettingsPanelProps = {
  connectedProviders: ConnectedProviderSummary[];
  activeProviderId: string | null;
  selectedModels: Record<string, string>;
  customProviders: CustomProviderDefinition[];
  busyProviderId: string | null;
  statusByProvider: Record<string, "connecting" | "testing" | "failed">;
  errorByProvider: Record<string, string>;
  onConnect: (providerId: string, apiKey: string) => Promise<boolean>;
  onTest: (providerId: string) => Promise<boolean>;
  onDisconnect: (providerId: string) => void;
  onSelectProvider: (providerId: string) => void;
  onSelectModel: (providerId: string, modelId: string) => void;
  onAddCustomProvider: (input: {
    displayName: string;
    baseUrl: string;
    apiKey: string;
    useRelay: boolean;
  }) => Promise<boolean>;
  onRemoveCustomProvider: (providerId: string) => Promise<void>;
};

type ProviderCardConfig = {
  providerId: string;
  displayName: string;
  description: string;
  custom: boolean;
};

const builtInCards: ProviderCardConfig[] = [
  {
    providerId: "gemini",
    displayName: "Google Gemini",
    description: "Google's Gemini API. Text generation and streaming with provider-reported usage.",
    custom: false,
  },
  {
    providerId: "openai",
    displayName: "OpenAI",
    description: "Official OpenAI API. Chat Completions with streaming and usage reporting.",
    custom: false,
  },
];

/**
 * AI provider settings for built-in providers and custom OpenAI-compatible
 * instances.
 *
 * Keys are typed into masked fields and handed to an in-memory session; this
 * component never persists or logs them. Connected providers stay listed
 * together so the user can switch without reloading the page.
 */
export function ProviderSettingsPanel({
  connectedProviders,
  activeProviderId,
  selectedModels,
  customProviders,
  busyProviderId,
  statusByProvider,
  errorByProvider,
  onConnect,
  onTest,
  onDisconnect,
  onSelectProvider,
  onSelectModel,
  onAddCustomProvider,
  onRemoveCustomProvider,
}: ProviderSettingsPanelProps) {
  const cards = useMemo<ProviderCardConfig[]>(
    () => [
      ...builtInCards,
      ...customProviders.map((definition) => ({
        providerId: definition.id,
        displayName: definition.displayName,
        description: definition.baseUrl,
        custom: true,
      })),
    ],
    [customProviders],
  );

  return (
    <section className="space-y-6" aria-label="AI provider settings">
      <div>
        <h3 className="text-sm font-medium">AI providers</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Connect one or more providers. Keys are held in memory for this browser tab, sent directly
          to the provider, and never saved with your workspace.
        </p>
      </div>

      <div className="space-y-3">
        {cards.map((card) => {
          const connected = connectedProviders.find(
            (entry) => entry.providerId === card.providerId,
          );
          return (
            <ProviderCard
              key={card.providerId}
              config={card}
              connected={connected}
              isActive={activeProviderId === card.providerId}
              selectedModel={selectedModels[card.providerId] ?? connected?.models[0]?.id ?? ""}
              busy={busyProviderId === card.providerId}
              status={statusByProvider[card.providerId]}
              error={errorByProvider[card.providerId]}
              onConnect={onConnect}
              onTest={onTest}
              onDisconnect={onDisconnect}
              onSelectProvider={onSelectProvider}
              onSelectModel={onSelectModel}
              onRemoveCustom={onRemoveCustomProvider}
            />
          );
        })}
      </div>

      <AddCustomProviderForm onAdd={onAddCustomProvider} />

      <p className="text-[11px] leading-5 text-muted-foreground">
        A browser-direct key is visible to this browser and its extensions. Use a dedicated,
        restricted key for AI access and revoke it if it is exposed.
      </p>
    </section>
  );
}

function ProviderCard({
  config,
  connected,
  isActive,
  selectedModel,
  busy,
  status,
  error,
  onConnect,
  onTest,
  onDisconnect,
  onSelectProvider,
  onSelectModel,
  onRemoveCustom,
}: {
  config: ProviderCardConfig;
  connected: ConnectedProviderSummary | undefined;
  isActive: boolean;
  selectedModel: string;
  busy: boolean;
  status: "connecting" | "testing" | "failed" | undefined;
  error: string | undefined;
  onConnect: (providerId: string, apiKey: string) => Promise<boolean>;
  onTest: (providerId: string) => Promise<boolean>;
  onDisconnect: (providerId: string) => void;
  onSelectProvider: (providerId: string) => void;
  onSelectModel: (providerId: string, modelId: string) => void;
  onRemoveCustom: (providerId: string) => Promise<void>;
}) {
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const [keyRequired, setKeyRequired] = useState(false);
  const [modelFilter, setModelFilter] = useState("");

  const models = connected?.models ?? [];
  const chatModels = models.filter((model) => model.capabilities.textGeneration);
  const otherModels = models.filter((model) => !model.capabilities.textGeneration);
  const filtered = models.filter((model) =>
    modelFilter.trim() ? model.id.toLowerCase().includes(modelFilter.trim().toLowerCase()) : true,
  );

  async function submitKey() {
    const apiKey = apiKeyRef.current?.value.trim() ?? "";
    if (!apiKey) {
      setKeyRequired(true);
      apiKeyRef.current?.focus();
      return;
    }
    if (await onConnect(config.providerId, apiKey)) {
      if (apiKeyRef.current) apiKeyRef.current.value = "";
      setKeyRequired(false);
    }
  }

  return (
    <div
      className={`rounded-md border px-3 py-3 ${isActive ? "border-primary/60 bg-primary/5" : "border-border"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-xs font-semibold">{config.displayName}</h4>
            {connected && (
              <span className="rounded-sm border border-primary/40 px-1 py-0.5 text-[9px] font-medium uppercase text-primary">
                {isActive ? "Active" : "Connected"}
              </span>
            )}
            {config.custom && (
              <span className="text-[9px] uppercase text-muted-foreground">Compatible</span>
            )}
          </div>
          <p className="mt-1 break-all text-[11px] leading-5 text-muted-foreground">
            {config.description}
          </p>
        </div>
        {config.custom && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            title={`Remove ${config.displayName}`}
            aria-label={`Remove ${config.displayName}`}
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(
                  `Remove the ${config.displayName} provider? Its saved configuration is deleted; the key is already only in memory.`,
                )
              )
                return;
              void onRemoveCustom(config.providerId);
            }}
          >
            <Trash2 />
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Input
          ref={apiKeyRef}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={connected ? "Replace API key" : "Paste API key"}
          aria-label={`${config.displayName} API key`}
          className="h-8 min-w-0 flex-1 text-xs"
          onChange={() => setKeyRequired(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submitKey();
            }
          }}
        />
        <Button
          size="sm"
          className="h-8"
          disabled={busy}
          onClick={() => void submitKey()}
          aria-label={`${connected ? "Reconnect" : "Connect"} ${config.displayName}`}
        >
          {busy && status === "connecting" ? (
            <>
              <LoaderCircle className="animate-spin" /> Connecting
            </>
          ) : (
            <>
              <Plug /> {connected ? "Reconnect" : "Connect"}
            </>
          )}
        </Button>
        {connected && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={busy}
              onClick={() => void onTest(config.providerId)}
            >
              {busy && status === "testing" ? (
                <>
                  <LoaderCircle className="animate-spin" /> Testing
                </>
              ) : (
                <>
                  <RefreshCw /> Test
                </>
              )}
            </Button>
            {!isActive && (
              <Button
                variant="secondary"
                size="sm"
                className="h-8"
                onClick={() => onSelectProvider(config.providerId)}
              >
                Use provider
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={busy}
              onClick={() => {
                if (apiKeyRef.current) apiKeyRef.current.value = "";
                onDisconnect(config.providerId);
              }}
            >
              Clear key
            </Button>
          </>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 text-[11px]" role="status" aria-live="polite">
        {connected ? (
          <CircleCheck className="h-3.5 w-3.5 text-primary" />
        ) : status === "failed" ? (
          <CircleAlert className="h-3.5 w-3.5 text-destructive" />
        ) : busy ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        )}
        <span className="text-muted-foreground">
          {connected
            ? `${chatModels.length} chat ${chatModels.length === 1 ? "model" : "models"} · checked ${new Date(connected.connectedAt).toLocaleTimeString("en-US")}`
            : status === "failed"
              ? "Connection failed"
              : busy
                ? "Working"
                : "Not configured"}
        </span>
      </div>

      {keyRequired && (
        <p className="mt-1 text-[11px] text-destructive" role="alert">
          Enter an API key to connect.
        </p>
      )}
      {error && (
        <p className="mt-1 text-[11px] text-destructive" role="alert">
          {error}
        </p>
      )}

      {connected && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium">Model</span>
            <span className="truncate text-[10px] text-muted-foreground" title={selectedModel}>
              {selectedModel || "none selected"}
            </span>
          </div>
          {models.length > 6 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={modelFilter}
                onChange={(event) => setModelFilter(event.target.value)}
                placeholder="Filter models"
                aria-label={`Filter ${config.displayName} models`}
                className="h-7 pl-7 text-[11px]"
              />
            </div>
          )}
          <div className="max-h-40 overflow-y-auto rounded-sm border border-border">
            {models.length === 0 && (
              <p className="px-2 py-2 text-[11px] text-muted-foreground">
                No models were returned for this key.
              </p>
            )}
            {filtered.length === 0 && models.length > 0 && (
              <p className="px-2 py-2 text-[11px] text-muted-foreground">
                No model matches that filter.
              </p>
            )}
            {filtered.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => onSelectModel(config.providerId, model.id)}
                aria-pressed={selectedModel === model.id}
                className={`flex w-full items-center justify-between gap-2 border-b border-border px-2 py-1.5 text-left text-[11px] last:border-b-0 hover:bg-muted/50 ${selectedModel === model.id ? "bg-secondary" : ""}`}
              >
                <span className="min-w-0 truncate" title={model.id}>
                  {model.displayName}
                </span>
                <span className="shrink-0 text-[9px] uppercase text-muted-foreground">
                  {model.capabilities.textGeneration
                    ? model.capabilities.streaming
                      ? "chat · stream"
                      : "chat"
                    : "untested"}
                </span>
              </button>
            ))}
          </div>
          {otherModels.length > 0 && (
            <p className="text-[10px] leading-4 text-muted-foreground">
              {otherModels.length} returned {otherModels.length === 1 ? "model is" : "models are"}{" "}
              not confirmed to support chat and are listed without a chat claim.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AddCustomProviderForm({
  onAdd,
}: {
  onAdd: (input: {
    displayName: string;
    baseUrl: string;
    apiKey: string;
    useRelay: boolean;
  }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://");
  const [apiKey, setApiKey] = useState("");
  const [useRelay, setUseRelay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!name.trim() || !baseUrl.trim() || !apiKey.trim()) {
      setError("Provider name, base URL, and API key are all required.");
      return;
    }
    setBusy(true);
    try {
      const ok = await onAdd({
        displayName: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        useRelay,
      });
      if (ok) {
        setName("");
        setBaseUrl("https://");
        setApiKey("");
        setUseRelay(false);
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-dashed border-border px-3 py-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="text-xs font-medium">Add an OpenAI-compatible provider</span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {!open && (
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          Connect any service that implements the Chat Completions API — for example 100milionseek,
          OpenRouter, Groq, DeepSeek, or a local Ollama server.
        </p>
      )}
      {open && (
        <div className="mt-3 space-y-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Provider name, e.g. 100milionseek"
            aria-label="Compatible provider name"
            className="h-8 text-xs"
          />
          <Input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.example.com/v1"
            aria-label="Compatible provider base URL"
            spellCheck={false}
            autoComplete="off"
            className="h-8 text-xs"
          />
          <Input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="API key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            aria-label="Compatible provider API key"
            className="h-8 text-xs"
          />
          <p className="text-[10px] leading-4 text-muted-foreground">
            Remote endpoints must use HTTPS, and private network addresses are rejected. Loopback
            HTTP is allowed for local runtimes.
          </p>
          <label className="flex items-start gap-2 rounded border border-border px-2 py-2">
            <input
              type="checkbox"
              checked={useRelay}
              onChange={(event) => setUseRelay(event.target.checked)}
              aria-label="Send requests through this app's relay"
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
            />
            <span className="text-[10px] leading-4 text-muted-foreground">
              <span className="font-medium text-foreground">
                Send requests through this app's relay.
              </span>{" "}
              Use this when the endpoint blocks browser requests (CORS). Your API key is still typed
              here and never saved, but it is forwarded by this app's server on the way to the
              endpoint instead of going straight from your browser.
            </span>
          </label>
          {error && (
            <p className="text-[11px] text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-8" disabled={busy} onClick={() => void submit()}>
              {busy ? (
                <>
                  <LoaderCircle className="animate-spin" /> Connecting
                </>
              ) : (
                <>
                  <Plus /> Add &amp; connect
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
