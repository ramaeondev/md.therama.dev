import { describe, expect, it } from "vitest";

import { createStarterState } from "@/features/workspace/model";
import { getInitialSyncWorkspace } from "./initialSync";

describe("initial cloud sync workspace", () => {
  it("seeds the default Markdown workspace for a new account with no local or remote docs", () => {
    const empty = createStarterState();
    empty.workspaces = [{ id: "empty-workspace", name: "My workspace", createdAt: "2026-11-13" }];
    empty.folders = [];
    empty.documents = [];
    empty.activeWorkspaceId = "empty-workspace";
    empty.preferences.theme = "light";

    const seeded = getInitialSyncWorkspace(empty, 0, {});

    expect(seeded.documents.map((document) => document.title)).toContain("Welcome.md");
    expect(seeded.workspaces[0].id).toBe("workspace-starter");
    expect(seeded.preferences.theme).toBe("light");
  });

  it("keeps an intentionally empty workspace after previous sync history", () => {
    const empty = createStarterState();
    empty.documents = [];
    empty.folders = [];

    expect(
      getInitialSyncWorkspace(empty, 0, { "doc-welcome": { revision: 2, payloadHash: "deleted" } }),
    ).toBe(empty);
  });

  it("does not replace local or remote documents", () => {
    const local = createStarterState();
    const empty = { ...local, documents: [] };

    expect(getInitialSyncWorkspace(local, 0, {})).toBe(local);
    expect(getInitialSyncWorkspace(empty, 1, {})).toBe(empty);
  });
});
