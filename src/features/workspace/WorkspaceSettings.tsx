import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, CircleCheck, LoaderCircle, MonitorCog, Moon, Sun } from "lucide-react";

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
import type { ProviderModel } from "@/features/ai/providers/types";
import type { WorkspacePreferences } from "./types";

export type SettingsSection = "general" | "editor" | "storage" | "ai";
export type ProviderConnectionStatus = "not-configured" | "connecting" | "testing" | "connected" | "failed";

type WorkspaceSettingsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: WorkspacePreferences;
  onChange: (preferences: WorkspacePreferences) => void;
  initialSection: SettingsSection;
  providerStatus: ProviderConnectionStatus;
  providerModels: ProviderModel[];
  onConnectGemini: (apiKey: string) => Promise<boolean>;
  onTestGemini: () => void;
  onDisconnectGemini: () => void;
};

export function WorkspaceSettings({
  open,
  onOpenChange,
  preferences,
  onChange,
  initialSection,
  providerStatus,
  providerModels,
  onConnectGemini,
  onTestGemini,
  onDisconnectGemini,
}: WorkspaceSettingsProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const [keyRequired, setKeyRequired] = useState(false);

  useEffect(() => {
    if (open) setActiveSection(initialSection);
  }, [initialSection, open]);

  function update<Key extends keyof WorkspacePreferences>(key: Key, value: WorkspacePreferences[Key]) {
    onChange({ ...preferences, [key]: value });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-base"><MonitorCog className="h-4 w-4 text-primary" /> Preferences</DialogTitle>
          <DialogDescription>Appearance, editing, and local storage.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-[330px] grid-cols-[170px_1fr] overflow-hidden">
          <nav className="border-r border-border p-3" aria-label="Settings sections">
            {(["general", "editor", "storage", "ai"] as const).map((section) => (
              <Button key={section} variant={activeSection === section ? "secondary" : "ghost"} className="mb-1 h-9 w-full justify-start text-xs capitalize" onClick={() => setActiveSection(section)}>
                {section === "ai" ? "AI providers" : section}
              </Button>
            ))}
          </nav>
          <div className="min-w-0 space-y-6 overflow-y-auto p-6">
            {activeSection === "general" && (
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium">Appearance</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Choose how your workspace looks.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["dark", "light"] as const).map((theme) => (
                    <Button key={theme} variant={preferences.theme === theme ? "secondary" : "outline"} className="h-10 justify-start capitalize" onClick={() => update("theme", theme)}>
                      {theme === "dark" ? <Moon /> : <Sun />}{theme}
                      {preferences.theme === theme && <Check className="ml-auto" />}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div><p className="text-sm font-medium">Wrap long lines</p><p className="text-xs text-muted-foreground">Keep long lines within the editor.</p></div>
                  <Switch checked={preferences.wordWrap} onCheckedChange={(checked) => update("wordWrap", checked)} aria-label="Wrap long lines" />
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
                  <span>Font size <span className="text-muted-foreground">· {preferences.fontSize}px</span></span>
                  <Input type="range" min={12} max={20} step={1} value={preferences.fontSize} onChange={(event) => update("fontSize", Number(event.target.value))} className="h-8 px-0 accent-primary" aria-label="Editor font size" />
                </label>
                <label className="block space-y-2 text-sm">
                  <span>Auto-save delay</span>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={preferences.autoSaveDelay} onChange={(event) => update("autoSaveDelay", Number(event.target.value))} aria-label="Auto-save delay">
                    <option value={300}>300 ms</option><option value={700}>700 ms</option><option value={1200}>1.2 seconds</option><option value={2000}>2 seconds</option>
                  </select>
                </label>
              </section>
            )}
            {activeSection === "storage" && (
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium">Storage & sync</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Your workspace is stored on this device.</p>
                </div>
                <div className="flex items-start gap-3 border-y border-border py-4">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary" />
                  <div><p className="text-sm font-medium">Local storage ready</p><p className="mt-1 text-xs text-muted-foreground">Documents are saved in this browser. Export a workspace backup to keep a portable copy.</p></div>
                </div>
                <p className="text-xs text-muted-foreground">No account or cloud sync is active.</p>
              </section>
            )}
            {activeSection === "ai" && (
              <section className="space-y-5">
                <div>
                  <h3 className="text-sm font-medium">Google Gemini</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Connect your Gemini account to stream answers from the Assistant.</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="gemini-api-key" className="text-xs font-medium">Gemini API key</label>
                  <Input
                    id="gemini-api-key"
                    ref={apiKeyInputRef}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Paste your API key"
                    aria-label="Gemini API key"
                    onChange={() => setKeyRequired(false)}
                  />
                  <p className="text-[11px] leading-5 text-muted-foreground">The key is held in memory for this browser session, sent directly to Google, and never saved with your workspace.</p>
                  {keyRequired && <p className="text-xs text-destructive" role="alert">Enter a Gemini API key to connect.</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={providerStatus === "connecting" || providerStatus === "testing"}
                    onClick={async () => {
                      const apiKey = apiKeyInputRef.current?.value.trim() ?? "";
                      if (!apiKey) {
                        setKeyRequired(true);
                        apiKeyInputRef.current?.focus();
                        return;
                      }
                      if (await onConnectGemini(apiKey) && apiKeyInputRef.current) apiKeyInputRef.current.value = "";
                    }}
                  >
                    {providerStatus === "connecting" ? <><LoaderCircle className="animate-spin" /> Connecting</> : "Connect & discover models"}
                  </Button>
                  <Button variant="outline" size="sm" disabled={providerStatus !== "connected"} onClick={onTestGemini}>
                    {providerStatus === "testing" ? <><LoaderCircle className="animate-spin" /> Testing</> : "Test connection"}
                  </Button>
                  {providerStatus !== "not-configured" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={providerStatus === "connecting" || providerStatus === "testing"}
                      onClick={() => {
                        if (apiKeyInputRef.current) apiKeyInputRef.current.value = "";
                        onDisconnectGemini();
                      }}
                    >Clear key</Button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs" role="status" aria-live="polite">
                  {providerStatus === "connected" ? <CircleCheck className="h-4 w-4 text-primary" /> : providerStatus === "failed" ? <CircleAlert className="h-4 w-4 text-destructive" /> : providerStatus === "connecting" || providerStatus === "testing" ? <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" /> : <span className="h-2 w-2 rounded-full bg-muted-foreground" />}
                  <span>{providerStatus === "connected" ? "Connected" : providerStatus === "failed" ? "Connection failed" : providerStatus === "connecting" ? "Connecting" : providerStatus === "testing" ? "Testing connection" : "Not configured"}</span>
                </div>

                <label className="block space-y-2 text-xs">
                  <span className="font-medium">Default model</span>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    value={preferences.aiModelId ?? ""}
                    onChange={(event) => onChange({ ...preferences, aiProviderId: "gemini", aiModelId: event.target.value || null })}
                    disabled={providerStatus !== "connected" || providerModels.length === 0}
                    aria-label="Default Gemini model"
                  >
                    <option value="" disabled>{providerModels.length ? "Select a model" : "Connect to discover models"}</option>
                    {providerModels.map((model) => <option key={model.id} value={model.id}>{model.displayName} · {model.id}</option>)}
                  </select>
                  {providerModels.length === 0 && providerStatus === "connected" && <span className="block text-[11px] text-muted-foreground">No text-generation models were returned for this key.</span>}
                </label>
              </section>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}