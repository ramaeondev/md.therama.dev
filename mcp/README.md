# Markdown AI Workspace MCP server

The MCP server is distributed as a standalone npm package so users do not need
to clone the Markdown AI Workspace UI repository. MCP clients launch it with
`npx -y @ramaeon/md-workspace-mcp@latest`; it runs locally and accesses only the
folder selected by `MD_WORKSPACE_ROOT`. Users do not install it globally or in
their Markdown workspace: `npx` downloads it to npm's local cache and launches
it when the MCP client needs it.

> **Release status:** Version `0.1.1` is published on npm. It has not yet been
> listed in the MCP Registry.

## What this MCP server lets you do

Connect the folder used by Markdown AI Workspace to Claude Desktop, Claude
Code, GitHub Copilot in VS Code or CLI, or Cursor. Then use that AI app to
search and read your Markdown notes, ask questions about them, or draft new
notes. If you enable
write mode, the AI app can also create, update, rename documents, and create
folders. The server does not provide an AI model; it gives your chosen AI app
tools to work with the local Markdown folder.

When the AI reads a document to answer you, the AI app may send that text to its
AI provider. The MCP server itself runs on your computer and does not upload
documents, contact the app backend, or receive the API keys stored in Markdown
AI Workspace.

## Launch command

The command your AI app uses to download and start the MCP server is:

```sh
npx -y @ramaeon/md-workspace-mcp@latest
```

Think of this as the AI app's instruction for starting the local helper. Add it
to the AI app's MCP settings below; the app then runs it in the background when
you connect. The `MD_WORKSPACE_ROOT` setting in the same configuration tells
the server which local folder to open. You do not install the package by hand
or place it in your Markdown folder. Node.js 20 or later must be available to
the app that launches it.

The folder you connect in the app must contain
`.markdown-ai-workspace.json` at its top level. The app creates this manifest
when you connect the computer folder. `MD_WORKSPACE_ROOT` must point to that
folder, not to a document file or to the manifest itself.

## Connect a workspace

1. In Markdown AI Workspace, open **Preferences → storage → Connect local
   folder** and select an empty folder. The app writes Markdown files and the
   `.markdown-ai-workspace.json` metadata manifest there. The browser copy is
   retained when switching storage modes.
2. In your MCP client's server settings, add a server named
   `markdown-workspace` using this configuration. Update `MD_WORKSPACE_ROOT`
   to the absolute path of the folder selected in the app.

The browser does not share a folder's full computer path with the app. Copy it
from your computer: on macOS, in Finder hold Option and right-click the folder,
then choose **Copy as Pathname**; on Windows, open the folder in File Explorer,
click the address bar, and copy the path. On Linux, use your file manager's
**Copy Location** option or the folder's properties. Paste that path as the
`MD_WORKSPACE_ROOT` value below. On macOS, the path looks like
`/Users/YourName/Documents/Markdown`. On Windows, it looks like
`C:\Users\YourName\Documents\Markdown`; in a JSON file, write each backslash
twice: `C:\\Users\\YourName\\Documents\\Markdown`.

```json
{
  "mcpServers": {
    "markdown-workspace": {
      "command": "npx",
      "args": ["-y", "@ramaeon/md-workspace-mcp@latest"],
      "env": {
        "MD_WORKSPACE_ROOT": "REPLACE_WITH_YOUR_COMPUTER_FOLDER_PATH",
        "MD_MCP_READ_ONLY": "true"
      }
    }
  }
}
```

On Windows, use `cmd /c` to launch `npx`. Keep the same `env` values and change
the command and arguments to:

```json
"command": "cmd",
"args": ["/c", "npx", "-y", "@ramaeon/md-workspace-mcp@latest"]
```

3. Save the MCP client configuration and restart or reload its connection.
   The first launch downloads the MCP package and its runtime dependencies;
   later launches reuse the cached package. Node.js 20 or later must be
   available on the same computer as the MCP client.

## Connect in Claude Desktop, Claude Code, VS Code, Copilot CLI, or Cursor

The server uses the local stdio transport supported by these clients. Add a
`markdown-workspace` entry to the settings for each app you want to use.
Replace `MD_WORKSPACE_ROOT` with the folder connected in the app. Keep the
folder and the MCP client on the same computer. The package is not installed in
the Markdown folder or globally; `npx` downloads it to npm's local cache and
starts it when needed.

### Claude Desktop

