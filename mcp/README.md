# Local Markdown MCP server

This MCP server gives local AI clients access to Markdown workspaces opened in
Markdown AI Workspace. It uses MCP stdio; it does not run an HTTP server or
connect to `api.therama.dev`.

The application stores Markdown files in the folder the user selects. A local
`.markdown-ai-workspace.json` file contains workspace and folder metadata plus
content hashes for safe updates. It does not contain document text, chat
history, provider credentials, or the local semantic index.

## Connect a workspace

1. Open the app and go to **Preferences → Storage**.
2. Choose **Connect local folder** and select an empty folder. The current
   browser workspace is copied into it; the IndexedDB copy is kept as a
   fallback. Existing folders created by the app can be reconnected.
3. Install the local server dependencies from the repository root:

   ```sh
   npm install --prefix mcp
   ```

4. Add the server to your MCP client configuration. Replace the repository and
   workspace folder paths with absolute paths on this computer:

   ```json
   {
     "mcpServers": {
       "markdown-workspace": {
         "command": "node",
         "args": [
           "/path/to/md.therama.dev/mcp/node_modules/tsx/dist/cli.mjs",
           "/path/to/md.therama.dev/mcp/src/index.ts"
         ],
         "env": {
           "MD_WORKSPACE_ROOT": "/path/to/your/Markdown-workspace",
           "MD_MCP_READ_ONLY": "true"
         }
       }
     }
   }
   ```

The MCP host starts the process over stdio. Keep `MD_MCP_READ_ONLY=true` for
read-only access. To allow document and folder creation, updates, and renames,
set it to `false` in that host's configuration and restart the MCP server.
There are no delete tools in this first version. Document updates require the
current content hash, which prevents a stale agent response from overwriting a
newer edit.

## Available MCP capabilities

### Tools

- `list_workspaces`
- `list_documents`
- `read_document`
- `search_documents`
- `create_document` (write mode)
- `update_document` (write mode, requires the hash from `read_document`)
- `rename_document` (write mode, requires the hash from `read_document`)
- `create_folder` (write mode)

### Resources

- `markdown://document/{documentId}` for each Markdown document

### Prompts

- `review-markdown`
- `draft-markdown-outline`

The MCP process can access only the root folder specified by
`MD_WORKSPACE_ROOT`. Provider API keys stay in the browser's separate local
credential storage and are never passed to this server.

## Development

```sh
npm --prefix mcp run typecheck
MD_WORKSPACE_ROOT="/path/to/connected/workspace" npm --prefix mcp start
```

Use the official MCP Inspector to explore tools, resources, and prompts locally.
