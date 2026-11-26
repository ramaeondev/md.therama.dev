# Markdown AI Workspace MCP server

The MCP server is distributed as a standalone npm package so users do not need
to clone the Markdown AI Workspace UI repository. The intended installation is
`npx -y @ramaeon/md-workspace-mcp`; it runs locally over stdio and accesses only
the folder selected by `MD_WORKSPACE_ROOT`.

> **Release status:** Version `0.1.0` is published on npm. It has not yet been
> listed in the MCP Registry.

## Connect a workspace

1. In Markdown AI Workspace, open **Preferences → storage → Connect local
   folder** and select an empty folder. The app writes Markdown files and the
   `.markdown-ai-workspace.json` metadata manifest there. The browser copy is
   retained when switching storage modes.
2. In your MCP client's server settings, add a server named
   `markdown-workspace` using this configuration. Update `MD_WORKSPACE_ROOT`
   to the absolute path of the folder selected in the app.

   ```json
   {
     "mcpServers": {
       "markdown-workspace": {
         "command": "npx",
         "args": ["-y", "@ramaeon/md-workspace-mcp@0.1.1"],
         "env": {
           "MD_WORKSPACE_ROOT": "/absolute/path/to/your/Markdown-folder",
           "MD_MCP_READ_ONLY": "true"
         }
       }
     }
   }
   ```

3. Save the MCP client configuration and restart or reload its connection.
   The first launch downloads the MCP package and its runtime dependencies;
   later launches run the installed cached package. Node.js 20 or later is
   required.

## Access modes

Read-only mode is the default. Keep `MD_MCP_READ_ONLY` set to `true` (or omit
it) for listing, searching, and reading documents. To allow document and
folder changes, set it to `false` in the MCP client configuration and restart
the server. Write mode can create and update documents, rename documents, and
create folders. It has no delete tools.

Updates and renames require the content hash returned by `read_document`.
If the file changed after it was read, the server rejects the stale operation
so an older response cannot silently overwrite newer content.

## Capabilities

### Tools

- `list_workspaces`
- `list_documents`
- `read_document`
- `search_documents`
- `create_document` (write mode)
- `update_document` (write mode)
- `rename_document` (write mode)
- `create_folder` (write mode)

### Resources

- `markdown://document/{documentId}` for each Markdown document

### Prompts

- `review-markdown`
- `draft-markdown-outline`
- `improve-clarity`
- `continue-draft`
- `outline-from-markdown`
- `proofread-markdown`
- `summarize-markdown`

Prompts are sent to the MCP client's selected model. The server does not call
an AI provider and does not receive provider API keys from the web app.

## Privacy and file access

The process runs on the user's computer. It does not expose an HTTP listener or
contact `api.therama.dev`. It can access only the folder configured through
`MD_WORKSPACE_ROOT`. The manifest contains workspace and folder metadata,
relative Markdown paths, and content hashes; it does not store document bodies,
chat history, credentials, or the browser's semantic index. Path traversal and
symlink escapes are rejected.

## Package release and discovery

The npm package is the installable artifact. Releases are published by the
GitHub Actions workflow at
`.github/workflows/publish-mcp.yml`; no npm token is stored in GitHub. The
workflow runs the MCP tests, typecheck, build, package-content check, then
publishes the package using npm Trusted Publishing (GitHub OIDC).

Configure npm Trusted Publishing for automated releases under the package's
**Settings → Trusted Publisher**:

- Provider: **GitHub Actions**
- GitHub organization: `ramaeondev`
- Repository: `md.therama.dev`
- Workflow filename: `publish-mcp.yml`
- Allow direct publishing with `npm publish`

The package name is `@ramaeon/md-workspace-mcp`, under npm user scope
`@ramaeon`. Configure its Trusted Publisher from that npm account.

After that one-time setup, publish new versions without running `npm publish`
locally:

1. Update the version in `mcp/package.json`, `mcp/package-lock.json`, and
   `mcp/server.json` (including its npm package entry).
2. Commit and push those changes to the `main` branch.
3. In GitHub, open **Actions → Publish MCP package → Run workflow**, select
   `main`, enter the matching version, and start the workflow.

The workflow runs only when manually dispatched from `main` and rejects a
version unless all package metadata fields match. The npm registry
stores the installable package; after it is published, submit the release to
the official MCP Registry for discovery. That registry stores metadata, not
the npm artifact. Source and issues remain in the [Markdown AI Workspace
GitHub repository](https://github.com/ramaeondev/md.therama.dev).

The registry metadata is prepared in `server.json`; its name matches the
`mcpName` field in `package.json` and uses the GitHub namespace
`io.github.ramaeondev/md-workspace`. After publishing the npm package, install
the official publisher and submit that metadata:

```sh
brew install mcp-publisher
cd mcp
mcp-publisher validate server.json
mcp-publisher login github
mcp-publisher publish server.json
```

The GitHub login must have permission to publish under the `ramaeondev`
namespace. See the [official Registry publishing guide](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx) for other publisher installation options.

## Maintainer development

These commands are for contributors to this repository; end users do not need
them.

```sh
npm install --prefix mcp
npm --prefix mcp run typecheck
npm --prefix mcp test
npm --prefix mcp run build
(cd mcp && npm pack --dry-run)
```

Run the built server directly with a folder containing
`.markdown-ai-workspace.json`:

```sh
MD_WORKSPACE_ROOT="/absolute/path/to/Markdown-folder" node mcp/dist/mcp/src/index.js
```