Claude Desktop's newer settings may not show the old **Developer → Edit
Config** menu. This npm server is not a Claude desktop extension bundle, so add
it to `claude_desktop_config.json` using the steps for your computer. Use the
JSON configuration above and replace `MD_WORKSPACE_ROOT` with your folder
path.

#### macOS

1. Quit Claude Desktop with **⌘Q**.
2. Open Finder, press **⌘⇧G**, enter
   `~/Library/Application Support/Claude/`, and press Return.
3. Open `claude_desktop_config.json`. If it does not exist, create it with
   TextEdit. Before saving, choose **Format → Make Plain Text** and use the
   exact `.json` filename.
4. Add the configuration above, save the file, then reopen Claude Desktop.

#### Windows

1. Quit Claude Desktop.
2. Open File Explorer, click its address bar, enter `%APPDATA%\Claude`, and
   press Enter.
3. Open `claude_desktop_config.json`. If it does not exist, create it with
   Notepad. In Save As, choose **All files** and use the exact
   `claude_desktop_config.json` filename so Windows does not add `.txt`.
4. Add the server configuration. Use a Windows path such as
   `C:\\Users\\YourName\\Documents\\Markdown` in the JSON file. For the
   command and arguments, use the Windows `cmd /c npx` form shown below the
   general config.
   Save the file and reopen Claude Desktop.

Some packaged Windows installations use a separate app data folder. If Claude
does not load the file from `%APPDATA%\Claude`, its install type may store the
configuration elsewhere.

This connects the local desktop app; Claude on the web uses remote connectors
and cannot start this local server.

### Cursor

In Cursor, open **Customize → MCPs**. Add the server to your personal
`~/.cursor/mcp.json` settings to use it across projects. You can also add it to
`.cursor/mcp.json` inside a project if you want the setting limited to that
project. Save the file and restart Cursor.

### GitHub Copilot in VS Code

These steps add the server to your personal VS Code settings so it is available
across your workspaces on this computer:

1. Open the Command Palette (`Ctrl+Shift+P` on Windows/Linux or `⌘⇧P` on Mac).
2. Choose **Chat: Open Customizations**, then **MCP Servers → Add Server (+)**
   in the **User** section.
3. Choose **Command (stdio)** and enter `markdown-workspace` as the server
   name. On macOS, use `npx` as the command, with `-y` and
   `@ramaeon/md-workspace-mcp@latest` as arguments. On Windows, use `cmd` as the
   command, with `/c`, `npx`, `-y`, and `@ramaeon/md-workspace-mcp@latest` as
   arguments.
4. Save it under **Global → Copilot Global**. In the server configuration, add
   the matching `env` value below to the `markdown-workspace` entry. Replace the
   sample path with the folder you connected in the app.

macOS:

```json
"env": {
  "MD_WORKSPACE_ROOT": "/Users/YourName/Documents/Markdown",
  "MD_MCP_READ_ONLY": "true"
}
```

