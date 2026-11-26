import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowRight,
  BrainCircuit,
  Check,
  Code2,
  Database,
  FileText,
  FolderTree,
  Github,
  HardDrive,
  MessageSquareText,
  Network,
  Package,
  PanelRight,
  PenLine,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { OpenSourceBadge, StarOnGitHubButton } from "@/features/open-source/OpenSourceBadge";
import { OpenSourceSection } from "@/features/open-source/OpenSourceSection";
import { MCP_PACKAGE, REPOSITORY } from "@/features/open-source/repository";
import { SiteFooter } from "@/features/site-footer/SiteFooter";

const features = [
  {
    icon: PenLine,
    number: "01",
    title: "Write in plain Markdown",
    description:
      "A focused CodeMirror editor keeps your source readable while a live preview shows how the page will look.",
    details: [
      "Editor, split, and preview layouts",
      "Formatting for headings, lists, quotes, code, and tables",
      "GitHub-flavoured Markdown and Mermaid diagrams",
      "Document outline, word count, and character count",
    ],
  },
  {
    icon: FolderTree,
    number: "02",
    title: "Keep notes organized",
    description:
      "Separate projects into workspaces, then use nested folders and open tabs to keep related writing close at hand.",
    details: [
      "Create, rename, duplicate, and delete documents",
      "Create, rename, and delete nested folders",
      "Search documents and reopen recent files",
      "Search documents in the current workspace",
      "Autosave with a visible local save status",
    ],
  },
  {
    icon: ArrowDownToLine,
    number: "03",
    title: "Bring your files with you",
    description:
      "Start from the Markdown you already have and keep a portable copy whenever you need one.",
    details: [
      "Import .md, .markdown, and .txt files, including drag and drop",
      "Export any document as a Markdown file",
      "Export or restore a workspace ZIP with its folders and documents",
      "The archive does not include AI keys, chat history, or the local search index",
    ],
  },
  {
    icon: MessageSquareText,
    number: "04",
    title: "Add your own AI, when you want it",
    description:
      "The editor works without AI. Connect a provider with your own key to ask questions about a note or your workspace.",
    details: [
      "Built-in OpenAI and Google Gemini providers",
      "Add OpenAI-compatible services, including local endpoints",
      "Discover models, test connections, and choose a model",
      "Stream answers, keep local conversation history, and open cited sources",
      "Request cursor-aware Markdown completions; accept with Tab or dismiss with Escape",
      "Rewrite selected Markdown with a preview before accepting the replacement",
    ],
  },
  {
    icon: BrainCircuit,
    number: "05",
    title: "Search meaning across your notes",
    description:
      "Optional workspace intelligence builds a semantic index in your browser so AI questions can find relevant passages.",
    details: [
      "Generate embeddings locally with a browser worker",
      "Track indexing progress and retry or rebuild the index",
      "Review source documents and heading paths in answers",
      "Pause indexing or clear the index without deleting your notes",
    ],
  },
  {
    icon: SlidersHorizontal,
    number: "06",
    title: "Tune the workspace",
    description:
      "Adjust the writing surface to suit your preferences and see what your AI requests report back.",
    details: [
      "Dark or light theme, font size, and line wrapping",
      "Choose an autosave delay",
      "Review AI requests, status, duration, and provider-reported token use",
      "Token counts are marked unavailable when a provider does not return them",
    ],
  },
  {
    icon: Network,
    number: "07",
    title: "Connect local AI tools with MCP",
    description:
      "Point an MCP client at the same local folder to search, read, and optionally edit your Markdown files.",
    details: [
      "Runs as a local stdio process with no remote MCP endpoint",
      "Read tools and Markdown resources are available by default",
      "Document creation, updates, renames, and folders are opt-in",
      "Writes use content hashes to detect stale edits; delete tools are not included",
      "Markdown writing prompts are shared with the in-app writing skills",
    ],
  },
];

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Markdown AI Workspace" },
      {
        name: "description",
        content:
          "Explore the local Markdown editor, workspaces, import and export, optional BYOK AI, and browser-local privacy controls.",
      },
      { property: "og:title", content: "About — Markdown AI Workspace" },
      {
        property: "og:description",
        content: "A Markdown workspace that saves on your device and keeps AI optional.",
      },
    ],
  }),
  component: AboutPage,
});

