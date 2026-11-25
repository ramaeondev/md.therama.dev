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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CustomProviderDefinition } from "@/features/ai/settings/customProviderStorage";
import {
  ProviderSettingsPanel,
  type ConnectedProviderSummary,
} from "@/features/ai/settings/ProviderSettingsPanel";
import { UsageDashboard } from "@/features/ai/usage/UsageDashboard";
import { WorkspaceIntelligencePanel } from "@/features/ai/rag/WorkspaceIntelligencePanel";
import { Link } from "@tanstack/react-router";
import type { MarkdownDocument } from "./types";
import type { WorkspacePreferences } from "./types";

export type SettingsSection = "general" | "editor" | "storage" | "ai" | "usage" | "intelligence";
export type ProviderConnectionStatus =
  "not-configured" | "connecting" | "testing" | "connected" | "failed";

type WorkspaceSettingsProps = {
  open: boolean;
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
  accountEmail: string | null;
  syncEnabled: boolean;
  syncStatus: string;
  recoveryKey: string | null;
  recoveryKeyAcknowledged: boolean;
  recoveryKeyInput: string;
  onSyncEnabledChange: (enabled: boolean) => void;
  onRecoveryKeyAcknowledged: () => void;
  onRecoveryKeyInputChange: (value: string) => void;
  onUnlockSync: () => void;
  onSignOut: () => void;
};

export function WorkspaceSettings({
  open,
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
  accountEmail,
  syncEnabled,
  syncStatus,
  recoveryKey,
  recoveryKeyAcknowledged,
  recoveryKeyInput,
  onSyncEnabledChange,
  onRecoveryKeyAcknowledged,
  onRecoveryKeyInputChange,
  onUnlockSync,
  onSignOut,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              <section className="space-y-4">
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
              <section className="space-y-5">
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
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium">Storage & sync</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your workspace is stored on this device.
                  </p>
                </div>
                <div className="flex items-start gap-3 border-y border-border py-4">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary" />
                  <div>
                    <p className="text-sm font-medium">Local storage ready</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Documents are saved in this browser. Export a workspace backup to keep a
                      portable copy.
                    </p>
                  </div>
                </div>
                {accountEmail ? (
                  <div className="space-y-4 rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Cloud sync</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          Signed in as {accountEmail}
                        </p>
                      </div>
                      <Switch
                        checked={syncEnabled}
                        onCheckedChange={onSyncEnabledChange}
                        aria-label="Enable encrypted cloud sync"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{syncStatus}</p>
                    <p className="text-xs text-muted-foreground">
                      Only encrypted Markdown files sync. Turning sync off pauses future transfers
                      and keeps existing copies on this device and in your account.
                    </p>
                    {recoveryKey && !recoveryKeyAcknowledged && (
                      <div className="space-y-3 rounded-md bg-muted p-3">
                        <p className="text-sm font-medium">Save your recovery key</p>
                        <p className="text-xs text-muted-foreground">
                          This key unlocks your encrypted documents on another device. It is shown
                          only here and is not stored on the server.
                        </p>
                        <code className="block break-all rounded bg-background p-2 text-xs">
                          {recoveryKey}
                        </code>
                        <Button size="sm" onClick={onRecoveryKeyAcknowledged}>
                          I saved this recovery key
                        </Button>
                      </div>
                    )}
                    {!recoveryKey &&
                      syncEnabled &&
                      syncStatus.toLowerCase().includes("recovery key") && (
                        <div className="space-y-2">
                          <label className="text-xs" htmlFor="sync-recovery-key">
                            Enter recovery key from another device
                          </label>
                          <Input
                            id="sync-recovery-key"
                            value={recoveryKeyInput}
                            onChange={(event) => onRecoveryKeyInputChange(event.target.value)}
                            autoComplete="off"
                          />
                          <Button size="sm" onClick={onUnlockSync}>
                            Unlock encrypted sync
                          </Button>
                        </div>
                      )}
                    <Button variant="outline" size="sm" onClick={onSignOut}>
                      Sign out
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 rounded-lg border border-border p-4">
                    <div>
                      <p className="text-sm font-medium">Sign in to enable cloud sync</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sync stays off while you use the app without an account.
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-xs text-muted-foreground">Cloud sync</p>
                      <TooltipProvider delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0} className="inline-flex">
                              <Switch
                                checked={false}
                                disabled
                                aria-label="Cloud sync disabled; sign in to enable"
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Sign in to enable encrypted cloud sync.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Button asChild size="sm">
                      <Link to="/login">Sign in</Link>
                    </Button>
                  </div>
                )}
              </section>
            )}
            {activeSection === "ai" && (
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
            )}
            {activeSection === "usage" && <UsageDashboard />}
            {activeSection === "intelligence" && (
              <WorkspaceIntelligencePanel workspaceId={workspaceId} documents={documents} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