Windows (in VS Code's environment-variable field, use one backslash):

```text
MD_WORKSPACE_ROOT=C:\Users\YourName\Documents\Markdown
MD_MCP_READ_ONLY=true
```

Save the configuration and start or restart the server in VS Code. You can check the connection by asking
Copilot to list the Markdown workspaces or read a document. The tools
`list_workspaces`, `list_documents`, and `read_document` should be available.

### Claude Code

Run the matching command once in Terminal (macOS) or PowerShell (Windows).
It saves the server in your user settings so it is available across projects.
Replace the example folder path with your connected folder's path.

macOS:

```sh
claude mcp add --scope user --transport stdio --env "MD_WORKSPACE_ROOT=/Users/YourName/Documents/Markdown" --env MD_MCP_READ_ONLY=true markdown-workspace -- npx -y @ramaeon/md-workspace-mcp@latest
```

Windows PowerShell:

```powershell
claude mcp add --scope user --transport stdio --env "MD_WORKSPACE_ROOT=C:\Users\YourName\Documents\Markdown" --env MD_MCP_READ_ONLY=true markdown-workspace -- cmd /c npx -y @ramaeon/md-workspace-mcp@latest
```

On Git Bash for Windows, prefix the command with `MSYS_NO_PATHCONV=1`. Check
the connection with `claude mcp get markdown-workspace` or `/mcp` in a Claude
Code session.

### GitHub Copilot CLI

Add the server to `~/.copilot/mcp-config.json` on macOS or
`%USERPROFILE%\.copilot\mcp-config.json` on Windows. Put the entry inside the
file's top-level `mcpServers` object and keep existing entries. Use the example
for your computer and replace the sample folder path.

macOS:

```json
"markdown-workspace": {
  "type": "local",
  "command": "npx",
  "args": ["-y", "@ramaeon/md-workspace-mcp@latest"],
  "env": {
    "MD_WORKSPACE_ROOT": "/Users/YourName/Documents/Markdown",
    "MD_MCP_READ_ONLY": "true"
  },
  "tools": ["*"]
}
```

Windows:

```json
"markdown-workspace": {
  "type": "local",
  "command": "cmd",
  "args": ["/c", "npx", "-y", "@ramaeon/md-workspace-mcp@latest"],
  "env": {
    "MD_WORKSPACE_ROOT": "C:\\Users\\YourName\\Documents\\Markdown",
    "MD_MCP_READ_ONLY": "true"
  },
  "tools": ["*"]
}
```

Save the file, restart Copilot CLI, then run `/mcp` and look for
`markdown-workspace`.

## Access modes

Read-only mode is the default. Keep `MD_MCP_READ_ONLY` set to `true` (or omit
it) for listing, searching, and reading documents. To allow document and
folder changes, set it to `false`, `0`, or `no` in the MCP client configuration
and restart the server. Write mode can create and update documents, rename
documents, and create folders. It has no delete tools.

Updates and renames require the content hash returned by `read_document`.
If the file changed after it was read, the server rejects the stale operation
so an older response cannot silently overwrite newer content.

## FAQs

### Do I install the server globally or in my Markdown folder?

Neither. `npx` downloads it to npm's local cache and launches it when the MCP
client connects. The MCP settings file is stored by the AI app and is separate
from your Markdown files.

### Why does the server need `MD_WORKSPACE_ROOT`?

The server needs to know which computer folder to open. `MD_WORKSPACE_ROOT` is
the setting name; its value is the full path to the folder you connected in
Markdown AI Workspace. Add the value in your AI app's MCP settings. The browser
does not share the computer path with the app, so copy it from Finder or File
Explorer as described above.

### How do I find my folder path?

On macOS, in Finder hold Option and right-click the folder, then choose **Copy
as Pathname**. On Windows, open the folder in File Explorer, click the address
bar, and copy the path. On Linux, use your file manager's **Copy Location**
option or the folder's properties. Paste the copied path as the
`MD_WORKSPACE_ROOT` value in the client settings.

### What happens when I connect it to Claude, Copilot, or Cursor?

That AI app can use the server's tools to find, search, and read documents in
the folder you connected. For example, you can ask it to find notes on a topic
and summarize them. The AI app uses its own model and account; MCP does not
connect the app's built-in assistant to a separate AI provider.

### Are my Markdown files uploaded?

The MCP process stays local and does not upload the files. When an AI app reads
a document to answer a request, it may send the document text to that app's AI
provider. Review the privacy settings for the AI service you use.

### Does the AI get permission to edit or delete my documents?

Read-only access is the default. When you set `MD_MCP_READ_ONLY` to `false`,
the server allows creating and updating documents, renaming them, and creating
folders. It does not provide delete tools. The AI app may also ask you before
using a tool.

### Does this work with Claude on the web or across devices?

This is a local server for Claude Desktop, VS Code, or Cursor running on the
same computer as the folder. Claude on the web needs a hosted remote server.
This MCP package does not sync files between computers.

### Can it use browser-only storage?

No. The server reads a computer folder, so first connect a folder in Markdown
AI Workspace under **Preferences → storage → Connect local folder**. Documents
saved only in browser storage are not visible to the MCP process.

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
locally. From the repository root, bump the package and lockfile to the next
patch version:

```sh
npm version patch --prefix mcp --no-git-tag-version
```

Then copy the new version into `mcp/src/index.ts` and both version fields in
`mcp/server.json` (`version` and `packages[0].version`). Commit and push the
changes to `main`, then run the workflow:

1. In GitHub, open **Actions → Publish MCP package → Run workflow**.
2. Select the `main` branch and enter the new version shown in `mcp/package.json`.
3. Start the workflow and wait for the checks and npm publish step to succeed.

The workflow runs only when manually dispatched from `main` and rejects a
version unless the input, package, lockfile, and Registry metadata all match.
Check the package page or run `npm view @ramaeon/md-workspace-mcp version` to
confirm the published version. The npm registry
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
