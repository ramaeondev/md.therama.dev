import { useEffect, useState } from "react";
import { Check, MonitorCog, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { CustomProviderDefinition } from "@/features/ai/settings/customProviderStorage";
import {
  ProviderSettingsPanel,
  type ConnectedProviderSummary,
} from "@/features/ai/settings/ProviderSettingsPanel";
import { UsageDashboard } from "@/features/ai/usage/UsageDashboard";
import { WorkspaceIntelligencePanel } from "@/features/ai/rag/WorkspaceIntelligencePanel";
import type { MarkdownDocument } from "./types";
import type { WorkspacePreferences } from "./types";

export type SettingsSection = "general" | "editor" | "storage" | "ai" | "usage" | "intelligence";
export type ProviderConnectionStatus =
  "not-configured" | "connecting" | "testing" | "connected" | "failed";

export type WorkspaceSettingsProps = {
  open: boolean;
  modal?: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: WorkspacePreferences;
  onChange: (preferences: WorkspacePreferences) => void;
  initialSection: SettingsSection;
  workspaceId: string;
  documents: MarkdownDocument[];
  connectedProviders: ConnectedProviderSummary[];
  activeProviderId: string | null;
  customProviders: CustomProviderDefinition[];
  busyProviderId: string | null;
  statusByProvider: Record<string, "connecting" | "testing" | "failed">;
  errorByProvider: Record<string, string>;
  onConnectProvider: (providerId: string, apiKey: string) => Promise<boolean>;
  onTestProvider: (providerId: string) => Promise<boolean>;
  onDisconnectProvider: (providerId: string) => void;
  onSelectProvider: (providerId: string) => void;
  onSelectModel: (providerId: string, modelId: string) => void;
  onAddCustomProvider: (input: {
    displayName: string;
    baseUrl: string;
    apiKey: string;
    useRelay: boolean;
  }) => Promise<boolean>;
  onRemoveCustomProvider: (providerId: string) => Promise<void>;
  localFolderName: string | null;
  localFolderSupported: boolean;
  onConnectLocalFolder: () => Promise<void>;
  onDisconnectLocalFolder: () => Promise<void>;
};

export function WorkspaceSettings({
  open,
  modal = true,
  onOpenChange,
  preferences,
  onChange,
  initialSection,
  workspaceId,
  documents,
  connectedProviders,
  activeProviderId,
  customProviders,
  busyProviderId,
  statusByProvider,
  errorByProvider,
  onConnectProvider,
  onTestProvider,
  onDisconnectProvider,
  onSelectProvider,
  onSelectModel,
  onAddCustomProvider,
  onRemoveCustomProvider,
  localFolderName,
  localFolderSupported,
  onConnectLocalFolder,
  onDisconnectLocalFolder,
}: WorkspaceSettingsProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");

  useEffect(() => {
    if (open) setActiveSection(initialSection);
  }, [initialSection, open]);

  function update<Key extends keyof WorkspacePreferences>(
    key: Key,
    value: WorkspacePreferences[Key],
  ) {
    onChange({ ...preferences, [key]: value });
  }

  return (
    <Dialog open={open} modal={modal} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MonitorCog className="h-4 w-4 text-primary" /> Preferences
          </DialogTitle>
          <DialogDescription>Appearance, editing, and local storage.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-[330px] grid-cols-[170px_1fr] overflow-hidden">
          <nav className="border-r border-border p-3" aria-label="Settings sections">
            {(["general", "editor", "storage", "ai", "intelligence", "usage"] as const).map(
              (section) => (
                <Button
                  key={section}
                  variant={activeSection === section ? "secondary" : "ghost"}
                  className="mb-1 h-9 w-full justify-start text-xs capitalize"
                  onClick={() => setActiveSection(section)}
                >
                  {section === "ai"
                    ? "AI providers"
                    : section === "usage"
                      ? "AI usage"
                      : section === "intelligence"
                        ? "Workspace AI"
                        : section}
                </Button>
              ),
            )}
          </nav>
          <div className="min-w-0 space-y-6 overflow-y-auto p-6">
            {activeSection === "general" && (
              <section data-tour="settings-general" className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium">Appearance</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Choose how your workspace looks.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["dark", "light"] as const).map((theme) => (
                    <Button
                      key={theme}
                      variant={preferences.theme === theme ? "secondary" : "outline"}
                      className="h-10 justify-start capitalize"
                      onClick={() => update("theme", theme)}
                    >
                      {theme === "dark" ? <Moon /> : <Sun />}
                      {theme}
                      {preferences.theme === theme && <Check className="ml-auto" />}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <p className="text-sm font-medium">Wrap long lines</p>
                    <p className="text-xs text-muted-foreground">
                      Keep long lines within the editor.
                    </p>
                  </div>
                  <Switch
                    checked={preferences.wordWrap}
                    onCheckedChange={(checked) => update("wordWrap", checked)}
                    aria-label="Wrap long lines"
                  />
                </div>
              </section>
            )}
            {activeSection === "editor" && (
              <section data-tour="settings-editor" className="space-y-5">
                <div>
                  <h3 className="text-sm font-medium">Editor</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Tune the writing surface.</p>
                </div>
                <label className="block space-y-2 text-sm">
                  <span>
                    Font size{" "}
                    <span className="text-muted-foreground">· {preferences.fontSize}px</span>
                  </span>
                  <Input
                    type="range"
                    min={12}
                    max={20}
                    step={1}
                    value={preferences.fontSize}
                    onChange={(event) => update("fontSize", Number(event.target.value))}
                    className="h-8 px-0 accent-primary"
                    aria-label="Editor font size"
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  <span>Auto-save delay</span>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={preferences.autoSaveDelay}
                    onChange={(event) => update("autoSaveDelay", Number(event.target.value))}
                    aria-label="Auto-save delay"
                  >
                    <option value={300}>300 ms</option>
                    <option value={700}>700 ms</option>
                    <option value={1200}>1.2 seconds</option>
                    <option value={2000}>2 seconds</option>
                  </select>
                </label>
              </section>
            )}
            {activeSection === "storage" && (
              <section data-tour="settings-storage" className="space-y-5">
                <div>
                  <h3 className="text-sm font-medium">Local storage</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Keep Markdown in this browser or connect a local folder for the MCP server to use.
                  </p>
                </div>
                <div className="flex items-start gap-3 border-y border-border py-4">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary" />
                  <div>
                    <p className="text-sm font-medium">Local storage ready</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {localFolderName
                        ? `Markdown documents are saved as files in “${localFolderName}”. MCP clients configured for that folder can read and edit them.`
                        : "Documents are saved in this browser. Connect a folder to share Markdown files with a local MCP server, or export a workspace ZIP."}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={!localFolderSupported} onClick={() => void onConnectLocalFolder()}>
                    {localFolderName ? "Choose or reconnect folder" : "Connect local folder"}
                  </Button>
                  {localFolderName && (
                    <Button size="sm" variant="ghost" onClick={() => void onDisconnectLocalFolder()}>
                      Use browser storage
                    </Button>
                  )}
                </div>
                {!localFolderSupported && (
                  <p className="text-xs text-muted-foreground">
                    Local folders require a supported browser. Browser storage remains available.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">No account or cloud sync is used. Connecting a folder copies your browser workspaces and keeps the browser copy as a fallback.</p>
                <p className="text-xs text-muted-foreground">
                  Configure the separate MCP process using the{" "}
                  <a
                    className="text-primary underline underline-offset-2"
                    href="https://github.com/ramaeondev/markdown-meadow-workspace/blob/main/mcp/README.md"
                    data-tour="mcp-guide"
                    target="_blank"
                    rel="noreferrer"
                  >
                    MCP setup guide
                  </a>
                  .
                </p>
              </section>
            )}
            {activeSection === "ai" && (
              <div data-tour="settings-ai">
              <ProviderSettingsPanel
                connectedProviders={connectedProviders}
                activeProviderId={activeProviderId}
                selectedModels={{
                  ...Object.fromEntries(
                    connectedProviders.map((entry) => [
                      entry.providerId,
                      entry.models[0]?.id ?? "",
                    ]),
                  ),
                  ...(preferences.aiSelectedModels ?? {}),
                  ...(activeProviderId && preferences.aiModelId
                    ? { [activeProviderId]: preferences.aiModelId }
                    : {}),
                }}
                customProviders={customProviders}
                busyProviderId={busyProviderId}
                statusByProvider={statusByProvider}
                errorByProvider={errorByProvider}
                onConnect={onConnectProvider}
                onTest={onTestProvider}
                onDisconnect={onDisconnectProvider}
                onSelectProvider={onSelectProvider}
                onSelectModel={onSelectModel}
                onAddCustomProvider={onAddCustomProvider}
                onRemoveCustomProvider={onRemoveCustomProvider}
              />
              </div>
            )}
            {activeSection === "usage" && <div data-tour="settings-usage"><UsageDashboard /></div>}
            {activeSection === "intelligence" && (
              <div data-tour="settings-intelligence">
                <WorkspaceIntelligencePanel workspaceId={workspaceId} documents={documents} />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
