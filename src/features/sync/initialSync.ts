import { createStarterState } from "@/features/workspace/model";
import type { WorkspaceState } from "@/features/workspace/types";
import type { AccountSyncState } from "./syncStorage";

export function getInitialSyncWorkspace(
  localState: WorkspaceState,
  remoteDocumentCount: number,
  previousSyncState: AccountSyncState,
): WorkspaceState {
  if (
    localState.documents.length > 0 ||
    remoteDocumentCount > 0 ||
    Object.keys(previousSyncState).length > 0
  )
    return localState;

  return { ...createStarterState(), preferences: localState.preferences };
}
