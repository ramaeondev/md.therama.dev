import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  FileText,
  Github,
  LockKeyhole,
  Monitor,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

import { theramaBrandLogoUrl } from "@/lib/brandAssets";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Markdown Workspace — Write privately, work your way" },
      {
        name: "description",
        content:
          "A private Markdown workspace that works without an account. Your notes stay on your device; encrypted sync is optional.",
      },
      { property: "og:title", content: "Markdown Workspace" },
      {
        property: "og:description",
        content: "Write Markdown locally. Add encrypted sync only when you want it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f8f6] text-[#17251f]">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <a href="#top" className="flex items-center gap-2.5" aria-label="Markdown Workspace home">
          <img
            src={theramaBrandLogoUrl}
            alt=""
            width={38}
            height={38}
            className="size-9 rounded-xl object-cover shadow-sm ring-1 ring-[#dce6df]"
          />
          <span className="text-[15px] font-semibold tracking-tight">
            markdown<span className="text-[#789286]">.</span>
          </span>
        </a>
        <nav
          className="hidden items-center gap-8 text-sm text-[#61736a] md:flex"
          aria-label="Main navigation"
        >
          <a className="transition-colors hover:text-[#173d31]" href="#how-it-works">
            How it works
          </a>
          <a className="transition-colors hover:text-[#173d31]" href="#privacy">
            Privacy
          </a>
          <a
            className="transition-colors hover:text-[#173d31]"
            href="https://github.com/ramaeondev/md.therama.dev"
            target="_blank"
            rel="noreferrer"
          >
            Open source
          </a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/login"
            className="rounded-full px-3 py-2 text-sm font-medium text-[#40554b] transition-colors hover:bg-white sm:px-4"
          >
            Sign in
          </Link>
          <Link
            to="/app"
            className="inline-flex items-center gap-2 rounded-full bg-[#173d31] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#235644] sm:px-5"
          >
            Try it <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <section
        id="top"
        className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 lg:px-12 lg:pb-28 lg:pt-24"
      >
        <div className="relative z-10 max-w-xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#dce6df] bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-[#456d5a] shadow-sm">
            <span className="size-1.5 rounded-full bg-[#62a77f]" />A calmer home for your Markdown
          </div>
          <h1 className="max-w-2xl text-[clamp(3.25rem,7.5vw,6.35rem)] font-semibold leading-[0.96] tracking-[-0.075em] text-[#173d31]">
            Your notes.
            <br />
            Your machine.
            <br />
            <span className="text-[#799588]">Your call.</span>
          </h1>
          <p className="mt-7 max-w-lg text-base leading-7 text-[#61736a] sm:text-lg sm:leading-8">
            A focused Markdown workspace that works right away, with no account required. Keep
            writing locally, then choose if and when to sync.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/app"
              className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-[#173d31] px-6 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(23,61,49,0.16)] transition-all hover:-translate-y-0.5 hover:bg-[#235644]"
            >
              Try it without signing in{" "}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/signup"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#d9e2dc] bg-white/70 px-6 text-sm font-semibold text-[#314b3e] transition-colors hover:bg-white"
            >
              Create an account
            </Link>
          </div>
          <p className="mt-4 text-xs text-[#829188]">
            No account needed to start. Sign in only when you want encrypted device sync.
          </p>
          <a
            href="#how-it-works"
            className="mt-12 inline-flex items-center gap-2 text-xs font-medium text-[#829188] hover:text-[#456d5a]"
          >
            See how it works <ArrowDownRight size={14} />
          </a>
        </div>

        <div className="relative mx-auto w-full max-w-[650px] lg:ml-auto">
          <div className="absolute -inset-8 rounded-[3rem] bg-[radial-gradient(ellipse_at_center,rgba(154,187,164,0.24),transparent_69%)] blur-2xl" />
          <div className="relative overflow-hidden rounded-[1.55rem] border border-[#d9e2dc] bg-white shadow-[0_30px_90px_-42px_rgba(32,64,49,0.34)]">
            <div className="flex h-12 items-center justify-between border-b border-[#edf0ed] px-4 sm:px-5">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#e6aaa0]" />
                <span className="size-2 rounded-full bg-[#e7ce8d]" />
                <span className="size-2 rounded-full bg-[#a8c4ac]" />
              </div>
              <div className="hidden items-center gap-1.5 rounded-md bg-[#f5f7f5] px-3 py-1.5 text-[10px] text-[#91a096] sm:flex">
                <LockKeyhole size={10} /> Stored on this device
              </div>
              <div className="size-5" />
            </div>
            <div className="grid min-h-[340px] grid-cols-[145px_1fr] sm:min-h-[405px] sm:grid-cols-[190px_1fr]">
              <aside className="border-r border-[#edf0ed] bg-[#fbfcfb] p-3 sm:p-4">
                <div className="mb-5 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#829188]">
                  <FileText size={13} /> My workspace
                </div>
                <div className="space-y-1 text-[11px] sm:text-xs">
                  <div className="flex items-center gap-2 rounded-lg bg-[#eaf1eb] px-2.5 py-2 font-medium text-[#28533e]">
                    <FileText size={13} /> Welcome.md
                  </div>
                  <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[#7e8c84]">
                    <span className="text-[#94ab9a]">▸</span> Projects
                  </div>
                  <div className="ml-4 flex items-center gap-2 rounded-lg px-2 py-2 text-[#849189]">
                    <FileText size={12} /> ideas.md
                  </div>
                  <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[#7e8c84]">
                    <span className="text-[#94ab9a]">▸</span> Journal
                  </div>
                </div>
                <div className="mt-10 rounded-lg border border-dashed border-[#dce6df] p-2.5 text-[10px] leading-4 text-[#91a096]">
                  Your files stay in this browser until you choose to sync.
                </div>
              </aside>
              <div className="grid grid-rows-[42px_1fr]">
                <div className="flex items-center border-b border-[#edf0ed] px-4 text-[11px] text-[#718279] sm:px-6">
                  <span className="border-b-2 border-[#4f8067] py-[13px] font-medium text-[#355743]">
                    Welcome.md
                  </span>
                </div>
                <div className="grid grid-cols-1 divide-[#edf0ed] md:grid-cols-2 md:divide-x">
                  <div className="p-5 font-mono text-[10px] leading-[2.05] text-[#7c8a81] sm:p-7 sm:text-[11px]">
                    <div>
                      <span className="mr-3 text-[#b7c2ba]">1</span>
                      <span className="text-[#4c765e]"># A space for your thoughts</span>
                    </div>
                    <div>
                      <span className="mr-3 text-[#b7c2ba]">2</span>
                    </div>
                    <div>
                      <span className="mr-3 text-[#b7c2ba]">3</span>Write in plain Markdown.
                    </div>
                    <div>
                      <span className="mr-3 text-[#b7c2ba]">4</span>Your notes live in this browser.
                    </div>
                    <div>
                      <span className="mr-3 text-[#b7c2ba]">5</span>
                    </div>
                    <div>
                      <span className="mr-3 text-[#b7c2ba]">6</span>
                      <span className="text-[#4c765e]">## Work at your pace</span>
                    </div>
                    <div>
                      <span className="mr-3 text-[#b7c2ba]">7</span>Import a file or begin from
                      scratch.
                    </div>
                    <div>
                      <span className="mr-3 text-[#b7c2ba]">8</span>
                      <span className="inline-block h-3 w-0.5 translate-y-0.5 bg-[#5a8b6d]" />
                    </div>
                  </div>
                  <div className="hidden p-7 md:block">
                    <div className="mb-5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#a0aaa3]">
                      Preview
                    </div>
                    <h2 className="mb-4 text-lg font-semibold tracking-tight text-[#244334]">
                      A space for your thoughts
                    </h2>
                    <p className="mb-4 text-[11px] leading-5 text-[#7a8980]">
                      Write in plain Markdown. Your notes live in this browser.
                    </p>
                    <h3 className="mb-2 text-sm font-semibold text-[#355743]">Work at your pace</h3>
                    <p className="text-[11px] leading-5 text-[#7a8980]">
                      Import a file or begin from scratch. Your workspace is ready when you are.
                    </p>
                    <div className="mt-7 flex items-center gap-2 rounded-lg bg-[#f5f8f5] p-3 text-[10px] text-[#7f9185]">
                      <LockKeyhole size={12} className="text-[#5c8d6c]" /> Local by default
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-[#edf0ed] bg-[#fcfdfc] px-4 py-2.5 text-[10px] text-[#8c9991] sm:px-5">
              <span className="inline-flex items-center gap-1.5">
                <Check size={12} className="text-[#58916b]" /> Saved locally
              </span>
              <span>Markdown · split preview</span>
            </div>
          </div>
          <div className="absolute -bottom-5 -left-2 hidden items-center gap-2 rounded-xl border border-[#dce6df] bg-white px-4 py-3 text-xs font-medium text-[#456d5a] shadow-lg sm:flex lg:-left-7">
            <LockKeyhole size={15} /> Your machine, your files
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-[#e5eae6] bg-white/75">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="mb-10 max-w-lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b8d78]">
              A simple way to work
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-[#173d31] sm:text-4xl">
              Start writing. Choose the rest later.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <FeatureCard
              icon={<Monitor size={18} />}
              number="01"
              title="Open and write"
              text="Try the editor immediately. No account, setup, or internet connection needed after the app loads."
            />
            <FeatureCard
              icon={<FileText size={18} />}
              number="02"
              title="Keep your Markdown"
              text="Organize notes in workspaces, preview as you write, and import or export Markdown files."
            />
            <FeatureCard
              icon={<LockKeyhole size={18} />}
              number="03"
              title="Encrypted sync, your choice"
              text="Sign in to sync Markdown across devices. Sync starts on by default and you can pause it anytime in Preferences."
            />
          </div>
        </div>
      </section>

      <section
        id="privacy"
        className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_0.8fr] lg:items-center lg:px-12 lg:py-24"
      >
        <div>
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-[#e8f0e9] text-[#4c765e]">
            <LockKeyhole size={19} />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b8d78]">
            Private by default
          </p>
          <h2 className="mt-3 max-w-lg text-3xl font-semibold leading-tight tracking-[-0.045em] text-[#173d31] sm:text-4xl">
            Your work belongs to you.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-[#68796f] sm:text-base">
            Use the workspace without an account. When signed in, only Markdown files are synced,
            encrypted on your device before they leave the browser. Sync starts on by default and
            can be paused anytime. Your AI provider keys stay on this device.
          </p>
          <div className="mt-6 space-y-3 text-sm text-[#52665a]">
            <PrivacyLine>Local editing works without signing in</PrivacyLine>
            <PrivacyLine>Only Markdown documents are eligible for sync</PrivacyLine>
            <PrivacyLine>AI provider credentials are never synced</PrivacyLine>
          </div>
        </div>
        <div className="rounded-2xl border border-[#dce6df] bg-white p-6 shadow-[0_20px_60px_-45px_rgba(32,64,49,0.3)] sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f0f5f0] text-[#4c765e]">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#244334]">Bring your own AI</h3>
              <p className="mt-2 text-sm leading-6 text-[#718279]">
                Connect a provider with your own key when you want help writing. The workspace keeps
                that credential on your device.
              </p>
            </div>
          </div>
          <a
            className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#37664b] hover:text-[#173d31]"
            href="https://github.com/ramaeondev/md.therama.dev"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={16} /> Explore the open-source project <ArrowRight size={14} />
          </a>
        </div>
      </section>

      <footer className="border-t border-[#e3e9e4] bg-[#f1f4f1]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-7 text-xs text-[#839087] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <div className="flex items-center gap-2">
            <img
              src={theramaBrandLogoUrl}
              alt=""
              width={18}
              height={18}
              className="size-[18px] rounded object-cover"
            />
            <span>Markdown Workspace</span>
            <span>·</span>
            <span>Open source, local first</span>
          </div>
          <div className="flex items-center gap-5">
            <Link className="hover:text-[#456d5a]" to="/login">
              Sign in
            </Link>
            <Link className="hover:text-[#456d5a]" to="/app">
              Try the workspace
            </Link>
            <a
              className="hover:text-[#456d5a]"
              href="https://github.com/ramaeondev/md.therama.dev"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  number,
  title,
  text,
}: {
  icon: ReactNode;
  number: string;
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-2xl border border-[#e2e9e3] bg-white p-6 sm:p-7">
      <div className="flex items-center justify-between text-[#668b72]">
        <span className="flex size-9 items-center justify-center rounded-xl bg-[#eff5ef]">
          {icon}
        </span>
        <span className="font-mono text-[10px] text-[#aab7ad]">{number}</span>
      </div>
      <h3 className="mt-6 text-base font-semibold text-[#244334]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#77867d]">{text}</p>
    </article>
  );
}

function PrivacyLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2">
      <Check size={15} className="shrink-0 text-[#5d9270]" />
      {children}
    </p>
  );
}
