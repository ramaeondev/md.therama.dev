import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SettingsSection } from "@/features/workspace/WorkspaceSettings";

export type GuidedTourStep = {
  target: string;
  title: string;
  description: string;
  settingsSection?: SettingsSection;
  openAssistant?: boolean;
};

export const workspaceTourSteps: GuidedTourStep[] = [
  {
    target: "workspace-switcher",
    title: "Workspaces stay on this device",
    description:
      "Use the workspace menu to switch projects. Create separate workspaces for unrelated notes; there is no account or cloud workspace.",
  },
  {
    target: "explorer",
    title: "Organize your Markdown",
    description:
      "Search, open, duplicate, rename, and delete documents. Use New folder and New file to build a nested structure.",
  },
  {
    target: "editor",
    title: "Write and preview",
    description:
      "Edit plain Markdown here. In split mode the rendered preview updates alongside the source; the view controls can show either pane alone.",
  },
  {
    target: "writing-toolbar",
    title: "Format without leaving the editor",
    description:
      "Use the toolbar for Markdown formatting, switch editor/split/preview layouts, and open the document outline.",
  },
  {
    target: "inline-ai",
    title: "Ask for a completion or rewrite",
    description:
      "Connect your own AI provider first. Suggest adds ghost text at the cursor; Rewrite previews a selected passage. Tab accepts either suggestion and Escape dismisses it.",
  },
  {
    target: "assistant-panel",
    title: "Use the assistant and writing skills",
    description:
      "Ask about the active document or workspace, choose a built-in writing skill, inspect cited sources, and insert a completed answer into the document when you choose.",
    openAssistant: true,
  },
  {
    target: "import-export",
    title: "Move files in and out",
    description:
      "Import Markdown by file picker or drag and drop. Export one document or a workspace ZIP; backups do not include provider keys or chat history.",
  },
  {
    target: "preferences-button",
    title: "Tune the workspace",
    description:
      "Preferences contains appearance, editor, local storage, AI providers, workspace intelligence, and AI usage controls.",
  },
  {
    target: "settings-general",
    title: "Appearance",
    description:
      "Choose dark or light appearance. Preferences are shared by every workspace in this browser.",
    settingsSection: "general",
  },
  {
    target: "settings-editor",
    title: "Editor preferences",
    description: "Set the editor font size, wrapping, and autosave delay.",
    settingsSection: "editor",
  },
  {
    target: "settings-ai",
    title: "Connect your AI provider",
    description:
      "Add your own Gemini, OpenAI, or OpenAI-compatible provider key. Choose and test a model. Keys are stored separately on this device and never in workspace files.",
    settingsSection: "ai",
  },
  {
    target: "settings-intelligence",
    title: "Search by meaning",
    description:
      "Workspace Intelligence builds an optional semantic index in the browser, shows indexing progress, and lets you pause or clear the index.",
    settingsSection: "intelligence",
  },
  {
    target: "settings-usage",
    title: "Review AI usage",
    description:
      "See local request history, status, duration, and provider-reported token usage. Unreported usage stays marked unavailable.",
    settingsSection: "usage",
  },
  {
    target: "settings-storage",
    title: "Choose browser or computer-folder storage",
    description:
      "Browser storage uses this browser's IndexedDB. Connect a local folder to store Markdown files on your computer for MCP access. Switching back keeps the folder files and uses the browser copy.",
    settingsSection: "storage",
  },
  {
    target: "mcp-guide",
    title: "Connect a local MCP client",
    description:
      "The optional MCP server runs as a local process. It offers document tools, Markdown resources, and the same writing prompts. Reads are available by default; writes require an explicit client setting.",
    settingsSection: "storage",
  },
];

type GuidedTourProps = {
  open: boolean;
  onClose: () => void;
  onStepChange: (step: GuidedTourStep) => void;
  steps?: GuidedTourStep[];
};

export function GuidedTour({
  open,
  onClose,
  onStepChange,
  steps = workspaceTourSteps,
}: GuidedTourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[index];

  useEffect(() => {
    if (!open || !step) return;
    onStepChange(step);
    let frame = 0;
    const requestFrame = (callback: FrameRequestCallback) =>
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(callback)
        : window.setTimeout(() => callback(performance.now()), 0);
    const cancelFrame = (frameId: number) =>
      typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame(frameId)
        : window.clearTimeout(frameId);
    const first = requestFrame(() => {
      frame = requestFrame(() => {
        const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
        target?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        setRect(target?.getBoundingClientRect() ?? null);
      });
    });
    const update = () => {
      const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      setRect(target?.getBoundingClientRect() ?? null);
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelFrame(first);
      if (frame) cancelFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [index, onStepChange, open, step]);

  useEffect(() => {
    if (!open) setIndex(0);
  }, [open]);

  if (!open || !step) return null;

  function finish() {
    window.localStorage.setItem("markdown-ai-workspace-tour-complete", "true");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100]" data-testid="guided-tour">
      {rect && rect.width > 0 && rect.height > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-md border-2 border-primary shadow-[0_0_0_9999px_rgba(2,6,23,0.68)]"
          style={{
            left: Math.max(4, rect.left - 4),
            top: Math.max(4, rect.top - 4),
            width: Math.min(window.innerWidth - Math.max(4, rect.left - 4) - 4, rect.width + 8),
            height: Math.min(window.innerHeight - Math.max(4, rect.top - 4) - 4, rect.height + 8),
          }}
        />
      )}
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="fixed bottom-4 left-1/2 z-[101] w-[min(92vw,440px)] -translate-x-1/2 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xl"
        data-testid="tour-step"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
              Workspace tour · {index + 1} of {steps.length}
            </div>
            <h2 id="tour-title" className="mt-2 text-base font-semibold">
              {step.title}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-2 h-8 w-8"
            aria-label="Close tour"
            onClick={finish}
          >
            <X />
          </Button>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
        {!rect && (
          <p className="mt-2 text-xs text-muted-foreground">
            This control appears when its related panel is available.
          </p>
        )}
        <div className="mt-5 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={finish}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={index === 0}
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
            >
              <ArrowLeft /> Back
            </Button>
            {index === steps.length - 1 ? (
              <Button size="sm" onClick={finish}>
                Finish
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setIndex((current) => Math.min(steps.length - 1, current + 1))}
              >
                Next <ArrowRight />
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
