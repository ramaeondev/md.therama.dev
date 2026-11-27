# Markdown AI Workspace

A local-first Markdown workspace that runs entirely in the browser. Notes live in
IndexedDB or in a folder on your own disk; AI is optional and uses a key you supply.

No account, no backend database, no cloud sync.

- **Workspaces, folders, documents** — nested trees, tabs, autosave, search, recents.
- **Markdown editing** — CodeMirror 6 with editor/split/preview, formatting toolbar,
  outline, Mermaid diagrams, word and character counts.
- **Inline AI** — cursor-aware completions and selected-text rewrites, accepted with Tab.
- **Assistant** — streaming chat with no context, the active document, or the whole
  workspace via a local semantic index; insert replies into the document on demand.
- **Bring your own key** — Google Gemini, OpenAI, or any OpenAI-compatible endpoint,
  including local runtimes. Several can stay connected at once.
- **Two storage modes** — browser IndexedDB (default) or a real folder on disk via the
  File System Access API, with conflict detection against external edits.
- **MCP server** — an optional stdio process that exposes a connected folder to desktop
  AI clients as tools, resources, and prompts. Read-only by default.

Full feature reference: **[`docs/features.md`](docs/features.md)** — source-derived, with a
path as evidence for every claim and a section recording where older docs disagreed with
the code.

## Getting started

Requires Node.js 20 or newer.

```sh
git clone https://github.com/ramaeondev/md.therama.dev.git
cd md.therama.dev
npm install
npm run dev
```

Open the printed URL and choose **Open workspace**. A starter workspace with sample
documents is created on first run. No configuration is needed unless you want AI.

## Optional setup

**AI providers.** Open **Preferences → AI providers**, choose Gemini, OpenAI, or add an
OpenAI-compatible endpoint, then paste your own API key. The key is validated and the
model list is fetched before the provider becomes active. Keys are stored in IndexedDB
under `app-meta`, never in workspace state, exports, or logs.

**Computer-folder storage.** **Preferences → storage → Connect local folder**. The app
writes plain `.md` files plus a `.markdown-ai-workspace.json` manifest. Requires a
Chromium-based desktop browser.

**Workspace intelligence.** **Preferences → Workspace AI → Index workspace** downloads a
small local embedding model once and indexes your documents for meaning-based retrieval.
Runs in a Web Worker; documents never leave the browser for indexing.

**MCP clients.** Connect a local folder first, then point your AI client at
`npx -y @ramaeon/md-workspace-mcp` with `MD_WORKSPACE_ROOT` set to that folder. See the
in-app guide at `/guide` and [`mcp/README.md`](mcp/README.md).

## Scripts

| Command                 | What it does                                  |
| ----------------------- | --------------------------------------------- |
| `npm run dev`           | Vite dev server                               |
| `npm run build`         | Production build                              |
| `npm run preview`       | Preview the production build                  |
| `npm run lint`          | ESLint                                        |
| `npm run format`        | Prettier                                      |
| `npm test`              | Vitest unit and component tests               |
| `npm run test:e2e`      | Playwright end-to-end tests                   |
| `npm run test:mcp`      | MCP server tests                              |
| `npm run typecheck:e2e` | Type-check the Playwright suite               |
| `npm run test:all`      | Unit, MCP, e2e type-check, and e2e in one run |

## Architecture

Persistence, workspace state, Markdown editing, and presentation are separate feature
modules so they can evolve independently.

```
src/
  features/
    workspace/    types, state model, DocumentStorageAdapter (IndexedDB + local folder)
    editor/       CodeMirror editor and Markdown preview
    ai/
      providers/  provider contracts, registry, adapters, shared transport
      settings/   sessions, credential storage, custom provider definitions
      assistant/  chat transport, conversation store, writing skills
      embeddings/ local embedding model behind a worker
      rag/        chunking, indexing queue, retrieval, context building
      usage/      usage lifecycle, storage, dashboard
      server/     the opt-in compatible-provider relay
    tour/         guided tour
    open-source/  canonical repository and package metadata
  lib/            single owner of the IndexedDB connection
  routes/         /, /about, /guide, /workspace
mcp/              standalone stdio MCP server (own package)
```

Constraints worth knowing before changing things:

- One module owns the IndexedDB connection and its version history
  (`src/lib/indexedDb.ts`). Migrations are additive; no store is ever dropped or re-keyed.
- Provider keys live only in `providerCredentialStorage`. Adapters keep them in closures;
  they never enter workspace state or an adapter's own persistence.
- `src/features/ai/server/compatibleRelay.ts` is the only place a provider key may transit
  the server. It forwards the caller's own credentials, stores nothing, and re-validates
  the upstream target server-side.
- Token counts are recorded only when a provider reports them. Unreported usage is marked
  `unavailable` rather than estimated.

## Documentation

| Document                                                               | Contents                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`docs/features.md`](docs/features.md)                                 | Authoritative feature reference, persistence model, drift log |
| [`mcp/README.md`](mcp/README.md)                                       | MCP server usage and client configuration                     |
| [`docs/ai-provider-architecture.md`](docs/ai-provider-architecture.md) | Provider adapter design                                       |
| [`docs/workspace-intelligence.md`](docs/workspace-intelligence.md)     | Semantic index internals                                      |

`docs/features.md` supersedes older documents where they conflict.

## License

MIT. See [`LICENSE`](LICENSE).
