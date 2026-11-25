import { buildRetrievedContext, type BuiltContext } from "./contextBuilder";
import { retrieveChunks, type RetrieveOptions } from "./retriever";

export async function retrieveWorkspaceContext(
  workspaceId: string,
  query: string,
  options: RetrieveOptions = {},
): Promise<BuiltContext> {
  const sources = await retrieveChunks(workspaceId, query, options);
  return buildRetrievedContext(sources);
}
