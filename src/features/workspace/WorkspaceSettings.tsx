import { useState } from "react";
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
import type { WorkspacePreferences } from "./types";

type WorkspaceSettingsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: WorkspacePreferences;
  onChange: (preferences: WorkspacePreferences) => void;
};

export function WorkspaceSettings({ open, onOpenChange, preferences, onChange }: WorkspaceSettingsProps) {
  const [activeSection, setActiveSection] = useState<"general" | "editor" | "storage">("general");

  function update<Key extends keyof WorkspacePreferences>(key: Key, value: WorkspacePreferences[Key]) {
    onChange({ ...preferences, [key]: value });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-base"><MonitorCog className="h-4 w-4 text-primary" /> Preferences</DialogTitle>
          <DialogDescription>Appearance, editing, and local storage.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-[330px] grid-cols-[170px_1fr]">
          <nav className="border-r border-border p-3" aria-label="Settings sections">
            {(["general", "editor", "storage"] as const).map((section) => (
              <Button key={section} variant={activeSection === section ? "secondary" : "ghost"} className="mb-1 h-9 w-full justify-start text-xs capitalize" onClick={() => setActiveSection(section)}>
                {section}
              </Button>
            ))}
          </nav>
          <div className="space-y-6 p-6">
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}