export function AboutPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur">
        <nav
          className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8"
          aria-label="Main navigation"
        >
          <Link to="/about" className="flex min-w-0 items-center gap-3" aria-label="About Markdown AI Workspace">
            <img
              src="https://cdn.therama.dev/shared/favicon.ico"
              alt=""
              className="size-9 rounded-xl object-contain"
              width={36}
              height={36}
            />
            <span className="truncate text-sm font-semibold tracking-tight sm:text-base">
              Markdown AI Workspace
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <a
              href="#features"
              className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
            >
              Features
            </a>
            <a
              href={REPOSITORY.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
            >
              GitHub
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <Link
              to="/guide"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Documentation
            </Link>
            <Button asChild size="sm" className="gap-2">
              <Link to="/workspace">
                Open workspace <ArrowRight />
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      <section className="relative isolate overflow-hidden border-b border-border">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_18%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_52%)]"
        />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-32">
          <div className="max-w-2xl">
            <div className="mb-6 flex flex-wrap items-center gap-2 text-xs font-medium text-primary">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5">
                <ShieldCheck className="size-3.5" aria-hidden="true" /> Local-first. AI optional.
              </span>
              <a
                href={MCP_PACKAGE.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`${MCP_PACKAGE.name} on npm`}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 transition-colors hover:border-primary/45 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Package className="size-3.5" aria-hidden="true" /> MCP compatible
                <span className="sr-only">
                  — {MCP_PACKAGE.name} on npm, opens in a new tab
                </span>
              </a>
              <a
                href={REPOSITORY.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`${REPOSITORY.slug} on GitHub`}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 transition-colors hover:border-primary/45 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Github className="size-3.5" aria-hidden="true" /> Open source
                <span className="sr-only">
                  — repository on GitHub, opens in a new tab
                </span>
              </a>
            </div>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-6xl">
              Your notes stay <span className="text-primary">yours.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              A calm Markdown workspace for writing, organizing, and finding what matters. Your
              documents live in this browser. No account, no cloud sync, and no AI key required to
              get started.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/workspace">
                  Start writing <ArrowRight />
                </Link>
              </Button>
              <StarOnGitHubButton size="lg" />
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-primary" /> Works without sign-in</span>
              <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-primary" /> Markdown stays in this browser</span>
              <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-primary" /> Bring your own AI key</span>
            </div>
          </div>

          <WorkspacePreview />
        </div>
      </section>

      <section id="features" className="scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Made for your notes</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              A complete writing space, without the account layer.
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">
              Everything below is part of the current app. Use the editor on its own, or connect an
              AI provider for help with your writing.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article key={feature.number} className="group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/35">
                  <div className="flex items-center justify-between">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground/65">{feature.number}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
                  <ul className="mt-5 space-y-2.5 border-t border-border pt-4">
                    {feature.details.map((detail) => (
                      <li key={detail} className="flex gap-2.5 text-xs leading-5 text-muted-foreground">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="privacy" className="scroll-mt-20 border-y border-border bg-card/50 px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <div>
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HardDrive className="size-6" />
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Privacy by default</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Your browser is the workspace.
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
              By default, Markdown documents, folders, workspaces, and conversations are saved in
              browser storage on this device. You can optionally connect a local folder to keep
              Markdown documents as files that a local MCP server can access; a small metadata
              manifest accompanies those files. The app has no account system or document cloud
              sync. Export a workspace ZIP for a portable backup.
            </p>
          </div>

          <div className="space-y-3">
            <PrivacyStep
              icon={Database}
              title="Notes are stored locally"
              body="The app saves workspace data in IndexedDB in this browser. It does not upload or sync your Markdown documents by itself."
            />
            <PrivacyStep
              icon={Network}
              title="AI requests go to the provider you choose"
              body="When you send a message, your prompt and the context you selected can be sent to your connected provider. Workspace search runs locally first, then sends only relevant excerpts with your question."
            />
            <PrivacyStep
              icon={ShieldCheck}
              title="Your provider key is kept separately"
              body="Connected provider credentials are saved in separate browser storage so a refresh can keep the connection. They are not included in workspace exports or stored with your notes."
            />
            <PrivacyStep
              icon={Workflow}
              title="The compatible-provider relay is optional"
              body="Compatible providers can be configured for direct requests or to use the app relay. Relay requests pass through the app server; the relay forwards your credential and request without storing the key."
            />
            <PrivacyStep
              icon={Network}
              title="MCP stays on your device"
              body="The optional MCP server runs as a local process and reads the folder you configure. Its document tools do not contact the app API or upload Markdown."
            />
            <p className="px-1 pt-2 text-xs leading-5 text-muted-foreground">
              Local semantic search downloads its embedding model on first use. Your Markdown is
              processed in the browser; when you ask an AI question, selected excerpts leave the
              browser for the provider you chose.
            </p>
          </div>
        </div>
      </section>

      <OpenSourceSection />

      <section className="px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">A simple start</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Start local. Add AI only if it helps.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
              Open a workspace and write immediately. You can connect a provider later in
              Preferences, and you can export your Markdown whenever you choose.
            </p>
            <Button asChild className="mt-7 gap-2">
              <Link to="/workspace">
                Open your workspace <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ValueCard icon={FileText} title="No account" body="Open the app and start writing." />
            <ValueCard icon={Upload} title="Your files" body="Import Markdown or text from your device." />
            <ValueCard icon={Search} title="Useful context" body="Search one document or your indexed workspace." />
            <ValueCard icon={PanelRight} title="Your layout" body="Choose editor, preview, split view, and assistant panel." />
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function WorkspacePreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-5 -z-10 rounded-[2rem] bg-primary/10 blur-3xl" />
      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-black/10">
        <div className="flex h-11 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <img src="https://cdn.therama.dev/shared/favicon.ico" alt="" className="size-5" width={20} height={20} />
            <span className="text-xs font-medium">Research notes</span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" /> Saved locally
          </span>
        </div>
        <div className="grid min-h-[330px] grid-cols-[112px_1fr] sm:grid-cols-[140px_1fr]">
          <aside className="border-r border-border bg-muted/20 p-3">
            <div className="mb-4 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
              <FolderTree className="size-3.5" /> Workspace
            </div>
            <div className="space-y-2 text-[10px]">
              <div className="rounded-md bg-accent px-2 py-1.5 text-foreground">Ideas</div>
              <div className="truncate px-2 py-1 text-muted-foreground">├ Project brief.md</div>
              <div className="truncate px-2 py-1 text-muted-foreground">└ Reading list.md</div>
              <div className="mt-3 truncate px-2 py-1 text-muted-foreground">Meeting notes.md</div>
            </div>
          </aside>
          <div className="min-w-0 p-4 sm:p-6">
            <div className="mb-5 flex items-center gap-2 border-b border-border pb-3 text-[10px] text-muted-foreground">
              <Code2 className="size-3.5" /> Markdown <span className="ml-auto">Split view</span>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-3 font-mono text-[10px] leading-5 text-muted-foreground">
                <p><span className="text-primary">#</span> Field notes</p>
                <p><span className="text-primary">##</span> What stood out</p>
                <p className="text-foreground/80">A few useful ideas from today&apos;s reading.</p>
                <p><span className="text-primary">-</span> Keep the source close</p>
                <p><span className="text-primary">-</span> Write down the decision</p>
                <p><span className="text-primary">&gt;</span> Make the next step clear.</p>
              </div>
              <div className="border-t border-border pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                <h3 className="text-sm font-semibold">Field notes</h3>
                <h4 className="mt-4 border-b border-border pb-1 text-xs font-semibold">What stood out</h4>
                <p className="mt-2 text-[10px] leading-5 text-muted-foreground">A few useful ideas from today&apos;s reading.</p>
                <ul className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                  <li>• Keep the source close</li>
                  <li>• Write down the decision</li>
                </ul>
                <div className="mt-3 border-l-2 border-primary pl-2 text-[10px] text-muted-foreground">Make the next step clear.</div>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-[10px] text-muted-foreground">
              <Sparkles className="size-3.5 shrink-0 text-primary" />
              Ask your connected AI about this note or your workspace.
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs shadow-lg sm:flex">
        <Database className="size-4 text-primary" /> <span>Saved in this browser</span>
      </div>
    </div>
  );
}

function PrivacyStep({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Database;
  title: string;
  body: string;
}) {
  return (
    <article className="flex gap-4 rounded-xl border border-border bg-background p-4 sm:p-5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{body}</p>
      </div>
    </article>
  );
}

function ValueCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof FileText;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <Icon className="size-5 text-primary" />
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{body}</p>
    </article>
  );
}
