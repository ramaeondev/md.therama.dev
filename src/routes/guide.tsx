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
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8" aria-label="Main navigation">
          <Link to="/about" className="flex items-center gap-3" aria-label="About Markdown AI Workspace">
            <img src="https://cdn.therama.dev/shared/favicon.ico" alt="" className="size-9 rounded-xl object-contain" width={36} height={36} />
            <span className="text-sm font-semibold tracking-tight sm:text-base">Product guide</span>
          </Link>
          <Button asChild size="sm" className="gap-2">
            <Link to="/workspace">Open workspace <ArrowRight /></Link>
          </Button>
        </nav>
      </header>

      <section className="border-b border-border bg-card/40 px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <Link to="/about" className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> About the app
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <ShieldCheck className="size-4" /> Documentation
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Features and setup guide</h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            Start writing without an account. Your workspace stays in browser storage unless you choose a computer folder. AI is optional and uses the provider and key you configure. The MCP server is an optional local bridge to your Markdown files.
          </p>
          <nav className="mt-7 flex flex-wrap gap-2" aria-label="Guide sections">
            <GuideJump href="#features">Features</GuideJump>
            <GuideJump href="#storage">Storage choices</GuideJump>
            <GuideJump href="#providers">AI providers</GuideJump>
            <GuideJump href="#mcp">MCP setup</GuideJump>
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
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></div>
                <h3 className="mt-4 text-sm font-semibold">{title}</h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <h3 className="text-sm font-semibold">Guided tour</h3>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              In the workspace, select the question-mark button to start or restart the interactive tour. It walks through workspace navigation, editing, AI, settings, storage, and MCP. Its completion flag is kept in browser local storage; no analytics or tour data is sent elsewhere.
            </p>
          </div>
        </div>
      </section>

      <section id="storage" className="scroll-mt-24 border-y border-border bg-card/40 px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Where your files live" title="Browser storage or a computer folder" />
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-border bg-background p-6">
              <div className="flex items-center gap-3"><DatabaseIcon /><h3 className="text-base font-semibold">Browser storage (default)</h3></div>
              <ol className="mt-5 space-y-3 text-xs leading-6 text-muted-foreground">
                <li><StepNumber number="1" /> Open the workspace; it is ready without sign-in or setup.</li>
                <li><StepNumber number="2" /> Documents, folders, workspaces, and conversation history are saved in this browser’s IndexedDB.</li>
                <li><StepNumber number="3" /> Export a workspace ZIP from the workspace menu to create a portable backup.</li>
              </ol>
              <p className="mt-5 rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">Browser storage belongs to this browser profile. Clearing site data or using another device does not carry it over.</p>
            </article>
            <article className="rounded-2xl border border-border bg-background p-6">
              <div className="flex items-center gap-3"><HardDrive className="size-5 text-primary" /><h3 className="text-base font-semibold">Computer folder (optional)</h3></div>
              <ol className="mt-5 space-y-3 text-xs leading-6 text-muted-foreground">
                <li><StepNumber number="1" /> Open <strong className="text-foreground">Preferences → storage</strong>.</li>
                <li><StepNumber number="2" /> Select <strong className="text-foreground">Connect local folder</strong>, grant access, and choose an empty folder.</li>
                <li><StepNumber number="3" /> The app writes Markdown files plus a <code>.markdown-ai-workspace.json</code> metadata manifest. The browser copy remains available as a fallback.</li>
                <li><StepNumber number="4" /> To switch back, choose <strong className="text-foreground">Use browser storage</strong>. Existing computer-folder files are kept.</li>
              </ol>
              <p className="mt-5 rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">Folder access uses the browser File System Access API and is available in supported desktop Chromium browsers. If the control is unavailable, continue using browser storage.</p>
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
                <li><StepNumber number="1" /> Open <strong className="text-foreground">Preferences → AI providers</strong>.</li>
                <li><StepNumber number="2" /> Choose OpenAI, Google Gemini, or add an OpenAI-compatible provider.</li>
                <li><StepNumber number="3" /> Enter your key, connect, then choose and test a model.</li>
                <li><StepNumber number="4" /> Use the assistant or editor tools. Disconnect the provider in Preferences whenever you like.</li>
              </ol>
            </div>
            <div className="space-y-4 text-xs leading-6 text-muted-foreground">
              <InfoLine title="Keys remain separate from documents" body="The browser stores provider credentials separately from workspace data. They are not included in Markdown files or workspace ZIP backups." />
              <InfoLine title="Requests go to the selected provider" body="When you send a prompt, the selected provider receives the prompt and any document context you chose. Workspace retrieval runs locally before relevant excerpts are sent." />
              <InfoLine title="Compatible relay is optional" body="Compatible endpoints can use direct browser requests or the app’s opt-in relay. The relay forwards your own key and request; it does not store or inject credentials." />
              <InfoLine title="Review usage locally" body="Preferences → AI usage shows local request status and duration, plus token counts when a provider reports them." />
            </div>
          </div>
        </div>
      </section>

      <section id="mcp" className="scroll-mt-24 border-y border-border bg-card/40 px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Model Context Protocol" title="Use your Markdown workspace from an MCP client" />
          <p className="mt-4 max-w-3xl text-xs leading-6 text-muted-foreground">
            MCP (Model Context Protocol) lets a compatible desktop AI client call tools, read resources, and use prompts. This server runs as a local Node.js process over standard input/output (stdio). It is not a hosted API and does not connect to the app backend.
          </p>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-border bg-background p-6">
              <h3 className="text-sm font-semibold">1. Prepare a folder</h3>
              <ol className="mt-4 space-y-3 text-xs leading-6 text-muted-foreground">
                <li><StepNumber number="1" /> Open the app and choose <strong className="text-foreground">Preferences → storage → Connect local folder</strong>.</li>
                <li><StepNumber number="2" /> Select an empty folder. The app copies its Markdown documents and writes the manifest.</li>
                <li><StepNumber number="3" /> Keep this folder on the computer where your MCP client runs. Reconnect access in the app if browser permission is later revoked.</li>
              </ol>
            </article>
            <article className="rounded-2xl border border-border bg-background p-6">
              <h3 className="text-sm font-semibold">2. Install the local MCP package</h3>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">From the repository root, install dependencies for the MCP package:</p>
              <CodeBlock>{"npm install --prefix mcp"}</CodeBlock>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">You need Node.js and a local clone of this repository. Keep that clone in place while your MCP client uses the configured paths.</p>
            </article>
          </div>

          <article className="mt-5 rounded-2xl border border-border bg-background p-6">
            <h3 className="text-sm font-semibold">3. Add the server to your MCP client</h3>
            <p className="mt-3 max-w-4xl text-xs leading-6 text-muted-foreground">
              In your client’s MCP server settings, add a server named <code>markdown-workspace</code>. Replace both example paths with absolute paths on your computer. The same command and environment variables apply to clients that accept a standard <code>mcpServers</code> configuration.
            </p>
            <CodeBlock>{`{
  "mcpServers": {
    "markdown-workspace": {
      "command": "node",
      "args": [
        "/absolute/path/to/md.therama.dev/mcp/node_modules/tsx/dist/cli.mjs",
        "/absolute/path/to/md.therama.dev/mcp/src/index.ts"
      ],
      "env": {
        "MD_WORKSPACE_ROOT": "/absolute/path/to/connected/Markdown-folder",
        "MD_MCP_READ_ONLY": "true"
      }
    }
  }
}`}</CodeBlock>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              Save the client configuration and restart or reload its MCP connection. A successful connection starts the local process and loads the chosen workspace manifest. The process logs to stderr; protocol messages use stdio.
            </p>
          </article>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-border bg-background p-6">
              <h3 className="text-sm font-semibold">Available tools</h3>
              <ul className="mt-4 space-y-3">
                {mcpTools.map(([name, description]) => <ToolLine key={name} name={name} description={description} />)}
              </ul>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">There are no delete tools. Paths are constrained to the configured folder; unsafe paths and symlinks that escape it are rejected.</p>
            </article>
            <article className="rounded-2xl border border-border bg-background p-6">
              <h3 className="text-sm font-semibold">Resources and prompts</h3>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">Each Markdown document is exposed as a <code>text/markdown</code> resource at <code>markdown://document/&#123;documentId&#125;</code>.</p>
              <p className="mt-4 text-xs font-medium text-foreground">Prompts</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {mcpPrompts.map((prompt) => <li key={prompt} className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="size-3.5 text-primary" /> <code>{prompt}</code></li>)}
              </ul>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">Prompts provide instructions to your MCP client’s chosen model; the server does not call an AI provider or receive the app’s BYOK credentials.</p>
            </article>
          </div>

          <article className="mt-5 rounded-2xl border border-primary/25 bg-primary/5 p-6">
            <h3 className="text-sm font-semibold">4. Enable writes only if you need them</h3>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              Leave <code>MD_MCP_READ_ONLY</code> set to <code>true</code> (or omit it) for list, search, and read access. To allow create, update, rename, and folder creation, set it to <code>false</code> in your MCP client configuration, then restart the connection. For updates and renames, the client must read the document first and pass the returned <code>contentHash</code>; if the file changed since that read, the write is rejected to prevent overwriting newer content.
            </p>
          </article>
        </div>
      </section>

      <section id="privacy" className="scroll-mt-24 px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Privacy boundaries" title="Know what stays local and what leaves" />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <InfoLine title="Markdown storage" body="There is no sign-in, document database, or cloud sync. Documents stay in browser IndexedDB or the computer folder you connect." />
            <InfoLine title="MCP access" body="The local MCP process can read or modify only the folder path in MD_WORKSPACE_ROOT. It does not contact the app API. Its manifest stores workspace metadata and hashes, not document text." />
            <InfoLine title="AI requests" body="AI is opt-in. Prompts and the context you select are sent to your selected provider. Local semantic search can download an embedding model, but it processes document text in the browser." />
            <InfoLine title="Credentials and telemetry" body="BYOK credentials are separate from workspace data, excluded from workspace backups, and are not passed to the MCP server. The app’s built-in tour has no Pendo integration or analytics beacon." />
          </div>
          <div className="mt-8 rounded-2xl border border-border bg-card p-6">
            <h3 className="text-sm font-semibold">Quick troubleshooting</h3>
            <ul className="mt-4 space-y-3 text-xs leading-6 text-muted-foreground">
              <li><strong className="text-foreground">No “Connect local folder” option:</strong> use a supported desktop Chromium browser. Browser storage continues to work without it.</li>
              <li><strong className="text-foreground">MCP cannot find the folder:</strong> check that MD_WORKSPACE_ROOT points to the folder containing <code>.markdown-ai-workspace.json</code>, and that the folder is accessible to the same computer account running the MCP client.</li>
              <li><strong className="text-foreground">The MCP client cannot start the process:</strong> verify Node.js, run <code>npm install --prefix mcp</code>, and check that both paths in the client configuration are absolute and correct.</li>
              <li><strong className="text-foreground">An update is rejected as stale:</strong> read the document again, review the latest contents, and retry with the newest content hash.</li>
              <li><strong className="text-foreground">Provider setup fails:</strong> check the key, endpoint, and selected model in Preferences → AI providers, then use the provider test control.</li>
            </ul>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="gap-2"><Link to="/workspace">Open your workspace <ArrowRight /></Link></Button>
            <Button asChild variant="outline"><a href="https://github.com/ramaeondev/markdown-meadow-workspace/blob/main/mcp/README.md" target="_blank" rel="noreferrer">MCP README <ArrowRight /></a></Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-7 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Markdown AI Workspace · local-first writing</span>
          <Link to="/about" className="inline-flex items-center gap-1.5 hover:text-foreground">About the app <ArrowRight className="size-3.5" /></Link>
        </div>
      </footer>
    </main>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p><h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2></div>;
}

function GuideJump({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">{children}</a>;
}

function StepNumber({ number }: { number: string }) {
  return <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{number}</span>;
}

function InfoLine({ title, body }: { title: string; body: string }) {
  return <article className="rounded-xl border border-border bg-card p-4"><h3 className="text-xs font-semibold">{title}</h3><p className="mt-1.5 text-xs leading-6 text-muted-foreground">{body}</p></article>;
}

function ToolLine({ name, description }: { name: string; description: string }) {
  return <li className="flex items-start gap-3 text-xs leading-5"><code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-primary">{name}</code><span className="text-muted-foreground">{description}</span></li>;
}

function CodeBlock({ children }: { children: string }) {
  return <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-muted/50 p-4 text-[11px] leading-5"><code>{children}</code></pre>;
}

function DatabaseIcon() {
  return <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Database className="size-4" /></div>;
}
