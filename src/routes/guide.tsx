import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  ClipboardList,
  Database,
  FileText,
  FolderOpen,
  HardDrive,
  KeyRound,
  MessageSquareText,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { title: "Product guide — Markdown AI Workspace" },
      {
        name: "description",
        content:
          "Feature documentation and setup instructions for local storage, AI providers, workspace intelligence, and the Markdown MCP server.",
      },
    ],
  }),
  component: ProductGuidePage,
});

const applicationFeatures = [
  {
    icon: FileText,
    title: "Markdown writing",
    body: "Edit plain Markdown in CodeMirror and switch between editor, split, and rendered preview. Use formatting controls, GitHub-flavoured Markdown, Mermaid diagrams, document outline, word count, and character count.",
  },
  {
    icon: FolderOpen,
    title: "Workspaces and files",
    body: "Create multiple local workspaces, nested folders, and Markdown documents. Rename, duplicate, export, or delete files and folders. Search document titles and contents and reopen recent documents.",
  },
  {
    icon: Workflow,
    title: "Import and backup",
    body: "Import .md, .markdown, and .txt files from the picker or by dragging them into the workspace. Export a document or create and restore a workspace ZIP. Backups do not include provider keys, chat history, or the semantic index.",
  },
  {
    icon: KeyRound,
    title: "Bring your own AI provider",
    body: "Connect OpenAI, Google Gemini, or an OpenAI-compatible endpoint using your own key. Discover models, test the connection, select a model, and disconnect the provider from Preferences at any time.",
  },
  {
    icon: MessageSquareText,
    title: "Assistant and writing skills",
    body: "Chat with context from the current document, selected documents, or the workspace. Use built-in writing skills, inspect source references, and insert an answer only when you choose. Conversation history is stored locally.",
  },
  {
    icon: Sparkles,
    title: "Inline writing help",
    body: "Ask for a cursor-aware Markdown completion or request a rewrite of selected text. Review the proposed text before accepting it with Tab; press Escape to dismiss it.",
  },
  {
    icon: BrainCircuit,
    title: "Workspace intelligence",
    body: "Optionally build a semantic index in the browser for meaning-based retrieval. Follow indexing progress, retry or rebuild the index, pause indexing, or clear the index without deleting documents.",
  },
  {
    icon: ClipboardList,
    title: "Preferences and AI usage",
    body: "Choose a light or dark theme, editor font size, line wrapping, and autosave delay. Review local AI request status, duration, and reported token usage in AI Usage.",
  },
  {
    icon: Network,
    title: "Local MCP server",
    body: "Connect an MCP client to a folder of Markdown files through a local stdio process. Read access is enabled by default; document and folder edits require explicit write mode.",
  },
];

const mcpTools: Array<[string, string]> = [
  ["list_workspaces", "List workspace metadata in the selected folder."],
  ["list_documents", "List documents, optionally filtering by workspace or query."],
  ["read_document", "Read a document and return its content hash for safe later edits."],
  ["search_documents", "Search titles and text, returning local matches and short excerpts."],
  ["create_document", "Create a Markdown file when write mode is enabled."],
  ["update_document", "Replace document text using the latest content hash."],
  ["rename_document", "Rename a document using the latest content hash."],
  ["create_folder", "Create a nested folder when write mode is enabled."],
];

const mcpPrompts = [
  "review-markdown",
  "draft-markdown-outline",
  "improve-clarity",
  "continue-draft",
  "outline-from-markdown",
  "proofread-markdown",
  "summarize-markdown",
];

function ProductGuidePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur">
        <nav
          className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8"
          aria-label="Main navigation"
        >
          <Link
            to="/about"
            className="flex items-center gap-3"
            aria-label="About Markdown AI Workspace"
          >
            <img
              src="https://cdn.therama.dev/shared/favicon.ico"
              alt=""
              className="size-9 rounded-xl object-contain"
              width={36}
              height={36}
            />
            <span className="text-sm font-semibold tracking-tight sm:text-base">Product guide</span>
          </Link>
          <Button asChild size="sm" className="gap-2">
            <Link to="/workspace">
              Open workspace <ArrowRight />
            </Link>
          </Button>
        </nav>
      </header>

      <section className="border-b border-border bg-card/40 px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <Link
            to="/about"
            className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> About the app
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <ShieldCheck className="size-4" /> Documentation
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Features and setup guide
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            Start writing without an account. Your workspace stays in browser storage unless you
            choose a computer folder. AI is optional and uses the provider and key you configure.
            The MCP server is an optional local bridge to your Markdown files.
          </p>
          <nav className="mt-7 flex flex-wrap gap-2" aria-label="Guide sections">
            <GuideJump href="#features">Features</GuideJump>
            <GuideJump href="#storage">Storage choices</GuideJump>
            <GuideJump href="#providers">AI providers</GuideJump>
            <GuideJump href="#mcp">MCP setup</GuideJump>
            <GuideJump href="#mcp-faq">MCP FAQs</GuideJump>
            <GuideJump href="#privacy">Privacy and troubleshooting</GuideJump>
          </nav>
        </div>
      </section>

      <section id="features" className="scroll-mt-24 px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="What is included" title="Everyday writing tools" />
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {applicationFeatures.map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-4 text-sm font-semibold">{title}</h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <h3 className="text-sm font-semibold">Guided tour</h3>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              In the workspace, select the question-mark button to start or restart the interactive
              tour. It walks through workspace navigation, editing, AI, settings, storage, and MCP.
              Its completion flag is kept in browser local storage; no analytics or tour data is
              sent elsewhere.
            </p>
          </div>
        </div>
      </section>

      <section
        id="storage"
        className="scroll-mt-24 border-y border-border bg-card/40 px-5 py-14 sm:px-8 sm:py-20"
      >
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Where your files live"
            title="Browser storage or a computer folder"
          />
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-border bg-background p-6">
              <div className="flex items-center gap-3">
                <DatabaseIcon />
                <h3 className="text-base font-semibold">Browser storage (default)</h3>
              </div>
              <ol className="mt-5 space-y-3 text-xs leading-6 text-muted-foreground">
                <li>
                  <StepNumber number="1" /> Open the workspace; it is ready without sign-in or
                  setup.
                </li>
                <li>
                  <StepNumber number="2" /> Documents, folders, workspaces, and conversation history
                  are saved in this browser’s IndexedDB.
                </li>
                <li>
                  <StepNumber number="3" /> Export a workspace ZIP from the workspace menu to create
                  a portable backup.
                </li>
              </ol>
              <p className="mt-5 rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
                Browser storage belongs to this browser profile. Clearing site data or using another
                device does not carry it over.
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-background p-6">
              <div className="flex items-center gap-3">
                <HardDrive className="size-5 text-primary" />
                <h3 className="text-base font-semibold">Computer folder (optional)</h3>
              </div>
              <ol className="mt-5 space-y-3 text-xs leading-6 text-muted-foreground">
                <li>
                  <StepNumber number="1" /> Open{" "}
                  <strong className="text-foreground">Preferences → storage</strong>.
                </li>
                <li>
                  <StepNumber number="2" /> Select{" "}
                  <strong className="text-foreground">Connect local folder</strong>, grant access,
                  and choose an empty folder.
                </li>
                <li>
                  <StepNumber number="3" /> The app writes Markdown files plus a{" "}
                  <code>.markdown-ai-workspace.json</code> metadata manifest. The browser copy
                  remains available as a fallback.
                </li>
                <li>
                  <StepNumber number="4" /> To switch back, choose{" "}
                  <strong className="text-foreground">Use browser storage</strong>. Existing
                  computer-folder files are kept.
                </li>
              </ol>
              <p className="mt-5 rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
                Folder access uses the browser File System Access API and is available in supported
                desktop Chromium browsers. If the control is unavailable, continue using browser
                storage.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="providers" className="scroll-mt-24 px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Optional AI" title="Connect a provider with your own key" />
          <div className="mt-8 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="text-sm font-semibold">Connect or change a provider</h3>
              <ol className="mt-4 space-y-3 text-xs leading-6 text-muted-foreground">
                <li>
                  <StepNumber number="1" /> Open{" "}
                  <strong className="text-foreground">Preferences → AI providers</strong>.
                </li>
                <li>
                  <StepNumber number="2" /> Choose OpenAI, Google Gemini, or add an
                  OpenAI-compatible provider.
                </li>
                <li>
                  <StepNumber number="3" /> Enter your key, connect, then choose and test a model.
                </li>
                <li>
                  <StepNumber number="4" /> Use the assistant or editor tools. Disconnect the
                  provider in Preferences whenever you like.
                </li>
              </ol>
            </div>
            <div className="space-y-4 text-xs leading-6 text-muted-foreground">
              <InfoLine
                title="Keys remain separate from documents"
                body="The browser stores provider credentials separately from workspace data. They are not included in Markdown files or workspace ZIP backups."
              />
              <InfoLine
                title="Requests go to the selected provider"
                body="When you send a prompt, the selected provider receives the prompt and any document context you chose. Workspace retrieval runs locally before relevant excerpts are sent."
              />
              <InfoLine
                title="Compatible relay is optional"
                body="Compatible endpoints can use direct browser requests or the app’s opt-in relay. The relay forwards your own key and request; it does not store or inject credentials."
              />
              <InfoLine
                title="Review usage locally"
                body="Preferences → AI usage shows local request status and duration, plus token counts when a provider reports them."
              />
            </div>
          </div>
        </div>
      </section>

      <section
        id="mcp"
        className="scroll-mt-24 border-y border-border bg-card/40 px-5 py-14 sm:px-8 sm:py-20"
      >
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Model Context Protocol"
            title="Use your Markdown workspace from an MCP client"
          />
          <p className="mt-4 max-w-3xl text-xs leading-6 text-muted-foreground">
            MCP (Model Context Protocol) lets a compatible desktop AI client call tools, read
            resources, and use prompts. This server runs as a local Node.js process over standard
            input/output (stdio). It is not a hosted API and does not connect to the app backend.
          </p>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-border bg-background p-6">
              <h3 className="text-sm font-semibold">1. Connect a local folder in the app</h3>
              <ol className="mt-4 space-y-3 text-xs leading-6 text-muted-foreground">
                <li>
                  <StepNumber number="1" /> Open the app and choose{" "}
                  <strong className="text-foreground">
                    Preferences → storage → Connect local folder
                  </strong>
                  .
                </li>
                <li>
                  <StepNumber number="2" /> Select a folder and grant browser access. The app writes
                  your Markdown documents and a workspace manifest there.
                </li>
                <li>
                  <StepNumber number="3" /> Keep the folder on the same computer as your MCP client.
                  The app's local-folder connection is the storage setup; the MCP client starts the
                  server process.
                </li>
              </ol>
              <p className="mt-4 rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
                The folder connected here contains <code>.markdown-ai-workspace.json</code> at its
                top level. In the MCP settings, use the folder path itself, not the path to an
                individual Markdown file.
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-background p-6">
              <h3 className="text-sm font-semibold">2. Use the published MCP server</h3>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                This is the small program that lets your AI app reach the Markdown folder. It is
                published on npm. You do not need to download a project folder or install the
                package yourself.
              </p>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                Your AI app starts it in the background when it connects. <code>npx</code> downloads
                the package to your computer's npm cache and starts it. Node.js 20 or later must be
                available on the same computer.
              </p>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                This is the command your AI app will run. The server also needs the folder path,
                which you add to the same settings in the next step.
              </p>
              <CodeBlock>{"npx -y @ramaeon/md-workspace-mcp@latest"}</CodeBlock>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                There is no separate install step. Adding this command to your AI app's MCP settings
                is how you connect it. The setting called <code>MD_WORKSPACE_ROOT</code> tells the
                server which folder to open.
              </p>
            </article>
          </div>

          <article className="mt-5 rounded-2xl border border-border bg-background p-6">
            <h3 className="text-sm font-semibold">3. Connect it to your AI app</h3>
            <p className="mt-3 max-w-4xl text-xs leading-6 text-muted-foreground">
              This same local MCP server works with Claude Desktop, Claude Code, GitHub Copilot in
              VS Code and its CLI, and Cursor. Choose the matching setup below. Keep the folder and
              the AI app on the same computer. The steps have two parts: tell the AI app how to
              start the server, then give it the location of your Markdown folder.
            </p>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <h4 className="text-xs font-semibold">Claude Desktop</h4>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Claude's current app does not show the old Developer → Edit Config menu in every
                  version. Add the server to Claude Desktop's configuration file using the Mac or
                  Windows steps below. Claude on the web cannot start this local server.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <h4 className="text-xs font-semibold">GitHub Copilot in VS Code</h4>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Follow the detailed VS Code walkthrough below. You will fill in VS Code's setup
                  fields; you do not need to paste the JSON example into VS Code.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <h4 className="text-xs font-semibold">Cursor</h4>
                <ol className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                  <li>1. Open Customize → MCPs in Cursor to open its MCP settings.</li>
                  <li>
                    2. Add the full server configuration below to the personal{" "}
                    <code>~/.cursor/mcp.json</code> file to use it in all your Cursor projects.
                  </li>
                  <li>3. Save the file and restart Cursor.</li>
                </ol>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  In Cursor, this settings file is separate from your Markdown folder. The package
                  itself is downloaded to npm's local cache by <code>npx</code>.
                </p>
              </div>
            </div>
            <div className="mt-5 rounded-2xl border border-border bg-background p-6">
              <h4 className="text-sm font-semibold">Claude Desktop setup by computer</h4>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                Claude Desktop does not offer the same add-server form as VS Code. For this npm
                server, open Claude's configuration file and add the JSON example below. The current{" "}
                <strong className="text-foreground">Manage Extensions</strong> screen is for Claude
                desktop extensions, which are packaged differently.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-4">
                  <h5 className="text-xs font-semibold">macOS</h5>
                  <ol className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                    <li>
                      1. Quit Claude Desktop with <code>⌘Q</code>.
                    </li>
                    <li>
                      2. Open Finder, press <code>⌘⇧G</code>, paste{" "}
                      <code>~/Library/Application Support/Claude/</code>, then press Return.
                    </li>
                    <li>
                      3. Open <code>claude_desktop_config.json</code>. If it is not there, create
                      that file with TextEdit. In TextEdit, choose Format → Make Plain Text before
                      saving it with the <code>.json</code> file extension.
                    </li>
                    <li>
                      4. Paste the JSON example below, replace the folder path, then save and reopen
                      Claude Desktop.
                    </li>
                  </ol>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <h5 className="text-xs font-semibold">Windows</h5>
                  <ol className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                    <li>1. Quit Claude Desktop.</li>
                    <li>
                      2. Open File Explorer, click the address bar, enter{" "}
                      <code>%APPDATA%\Claude</code>, then press Enter.
                    </li>
                    <li>
                      3. Open <code>claude_desktop_config.json</code>. If it is not there, create it
                      with Notepad. In Save As, choose{" "}
                      <strong className="text-foreground">All files</strong> and use the exact file
                      name <code>claude_desktop_config.json</code> so Windows does not add{" "}
                      <code>.txt</code>.
                    </li>
                    <li>
                      4. Paste the JSON example below. Replace the folder path with your copied
                      path, using forward slashes, then save and reopen Claude Desktop.
                    </li>
                  </ol>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    The standard Windows config folder is shown above. Some packaged installs use a
                    separate app data folder; if Claude does not load the configuration, its install
                    type may use a different location.
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-6 text-muted-foreground">
                If this is the first MCP server in the file, paste the full JSON example below. If
                the file already contains an <code>mcpServers</code> section, keep its existing
                entries and add <code>markdown-workspace</code> inside that section.
              </p>
            </div>
            <div className="mt-5 rounded-xl border border-border bg-card p-5">
              <h4 className="text-xs font-semibold">Find and copy your folder path</h4>
              <p className="mt-2 max-w-4xl text-xs leading-6 text-muted-foreground">
                The browser keeps the folder's full computer path private, so the app cannot fill
                this in for you. Copy the path from your computer and replace the example path in
                <code>MD_WORKSPACE_ROOT</code> below.
              </p>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Mac:</strong> In Finder, find the folder you
                  connected. Hold Option and right-click it, then choose{" "}
                  <strong className="text-foreground">Copy “[folder name]” as Pathname</strong>.
                  Paste that path between the quotes after <code>MD_WORKSPACE_ROOT</code>.
                </li>
                <li>
                  <strong className="text-foreground">Windows:</strong> In File Explorer, open the
                  connected folder, click the address bar, and copy the path shown there. A path
                  looks like <code>C:\Users\YourName\Documents\Markdown</code>. In a JSON config,
                  double each backslash, as shown in the Windows examples below.
                </li>
                <li>
                  <strong className="text-foreground">Linux:</strong> In your file manager, use Copy
                  Location or open the folder's properties to copy its full path.
                </li>
              </ul>
            </div>
            <p className="mt-4 max-w-4xl text-xs leading-6 text-muted-foreground">
              The first two JSON blocks are for Claude Desktop and Cursor. Copilot CLI has its own
              examples below. In each, <code>command</code> and <code>args</code> tell the AI app
              how to start the server. Replace only the example path after{" "}
              <code>MD_WORKSPACE_ROOT</code> with the path you copied. Keep{" "}
              <code>MD_MCP_READ_ONLY</code> set to <code>true</code> to allow reading and searching
              without changing files. If a settings file already contains an
              <code>mcpServers</code> section, keep its existing entries and add{" "}
              <code>markdown-workspace</code> inside it.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <h4 className="text-xs font-semibold">macOS JSON configuration</h4>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Use this version for Claude Desktop and Cursor on Mac. Replace the sample path
                  with the path you copied.
                </p>
                <CodeBlock>{`{
  "mcpServers": {
    "markdown-workspace": {
      "command": "npx",
      "args": ["-y", "@ramaeon/md-workspace-mcp@latest"],
      "env": {
        "MD_WORKSPACE_ROOT": "/Users/YourName/Documents/Markdown",
        "MD_MCP_READ_ONLY": "true"
      }
    }
  }
}`}</CodeBlock>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <h4 className="text-xs font-semibold">Windows JSON configuration</h4>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Use this version for Claude Desktop and Cursor on Windows. The <code>cmd /c</code>{" "}
                  wrapper lets the AI app start Windows' <code>npx</code> command correctly.
                </p>
                <CodeBlock>{`{
  "mcpServers": {
    "markdown-workspace": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@ramaeon/md-workspace-mcp@latest"],
      "env": {
        "MD_WORKSPACE_ROOT": "C:\\\\Users\\\\YourName\\\\Documents\\\\Markdown",
        "MD_MCP_READ_ONLY": "true"
      }
    }
  }
}`}</CodeBlock>
              </div>
            </div>
            <article className="mt-5 rounded-2xl border border-border bg-background p-6">
              <h4 className="text-sm font-semibold">Detailed setup: VS Code with Copilot</h4>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                Set this up in desktop VS Code on the same computer as your Markdown folder. The
                setup screen asks for the command and folder path separately, so you do not paste
                the JSON example into VS Code.
              </p>
              <ol className="mt-4 space-y-3 text-xs leading-6 text-muted-foreground">
                <li>
                  <StepNumber number="1" /> Open Copilot Chat. If VS Code asks which session target
                  to use, select <strong className="text-foreground">Copilot</strong>.
                </li>
                <li>
                  <StepNumber number="2" /> Open the Command Palette with <code>⌘⇧P</code> on Mac or{" "}
                  <code>Ctrl+Shift+P</code> on Windows. Type and select{" "}
                  <strong className="text-foreground">Chat: Open Customizations</strong>, then
                  select <strong className="text-foreground">MCP Servers</strong>.
                </li>
                <li>
                  <StepNumber number="3" /> Under <strong className="text-foreground">User</strong>,
                  choose <strong className="text-foreground">Add Server (+)</strong>. Select{" "}
                  <strong className="text-foreground">Command (stdio)</strong>.
                </li>
                <li>
                  <StepNumber number="4" /> Fill in the server details:
                  <ul className="ml-7 mt-2 list-disc space-y-1">
                    <li>
                      Name: <code>markdown-workspace</code>
                    </li>
                    <li>
                      On Mac, command: <code>npx</code>; arguments: <code>-y</code> and{" "}
                      <code>@ramaeon/md-workspace-mcp@latest</code>.
                    </li>
                    <li>
                      On Windows, command: <code>cmd</code>; arguments: <code>/c</code>,{" "}
                      <code>npx</code>, <code>-y</code>, and{" "}
                      <code>@ramaeon/md-workspace-mcp@latest</code>.
                    </li>
                    <li>
                      Add an environment variable named <code>MD_WORKSPACE_ROOT</code>; paste the
                      folder path you copied as its value. On Windows, use the normal path form{" "}
                      <code>C:\Users\YourName\Documents\Markdown</code>; this field is not JSON, so
                      do not double the backslashes.
                    </li>
                    <li>
                      Add an environment variable named <code>MD_MCP_READ_ONLY</code> and set its
                      value to <code>true</code>.
                    </li>
                  </ul>
                </li>
                <li>
                  <StepNumber number="5" /> Save to{" "}
                  <strong className="text-foreground">Global → Copilot Global</strong>. If VS Code
                  asks whether to trust or allow this local server, review the request and allow it
                  to connect.
                </li>
                <li>
                  <StepNumber number="6" /> In Copilot Chat, send the test request below. Check that
                  Copilot shows a tool call and returns workspace or document names from your
                  folder.
                </li>
              </ol>
              <CodeBlock>
                {
                  "Use the markdown-workspace tools to list my Markdown workspaces and documents. Do not create or change anything."
                }
              </CodeBlock>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                If the server is listed but no workspace appears, check that the path points to the
                folder containing <code>.markdown-ai-workspace.json</code>. If the server does not
                start, check the settings and make sure Node.js 20 or later is available to VS Code.
                VS Code starts the server when Copilot uses it; there is no separate start command
                to run in Terminal.
              </p>
            </article>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <article className="rounded-2xl border border-border bg-background p-6">
                <h4 className="text-sm font-semibold">Claude Code in Terminal</h4>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  Claude Code saves this server to your personal settings with the command below.
                  Open Terminal on the same computer as the Markdown folder. Replace the example
                  path, run the matching command once, then start a new Claude Code session.
                </p>
                <p className="mt-4 text-xs font-semibold">macOS</p>
                <CodeBlock>{`claude mcp add --scope user --transport stdio --env "MD_WORKSPACE_ROOT=/Users/YourName/Documents/Markdown" --env MD_MCP_READ_ONLY=true markdown-workspace -- npx -y @ramaeon/md-workspace-mcp@latest`}</CodeBlock>
                <p className="mt-4 text-xs font-semibold">Windows PowerShell</p>
                <CodeBlock>{`claude mcp add --scope user --transport stdio --env "MD_WORKSPACE_ROOT=C:\\Users\\YourName\\Documents\\Markdown" --env MD_MCP_READ_ONLY=true markdown-workspace -- cmd /c npx -y @ramaeon/md-workspace-mcp@latest`}</CodeBlock>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  If you use Git Bash on Windows, prefix the command with{" "}
                  <code>MSYS_NO_PATHCONV=1</code>. To check the connection, run{" "}
                  <code>claude mcp get markdown-workspace</code> or enter <code>/mcp</code> in a
                  Claude Code session.
                </p>
              </article>
              <article className="rounded-2xl border border-border bg-background p-6">
                <h4 className="text-sm font-semibold">GitHub Copilot CLI</h4>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  Copilot CLI saves its personal server settings in{" "}
                  <code>~/.copilot/mcp-config.json</code> on Mac or{" "}
                  <code>%USERPROFILE%\.copilot\mcp-config.json</code> on Windows. Add the matching
                  entry inside its top-level <code>mcpServers</code> section. Keep existing servers
                  in that section.
                </p>
                <p className="mt-4 text-xs font-semibold">macOS entry</p>
                <CodeBlock>{`"markdown-workspace": {
  "type": "local",
  "command": "npx",
  "args": ["-y", "@ramaeon/md-workspace-mcp@latest"],
  "env": {
    "MD_WORKSPACE_ROOT": "/Users/YourName/Documents/Markdown",
    "MD_MCP_READ_ONLY": "true"
  },
  "tools": ["*"]
}`}</CodeBlock>
                <p className="mt-4 text-xs font-semibold">Windows entry</p>
                <CodeBlock>{`"markdown-workspace": {
  "type": "local",
  "command": "cmd",
  "args": ["/c", "npx", "-y", "@ramaeon/md-workspace-mcp@latest"],
  "env": {
    "MD_WORKSPACE_ROOT": "C:\\\\Users\\\\YourName\\\\Documents\\\\Markdown",
    "MD_MCP_READ_ONLY": "true"
  },
  "tools": ["*"]
}`}</CodeBlock>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Save the file, restart Copilot CLI, then enter <code>/mcp</code> and check for{" "}
                  <code>markdown-workspace</code>.
                </p>
              </article>
            </div>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              Each AI app keeps its own MCP connection settings. The JSON examples are for Claude
              Desktop, Cursor, and Copilot CLI. Use the guided setup for Copilot Chat in VS Code.
            </p>
            <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <h4 className="text-xs font-semibold">What you can do after connecting</h4>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                In Claude, Copilot, or Cursor, ask things like “Find my notes about project planning
                and summarize the key decisions” or “Create a Markdown outline from my research
                notes.” The AI app uses the MCP tools to search and read the folder you connected.
                If you enable write mode, it can also create or update Markdown files. It uses that
                AI app's model and account; this does not connect the app's built-in assistant to
                the MCP server.
              </p>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                The MCP process stays on your computer, but when an AI reads a document to answer
                you, that text may be sent to the AI provider you chose, under that provider's
                privacy terms. The MCP server itself does not send documents to a server or use your
                provider API key.
              </p>
            </div>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              If the tools do not appear, check that the folder path is correct and points to the
              folder containing <code>.markdown-ai-workspace.json</code>.
            </p>
          </article>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-border bg-background p-6">
              <h3 className="text-sm font-semibold">Available tools</h3>
              <ul className="mt-4 space-y-3">
                {mcpTools.map(([name, description]) => (
                  <ToolLine key={name} name={name} description={description} />
                ))}
              </ul>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                There are no delete tools. Paths are constrained to the configured folder; unsafe
                paths and symlinks that escape it are rejected.
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-background p-6">
              <h3 className="text-sm font-semibold">Resources and prompts</h3>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                Each Markdown document is exposed as a <code>text/markdown</code> resource at{" "}
                <code>markdown://document/&#123;documentId&#125;</code>.
              </p>
              <p className="mt-4 text-xs font-medium text-foreground">Prompts</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {mcpPrompts.map((prompt) => (
                  <li
                    key={prompt}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <Check className="size-3.5 text-primary" /> <code>{prompt}</code>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Prompts provide instructions to your MCP client’s chosen model; the server does not
                call an AI provider or receive the app’s BYOK credentials.
              </p>
            </article>
          </div>

          <article className="mt-5 rounded-2xl border border-primary/25 bg-primary/5 p-6">
            <h3 className="text-sm font-semibold">4. Enable writes only if you need them</h3>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              Leave <code>MD_MCP_READ_ONLY</code> set to <code>true</code> (or omit it) for list,
              search, and read access. To allow create, update, rename, and folder creation, set it
              to <code>false</code> (or <code>0</code> or <code>no</code>) in your MCP client
              configuration, then restart the connection. For updates and renames, the client must
              read the document first and pass the returned <code>contentHash</code>; if the file
              changed since that read, the write is rejected to prevent overwriting newer content.
            </p>
          </article>
        </div>
      </section>

      <section
        id="mcp-faq"
        className="scroll-mt-24 border-b border-border px-5 py-14 sm:px-8 sm:py-20"
      >
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="MCP help" title="Frequently asked questions" />
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            <McpFaq
              question="Do I install the MCP server globally or in my Markdown folder?"
              answer="Neither. The AI app runs npx with the published package name. npx downloads it to npm's local cache and starts it when the AI app connects. The MCP settings file belongs to the AI app; it is separate from your documents."
            />
            <McpFaq
              question="How do I find the folder path to paste into the settings?"
              answer="On Mac, in Finder hold Option and right-click the folder, then choose Copy as Pathname. On Windows, open the folder in File Explorer, click the address bar, and copy the path. On Linux, use Copy Location or the folder properties. Paste the copied path as the MD_WORKSPACE_ROOT value."
            />
            <McpFaq
              question="What does the launch command do?"
              answer="Your AI app runs npx -y @ramaeon/md-workspace-mcp@latest in the background when it connects. npx downloads or reuses the published package, then starts the local server. The MD_WORKSPACE_ROOT setting in the same AI app configuration tells it which folder to open. You do not need to install it yourself."
            />
            <McpFaq
              question="Does connecting MCP send my documents to Claude, Copilot, or Cursor?"
              answer="The MCP server itself runs locally and does not upload files. When the AI app reads a document to answer your request, the app may send that document text to its AI provider. Use the privacy and data controls for the AI service you chose."
            />
            <McpFaq
              question="Can I use this with Claude on the web?"
              answer="This package is a local server, so it works with Claude Desktop on the same computer. Claude on the web needs a hosted remote MCP server, which this package does not provide."
            />
            <McpFaq
              question="Can the AI change or delete my files?"
              answer="It starts in read-only mode. If you deliberately set MD_MCP_READ_ONLY to false, it can create, update, and rename Markdown documents and create folders. It has no delete tools."
            />
            <McpFaq
              question="Do I need to sign in or turn on cloud sync?"
              answer="No. MCP works with a local folder and does not use app sign-in or cloud sync. Browser-only storage cannot be reached by the MCP process; connect a computer folder in Preferences first."
            />
          </div>
        </div>
      </section>

      <section id="privacy" className="scroll-mt-24 px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Privacy boundaries"
            title="Know what stays local and what leaves"
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <InfoLine
              title="Markdown storage"
              body="There is no sign-in, document database, or cloud sync. Documents stay in browser IndexedDB or the computer folder you connect."
            />
            <InfoLine
              title="MCP access"
              body="The local MCP process can read or modify only the folder path in MD_WORKSPACE_ROOT. It does not contact the app API. Its manifest stores workspace metadata and hashes, not document text."
            />
            <InfoLine
              title="AI requests"
              body="AI is opt-in. Prompts and the context you select are sent to your selected provider. Local semantic search can download an embedding model, but it processes document text in the browser."
            />
            <InfoLine
              title="Credentials and telemetry"
              body="BYOK credentials are separate from workspace data, excluded from workspace backups, and are not passed to the MCP server. The app’s built-in tour has no Pendo integration or analytics beacon."
            />
          </div>
          <div className="mt-8 rounded-2xl border border-border bg-card p-6">
            <h3 className="text-sm font-semibold">Quick troubleshooting</h3>
            <ul className="mt-4 space-y-3 text-xs leading-6 text-muted-foreground">
              <li>
                <strong className="text-foreground">No “Connect local folder” option:</strong> use a
                supported desktop Chromium browser. Browser storage continues to work without it.
              </li>
              <li>
                <strong className="text-foreground">MCP cannot find the folder:</strong> check that
                MD_WORKSPACE_ROOT points to the folder containing{" "}
                <code>.markdown-ai-workspace.json</code>, and that the folder is accessible to the
                same computer account running the MCP client.
              </li>
              <li>
                <strong className="text-foreground">
                  The MCP client cannot start the process:
                </strong>{" "}
                verify Node.js 20 or later and that the package has been publicly released. If the
                client cannot find <code>npx</code>, configure its absolute executable path and
                restart it.
              </li>
              <li>
                <strong className="text-foreground">An update is rejected as stale:</strong> read
                the document again, review the latest contents, and retry with the newest content
                hash.
              </li>
              <li>
                <strong className="text-foreground">Provider setup fails:</strong> check the key,
                endpoint, and selected model in Preferences → AI providers, then use the provider
                test control.
              </li>
            </ul>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="gap-2">
              <Link to="/workspace">
                Open your workspace <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a
                href="https://github.com/ramaeondev/md.therama.dev/blob/main/mcp/README.md"
                target="_blank"
                rel="noreferrer"
              >
                MCP README <ArrowRight />
              </a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-7 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Markdown AI Workspace · local-first writing</span>
          <Link to="/about" className="inline-flex items-center gap-1.5 hover:text-foreground">
            About the app <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </footer>
    </main>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
    </div>
  );
}

function GuideJump({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      {children}
    </a>
  );
}

function StepNumber({ number }: { number: string }) {
  return (
    <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
      {number}
    </span>
  );
}

function InfoLine({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-xs font-semibold">{title}</h3>
      <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{body}</p>
    </article>
  );
}

function ToolLine({ name, description }: { name: string; description: string }) {
  return (
    <li className="flex items-start gap-3 text-xs leading-5">
      <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-primary">{name}</code>
      <span className="text-muted-foreground">{description}</span>
    </li>
  );
}

function McpFaq({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer list-none text-xs font-semibold marker:hidden">
        <span className="mr-2 text-primary">+</span>
        {question}
      </summary>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">{answer}</p>
    </details>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-muted/50 p-4 text-[11px] leading-5">
      <code>{children}</code>
    </pre>
  );
}

function DatabaseIcon() {
  return (
    <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Database className="size-4" />
    </div>
  );
}
