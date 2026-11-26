import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { isReadOnly, WorkspaceRepository } from "./repository.js";

const root = process.env.MD_WORKSPACE_ROOT;
if (!root) {
  console.error("Set MD_WORKSPACE_ROOT to the local folder connected to Markdown AI Workspace.");
  process.exit(2);
}

const repository = new WorkspaceRepository(root);

function createServer() {
  const server = new McpServer({
    name: "markdown-ai-workspace",
    version: "0.1.0",
    description:
      "Local Markdown tools. Reads are enabled; writes require MD_MCP_READ_ONLY=false. Read documents before updating and use the returned content hash.",
  });

  server.registerTool(
    "list_workspaces",
    { description: "List workspaces available in the connected local Markdown folder." },
    async () => {
      const manifest = await repository.readManifest();
      return { content: [{ type: "text", text: JSON.stringify(manifest.workspaces, null, 2) }] };
    },
  );

  server.registerTool(
    "list_documents",
    {
      description: "List Markdown documents, optionally filtering by workspace and text query.",
      inputSchema: z.object({
        workspaceId: z.string().optional(),
        query: z.string().optional(),
      }),
    },
    async ({ workspaceId, query }) => ({
      content: [{ type: "text", text: JSON.stringify(await repository.listDocuments(workspaceId, query), null, 2) }],
    }),
  );

  server.registerTool(
    "read_document",
    {
      description: "Read one Markdown document by its document ID. Returns its content hash for safe updates.",
      inputSchema: z.object({ documentId: z.string() }),
    },
    async ({ documentId }) => {
      const { entry, content, hash } = await repository.readDocument(documentId);
      return {
        content: [
          { type: "text", text: JSON.stringify({ id: entry.id, title: entry.title, relativePath: entry.relativePath, contentHash: hash }) },
          { type: "text", text: content },
        ],
      };
    },
  );

  server.registerTool(
    "search_documents",
    {
      description: "Search document titles and Markdown text locally. Returns matching paths and short excerpts.",
      inputSchema: z.object({ query: z.string().min(1), workspaceId: z.string().optional() }),
    },
    async ({ query, workspaceId }) => {
      const matches = await repository.listDocuments(workspaceId, query);
      const result = [];
      const lowered = query.toLocaleLowerCase();
      for (const match of matches.slice(0, 20)) {
        const { content } = await repository.readDocument(match.id);
        const index = content.toLocaleLowerCase().indexOf(lowered);
        result.push({
          ...match,
          excerpt: index < 0 ? content.slice(0, 400) : content.slice(Math.max(0, index - 160), index + 400),
        });
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "create_document",
    {
      description: "Create a Markdown document in a workspace or folder. Requires write mode.",
      inputSchema: z.object({
        workspaceId: z.string(),
        folderId: z.string().nullable().default(null),
        title: z.string().min(1).max(180),
        content: z.string(),
      }),
    },
    async ({ workspaceId, folderId, title, content }) => {
      if (isReadOnly()) throw new Error("MCP write tools are disabled. Set MD_MCP_READ_ONLY=false to allow document edits.");
      const created = await repository.createDocument({ workspaceId, folderId, title, content });
      return { content: [{ type: "text", text: JSON.stringify(created, null, 2) }] };
    },
  );

  server.registerTool(
    "update_document",
    {
      description: "Replace document contents using the contentHash returned by read_document. Requires write mode.",
      inputSchema: z.object({ documentId: z.string(), expectedHash: z.string().length(64), content: z.string() }),
    },
    async ({ documentId, expectedHash, content }) => {
      if (isReadOnly()) throw new Error("MCP write tools are disabled. Set MD_MCP_READ_ONLY=false to allow document edits.");
      return { content: [{ type: "text", text: JSON.stringify(await repository.updateDocument(documentId, expectedHash, content), null, 2) }] };
    },
  );

  server.registerTool(
    "rename_document",
    {
      description: "Rename a Markdown document without changing its contents. Requires write mode.",
      inputSchema: z.object({ documentId: z.string(), title: z.string().min(1).max(180), expectedHash: z.string().length(64) }),
    },
    async ({ documentId, title, expectedHash }) => {
      if (isReadOnly()) throw new Error("MCP write tools are disabled. Set MD_MCP_READ_ONLY=false to allow document edits.");
      return { content: [{ type: "text", text: JSON.stringify(await repository.renameDocument(documentId, title, expectedHash), null, 2) }] };
    },
  );

  server.registerTool(
    "create_folder",
    {
      description: "Create a nested folder in a workspace. Requires write mode.",
      inputSchema: z.object({ workspaceId: z.string(), parentId: z.string().nullable().default(null), name: z.string().min(1).max(120) }),
    },
    async ({ workspaceId, parentId, name }) => {
      if (isReadOnly()) throw new Error("MCP write tools are disabled. Set MD_MCP_READ_ONLY=false to allow document edits.");
      return { content: [{ type: "text", text: JSON.stringify(await repository.createFolder(workspaceId, parentId, name), null, 2) }] };
    },
  );

  server.registerResource(
    "markdown-document",
    new ResourceTemplate("markdown://document/{documentId}", {
      list: async () => ({
        resources: (await repository.listDocuments()).map((document) => ({
          uri: `markdown://document/${encodeURIComponent(document.id)}`,
          name: document.relativePath,
          title: document.title,
          mimeType: "text/markdown",
        })),
      }),
    }),
    { title: "Markdown document", description: "A Markdown document in the connected local workspace.", mimeType: "text/markdown" },
    async (uri, { documentId }) => {
      const { content } = await repository.readDocument(String(documentId));
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: content }] };
    },
  );

  server.registerPrompt(
    "review-markdown",
    {
      title: "Review Markdown",
      description: "Review a Markdown document for clarity, structure, completeness, and factual claims.",
      argsSchema: z.object({ markdown: z.string().describe("Markdown text to review"), focus: z.string().optional().describe("Optional review focus") }),
    },
    ({ markdown, focus }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Review this Markdown. Give concise, actionable suggestions and do not rewrite it unless asked.${focus ? ` Focus: ${focus}.` : ""}\n\n${markdown}`,
        },
      }],
    }),
  );

  server.registerPrompt(
    "draft-markdown-outline",
    {
      title: "Draft a Markdown outline",
      description: "Create a useful Markdown outline for a topic and audience.",
      argsSchema: z.object({ topic: z.string(), audience: z.string().optional(), documentType: z.string().optional() }),
    },
    ({ topic, audience, documentType }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Draft a clear Markdown outline about: ${topic}.${audience ? ` Intended audience: ${audience}.` : ""}${documentType ? ` Document type: ${documentType}.` : ""} Return Markdown only. Do not invent supporting facts or citations.`,
        },
      }],
    }),
  );

  return server;
}

await repository.initialize();
console.error(`Markdown MCP server connected to local workspace at ${repository.root}`);
console.error(`MCP write mode: ${isReadOnly() ? "disabled" : "enabled"}`);
serveStdio(createServer);
