import { Github, GitFork, Package, Scale, Star, Terminal, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MCP_PACKAGE, REPOSITORY } from "./repository";

const highlights = [
  {
    title: "Read every line",
    body: "The editor, the AI provider adapters, and the MCP server all live in the same repository, so the behaviour you see is the code you can inspect.",
  },
  {
    title: "Run it yourself",
    body: "It is a standard Vite + React + TanStack app. Clone the repo, install, and start the dev server; there is no backend account to create.",
  },
  {
    title: "Fork the parts you want",
    body: "Storage adapters, providers, and UI modules are separate features. Take the editor, drop the AI layer, or swap in your own storage.",
  },
];

/**
 * Open-source showcase for the landing page: the repository, its licence, the
 * published MCP package, and what being open source actually means.
 */
export function OpenSourceSection() {
  return (
    <section
      id="open-source"
      className="scroll-mt-20 border-y border-border bg-card/50 px-5 py-20 sm:px-8 sm:py-24"
      aria-labelledby="open-source-heading"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
              <Github className="size-3.5" aria-hidden="true" /> Open source · {REPOSITORY.license}
            </div>
            <h2
              id="open-source-heading"
              className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Every line is public.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
              This is an open-source application, not a closed demo. The full source — editor,
              workspace storage, AI provider adapters, and the MCP server — is on GitHub under the{" "}
              {REPOSITORY.license} licence. Audit how your notes are handled, run it locally, or
              build your own version.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="gap-2">
                <a href={REPOSITORY.url} target="_blank" rel="noopener noreferrer">
                  <Star aria-hidden="true" />
                  Star on GitHub
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2">
                <a href={REPOSITORY.issuesUrl} target="_blank" rel="noopener noreferrer">
                  <TriangleAlert aria-hidden="true" />
                  Report an issue
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </Button>
            </div>

            <dl className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
              <div className="inline-flex items-center gap-1.5">
                <Github className="size-3.5" aria-hidden="true" />
                <dt className="sr-only">Repository</dt>
                <dd className="font-mono">{REPOSITORY.slug}</dd>
              </div>
              <div className="inline-flex items-center gap-1.5">
                <Scale className="size-3.5" aria-hidden="true" />
                <dt className="sr-only">Licence</dt>
                <dd>
                  <a
                    href={REPOSITORY.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground hover:underline"
                  >
                    {REPOSITORY.license} licensed
                  </a>
                </dd>
              </div>
              <div className="inline-flex items-center gap-1.5">
                <GitFork className="size-3.5" aria-hidden="true" />
                <dt className="sr-only">Forking</dt>
                <dd>Forks welcome</dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3">
            {highlights.map((highlight) => (
              <article
                key={highlight.title}
                className="rounded-xl border border-border bg-background p-5"
              >
                <h3 className="text-sm font-semibold">{highlight.title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{highlight.body}</p>
              </article>
            ))}
            <article className="rounded-xl border border-primary/25 bg-background p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Package className="size-3.5 text-primary" aria-hidden="true" /> MCP server on npm
                </div>
                <a
                  href={MCP_PACKAGE.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-primary hover:underline"
                >
                  {MCP_PACKAGE.name}
                  <span className="sr-only"> on npm (opens in a new tab)</span>
                </a>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                The local MCP bridge is published separately as{" "}
                <span className="font-mono">v{MCP_PACKAGE.version}</span>, so any MCP client can use
                it without cloning this repository.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/60 p-3 text-[11px] leading-5 text-muted-foreground">
                <code>{MCP_PACKAGE.installCommand}</code>
              </pre>
            </article>
            <div className="rounded-xl border border-border bg-background p-5">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Terminal className="size-3.5 text-primary" aria-hidden="true" /> Clone and run
              </div>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/60 p-3 text-[11px] leading-5 text-muted-foreground">
                <code>{`${REPOSITORY.cloneCommand}
cd ${REPOSITORY.name}
bun install
bun run dev`}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
