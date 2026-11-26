import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "fake-indexeddb/auto";
import { deleteAppDatabase, resetAppDatabaseConnection } from "@/lib/indexedDb";
import { createStarterState } from "./model";
import { WorkspaceSettings, type WorkspaceSettingsProps } from "./WorkspaceSettings";

function props(overrides: Partial<WorkspaceSettingsProps> = {}): WorkspaceSettingsProps {
  const starter = createStarterState();
  return {
    open: true,
    onOpenChange: vi.fn(),
    preferences: starter.preferences,
    onChange: vi.fn(),
    initialSection: "general",
    workspaceId: starter.activeWorkspaceId,
    documents: starter.documents,
    connectedProviders: [],
    activeProviderId: null,
    customProviders: [],
    busyProviderId: null,
    statusByProvider: {},
    errorByProvider: {},
    onConnectProvider: vi.fn().mockResolvedValue(true),
    onTestProvider: vi.fn().mockResolvedValue(true),
    onDisconnectProvider: vi.fn(),
    onSelectProvider: vi.fn(),
    onSelectModel: vi.fn(),
    onAddCustomProvider: vi.fn().mockResolvedValue(true),
    onRemoveCustomProvider: vi.fn().mockResolvedValue(undefined),
    localFolderName: null,
    localFolderSupported: true,
    onConnectLocalFolder: vi.fn().mockResolvedValue(undefined),
    onDisconnectLocalFolder: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("workspace settings", () => {
  beforeEach(async () => {
    resetAppDatabaseConnection();
    await deleteAppDatabase();
  });

  it("changes the theme and wraps long lines through general preferences", async () => {
    const onChange = vi.fn();
    render(<WorkspaceSettings {...props({ onChange })} />);
    fireEvent.click(screen.getByRole("button", { name: "light" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ theme: "light" }));
    fireEvent.click(screen.getByRole("switch", { name: "Wrap long lines" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ wordWrap: false }));
  });

  it("changes font size and autosave delay in editor preferences", () => {
    const onChange = vi.fn();
    render(<WorkspaceSettings {...props({ onChange })} />);
    fireEvent.click(screen.getByRole("button", { name: /^editor$/ }));
    fireEvent.change(screen.getByRole("slider", { name: "Editor font size" }), {
      target: { value: "18" },
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fontSize: 18 }));
    fireEvent.change(screen.getByRole("combobox", { name: "Auto-save delay" }), {
      target: { value: "1200" },
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ autoSaveDelay: 1200 }));
  });

  it("explains browser-local storage, connects a computer folder, and switches back", async () => {
    const onConnectLocalFolder = vi.fn().mockResolvedValue(undefined);
    const onDisconnectLocalFolder = vi.fn().mockResolvedValue(undefined);
    const view = render(<WorkspaceSettings {...props({ onConnectLocalFolder, onDisconnectLocalFolder })} />);
    fireEvent.click(screen.getByRole("button", { name: /^storage$/ }));
    expect(screen.getByText(/Documents are saved in this browser/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect local folder" }));
    await waitFor(() => expect(onConnectLocalFolder).toHaveBeenCalledOnce());

    view.rerender(
      <WorkspaceSettings {...props({ localFolderName: "Notes on computer", onDisconnectLocalFolder })} />,
    );
    expect(screen.getByText(/saved as files in “Notes on computer”/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use browser storage" }));
    await waitFor(() => expect(onDisconnectLocalFolder).toHaveBeenCalledOnce());
    expect(view.container).toBeInTheDocument();
  });

  it("shows AI providers, workspace intelligence, usage and MCP setup sections", async () => {
    render(<WorkspaceSettings {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: /^AI providers$/ }));
    expect(screen.getByRole("region", { name: "AI provider settings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Workspace AI$/ }));
    expect(await screen.findByRole("region", { name: "Workspace intelligence" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^AI usage$/ }));
    expect(await screen.findByText("No AI requests yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^storage$/ }));
    expect(screen.getByRole("link", { name: "MCP setup guide" })).toHaveAttribute(
      "href",
      expect.stringContaining("/mcp/README.md"),
    );
  });
});
