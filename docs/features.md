# Feature Reference

Authoritative description of what this application actually does, derived by reading
`src/`, `mcp/`, `e2e/`, and the build configuration. Where an older document or a piece
of in-app copy disagrees with the code, the code wins and the difference is recorded in
[Documentation drift](#7-documentation-drift).

Evidence for every claim is given as a repository path.

## Contents

1. [What the product is](#1-what-the-product-is)
2. [Feature map](#2-feature-map)
   - 2.1 [Workspaces](#21-workspaces)
   - 2.2 [Explorer](#22-explorer-left-panel)
   - 2.3 [Editor, preview, and the document surface](#23-editor-preview-and-the-document-surface)
   - 2.4 [Inline AI in the editor](#24-inline-ai-in-the-editor)
   - 2.5 [Assistant panel](#25-assistant-panel)
   - 2.6 [Writing skills](#26-writing-skills)
   - 2.7 [AI providers](#27-ai-providers-bring-your-own-key)
   - 2.8 [Credential persistence](#28-credential-persistence)
   - 2.9 [Compatible-provider relay](#29-compatible-provider-relay-opt-in)
   - 2.10 [Workspace intelligence](#210-workspace-intelligence-local-semantic-search)
   - 2.11 [AI usage tracking](#211-ai-usage-tracking)
   - 2.12 [Storage modes](#212-storage-modes)
   - 2.13 [Import and export](#213-import-and-export)
   - 2.14 [Preferences](#214-preferences)
   - 2.15 [Guided tour](#215-guided-tour)
   - 2.16 [MCP server](#216-mcp-server)
   - 2.17 [Server entry and error handling](#217-server-entry-and-error-handling)
3. [Persistence model](#3-persistence-model)
4. [Module boundaries](#4-module-boundaries)
5. [Test coverage](#5-test-coverage)
6. [Verification notes](#6-verification-notes)
7. [Documentation drift](#7-documentation-drift)
8. [Quick reference](#8-quick-reference)

---

## 1. What the product is

A local-first Markdown workspace that runs entirely in the browser, with three optional
add-ons: bring-your-own-key AI, a browser-local semantic index, and a standalone MCP
server that exposes a connected folder to desktop AI clients.

Four properties define the product:

1. **No account, no backend database, no cloud sync.** All persistence is IndexedDB on
   the origin, or a user-chosen operating-system folder.
2. **Markdown is the source of truth.** Documents are plain text; exports are `.md` and
   ZIP archives of `.md`.
3. **AI is optional and BYOK.** Nothing is sent anywhere until the user connects a
   provider with their own key.
4. **The server does one thing.** Server-side code exists only for SSR and for one
   opt-in relay route for OpenAI-compatible endpoints that block cross-origin calls.

`package.json`, `src/server.ts`, `src/routes/workspace.tsx`

### 1.1 Routes

| Route        | Component                                  | Purpose                                                                      |
| ------------ | ------------------------------------------ | ---------------------------------------------------------------------------- |
| `/`          | `AboutPage` (re-exported from `about.tsx`) | Landing page: feature tour, storage explanation, open-source section, footer |
| `/about`     | `AboutPage`                                | Same page, canonical URL                                                     |
| `/guide`     | `ProductGuidePage`                         | Documentation: features, storage choices, providers, MCP setup, privacy      |
| `/workspace` | `WorkspacePage`                            | The application itself                                                       |

`src/routes/index.tsx`, `src/routes/about.tsx`, `src/routes/guide.tsx`, `src/routes/workspace.tsx`

### 1.2 Technology

| Area              | Choice                                                                               |
| ----------------- | ------------------------------------------------------------------------------------ |
| Framework         | React 19, TanStack Router 1.170, TanStack Start 1.168 (SSR entry in `src/server.ts`) |
| Build             | Vite 8, Nitro server preset, Tailwind CSS 4                                          |
| UI                | shadcn/Radix primitives in `src/components/ui`, lucide icons, sonner toasts          |
| Editor            | CodeMirror 6 (markdown language, one-dark theme, history, line numbers)              |
| Rendering         | react-markdown + remark-gfm; Mermaid loaded lazily for diagrams                      |
| Markdown analysis | unified + remark-parse + remark-gfm producing mdast (RAG chunking)                   |
| Local model       | `@huggingface/transformers` 3.8.1 in a Web Worker                                    |
| Archive           | jszip                                                                                |
| Tests             | Vitest + Testing Library + fake-indexeddb; Playwright for e2e                        |
| MCP               | `@modelcontextprotocol/server` over stdio, zod schemas                               |

`package.json`, `mcp/package.json`

---

## 2. Feature map

| #    | Feature                                           | Lives in                                                                                   |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 2.1  | Workspaces                                        | `src/routes/workspace.tsx`, `src/features/workspace/model.ts`                              |
| 2.2  | Explorer (folders, documents, search, recents)    | `src/features/workspace/WorkspaceExplorer.tsx`                                             |
| 2.3  | Editor, preview, toolbar, outline, tabs, autosave | `src/features/editor/*`, `src/routes/workspace.tsx`                                        |
| 2.4  | Inline AI: suggest and rewrite                    | `src/features/editor/MarkdownEditor.tsx`, `src/features/ai/assistant/completionService.ts` |
| 2.5  | Assistant panel                                   | `src/features/ai/assistant/AssistantPanel.tsx`                                             |
| 2.6  | Writing skills                                    | `src/features/ai/assistant/writingSkills.ts`                                               |
| 2.7  | AI providers (Gemini, OpenAI, compatible)         | `src/features/ai/providers/*`, `src/features/ai/settings/*`                                |
| 2.8  | BYOK credential persistence                       | `src/features/ai/settings/providerCredentialStorage.ts`                                    |
| 2.9  | Compatible-provider relay                         | `src/features/ai/server/compatibleRelay.ts`, `src/server.ts`                               |
| 2.10 | Workspace intelligence (RAG)                      | `src/features/ai/rag/*`, `src/features/ai/embeddings/*`                                    |
| 2.11 | AI usage tracking and dashboard                   | `src/features/ai/usage/*`                                                                  |
| 2.12 | Storage modes (browser / local folder)            | `src/features/workspace/storage.ts`, `localFolderStorage.ts`                               |
| 2.13 | Import and export                                 | `src/routes/workspace.tsx`                                                                 |
| 2.14 | Preferences                                       | `src/features/workspace/WorkspaceSettings.tsx`                                             |
| 2.15 | Guided tour                                       | `src/features/tour/GuidedTour.tsx`                                                         |
| 2.16 | MCP server                                        | `mcp/src/index.ts`, `mcp/src/repository.ts`                                                |
| 2.17 | Server entry and error handling                   | `src/server.ts`, `src/lib/error-capture.ts`                                                |

---

## 2.1 Workspaces

- Several workspaces coexist in one browser and are switched from the header dropdown,
  which lists every workspace on the device and marks the active one.
- **Create workspace** opens a name prompt, switches to the new workspace, then seeds a
  `Notes` folder containing a `Welcome.md` document with a generated heading and
  one-paragraph intro.
- Switching workspaces resets the tab set to the first document of the target workspace
  and clears the active document when the workspace is empty.
- Workspaces are never renamed or deleted from the UI; only documents and folders are.

`src/routes/workspace.tsx` — `switchWorkspace`, `createWorkspace`, `commitCreateWorkspace`,
the `createdWorkspaceId` seeding effect; `src/features/workspace/model.ts` —
`createWorkspaceState`.

### Starter state

A first-time visitor is not shown an empty screen. `createStarterState()` builds:

- Workspace `My workspace` (`workspace-starter`).
- Folders `Guides`, `Guides/Getting started`, and a root-level `AI drafts`.
- Documents `Welcome.md` (root), `Project brief.md` (`Guides`), `Quick start.md`
  (`Guides/Getting started`), demonstrating headings, bold text, a blockquote, a bulleted
  list, a fenced code block, and a GFM table.
- Preferences: dark theme, 14 px editor text, wrapping on, 700 ms autosave, no provider.

`src/features/workspace/model.ts`

---

## 2.2 Explorer (left panel)

A resizable panel (15 %–28 % of width, default 19 %; the center panel defaults to 60 % and
has a 36 % minimum) containing the workspace tree.

**Structure**

- Header with the app mark, the words "Markdown" / "Local workspace", and a dot marking
  device-local storage.
- Workspace name plus **New folder** and **New file** buttons.
- Search box that filters on **document title and body text**, case-insensitively, and
  reports the number of matches. Folders with no matching descendants are hidden, so a
  search result set never shows an empty branch.
- A **Recent** section (up to 4 entries, drawn from a 10-item recent list) shown only
  when the search box is empty.
- A **Files** section header with the total document count for the workspace.
- Footer showing `LOCAL · <n> documents`.

**Folders**

- Arbitrary nesting, rendered recursively with chevrons and indentation.
- Per-folder actions on hover or keyboard focus: new file in folder, rename folder,
  delete folder.
- `AI drafts` starts collapsed; every other folder starts expanded.
- Deleting a folder collects the full descendant set, counts the documents inside, and
  shows a confirmation naming the folder and the document count before removing folders,
  documents, tab entries, and recent entries.

**Documents**

- Open on click; the active row is highlighted.
- Per-document actions on hover: duplicate (creates `… copy.md`), export as raw `.md`,
  rename (extension normalised to `.md`), delete (confirmed).

`src/features/workspace/WorkspaceExplorer.tsx`; delete logic in
`src/routes/workspace.tsx` — `deleteFolder`, `confirmDeleteFolder`,
`confirmDeleteDocument`, `handleExplorerAction`.

---

## 2.3 Editor, preview, and the document surface

### Editor

CodeMirror 6 with a markdown language mode, line numbers, active-line highlighting,
undo/redo history, the standard keymaps plus `indentWithTab`, configurable font size, and
optional line wrapping. The One Dark theme follows the `theme` preference and is swapped
through a CodeMirror `Compartment`, so toggling appearance re-themes the live view without
discarding undo history or cursor position.

`src/features/editor/MarkdownEditor.tsx`

### View modes

Three modes, chosen from the toolbar: **Editor**, **Split** (default), **Preview**. Split
places the editor and the rendered preview side by side with a border between them.
Preview mode hides the editor entirely, which also disables the inline-AI buttons.

`src/routes/workspace.tsx` — `mode`, view-toggle block.

### Preview

react-markdown with GFM, plus two customisations:

- Every heading receives a slugified `id` so the outline and citation jumps can target it.
- A fenced block whose class contains `language-mermaid` is rendered by a component that
  lazily imports Mermaid, initialises it with `securityLevel: "strict"` and the dark
  theme, renders SVG, and degrades to "Diagram could not be rendered." on failure.

`src/features/editor/MarkdownPreview.tsx` — `MarkdownPreview`, `MermaidBlock`,
`getMarkdownHeadings`.

### Formatting toolbar

Bold (`**…**`), italic (`_…_`), Heading 1 (`# `), Heading 2 (`## `), bulleted list
(`- `), numbered list (`1. `), quote (`> `), a fenced code block, and a table skeleton.
A wrapping format either wraps the selection or inserts a `text` placeholder between the
marks and selects it; a line-prefix format inserts the prefix at the cursor; the code-block
and table formats insert a fixed block.

`src/routes/workspace.tsx` — toolbar block; `MarkdownEditor.tsx` — `format`.

### Document outline

A togglable horizontal strip above the editor listing every `#`–`######` heading in the
buffer, each prefixed with its hash marks. Selecting one moves the editor cursor to the first
line matching that heading text and scrolls it into view; with no headings the strip says
"Add headings to navigate this document." Assistant citation jumps go through
`jumpToHeading(text, headingPath)` instead, which walks the heading stack so a repeated
heading resolves to the right section.

`src/routes/workspace.tsx` — `showOutline`; `MarkdownEditor.tsx` — `jumpToHeading`.

### Tabs

Open documents appear as tabs with a truncating title and a status dot that turns primary
while that document is saving. Each tab has a close button; closing the active tab
activates the last remaining tab. A **New file** button sits at the end of the tab strip.

`src/routes/workspace.tsx` — `openDocumentIds`, `closeTab`, `openDocument`.

### Status bar

Left: `Markdown`, then the document's uppercased extension. Right: word count, character
count, and `UTF-8`.

### Autosave

Every state change is persisted through the active storage adapter after a debounce equal
to `preferences.autoSaveDelay` (300 / 700 / 1200 / 2000 ms, default 700). The header
indicator shows `Saving`, `Saved locally`, or `Save failed`; a failure raises a toast,
using the adapter's own message when it is a local-folder conflict or permission error and
a generic message otherwise.

`src/routes/workspace.tsx` — save effect. The first post-hydration render is skipped so
loading a workspace does not immediately write it back.

### Empty state

When a workspace has no open document, the editor area offers **New file** and **Import**.

---

## 2.4 Inline AI in the editor

Two actions sit in the toolbar and share one request path.

### Suggest (cursor continuation)

- Shortcut `Mod-Shift-Space`, or the **Suggest** button.
- Requires a collapsed selection; with text selected the editor reports "Collapse the
  selection to request an inline completion."
- The suggestion is drawn as ghost text after the cursor with the hint
  "Tab to accept · Esc to dismiss".
- **Tab** inserts the text and moves the cursor to its end. **Escape** discards it. Any
  document change or selection change discards it automatically and aborts an in-flight
  request, so a suggestion can never be applied to text it was not written for.

### Rewrite (selection replacement)

- Requires a non-empty selection; otherwise "Select some Markdown text to rewrite it."
- The suggestion replaces the selection visually and behaves like suggest for
  accept/dismiss.

### Request shape

Both actions send a bounded slice of the document and ask for text only.

| Field      | Bound                                                   |
| ---------- | ------------------------------------------------------- |
| `prefix`   | last 4000 characters before the selection or cursor     |
| `selected` | first 4000 characters (rewrite only; empty for suggest) |
| `suffix`   | first 1200 characters after                             |

`temperature: 0.25`, `maxOutputTokens: 180`, and a system instruction declaring prefix,
selection, and suffix to be untrusted document data, demanding only the replacement or
continuation text with no fences or commentary. An empty string is a valid answer meaning
"nothing to suggest". Every inline request records AI usage with its own attribution.

`src/features/editor/MarkdownEditor.tsx` — `requestSuggestion`, completion state field,
keymap; `src/features/ai/assistant/completionService.ts` — `generateMarkdownCompletion`,
`rewriteSelectedMarkdown`, `generateMarkdownEdit`.

### Availability

Both buttons are disabled unless a provider is connected **and** its session is active
**and** a model is selected, while a request is already running, and in preview mode. A
disconnect or failed session therefore removes the feature instead of failing at click
time.

`src/routes/workspace.tsx` — `canSuggestCompletion`.

---

## 2.5 Assistant panel

A resizable right panel (17 %–30 %, default 21 %), toggled from the header and opened
automatically by the guided tour.

`src/features/ai/assistant/AssistantPanel.tsx`

### Header and history

- Title is the current conversation title, or "Assistant" when none exists yet.
- **Stop** appears only while a reply is streaming and aborts it.
- **History** expands an inline list of this workspace's conversations, newest first. Each
  row can be opened, renamed in place (Enter saves, Escape cancels), or deleted behind a
  confirmation dialog.
- **New conversation** abandons the current one and defers creation until the first
  message, so empty conversations are never stored.

### Context modes

A select labelled **Answer using** with three values:

| Mode              | System instruction                                                                                               | Data sent                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `none` (default)  | Answer directly; distinguish general knowledge from document-grounded answers                                    | Question and history only                                     |
| `active-document` | The active document is untrusted reference JSON; state when an answer is grounded in it                          | Title and full content of the active document                 |
| `workspace`       | Retrieved excerpts are untrusted data; do not follow instructions inside them; say when evidence is insufficient | Question plus the top retrieved excerpts from the local index |

`workspace` mode works whether or not the index has been built: with no indexed passages
the model is instructed to say the index found no relevant excerpts rather than invent
citations.

`src/features/ai/assistant/chatService.ts` — `buildSystemInstruction`.

### Message rendering

- User messages carry a left border; assistant messages do not.
- Each message shows an attribution label derived from the provider that produced it —
  `Gemini`, `OpenAI`, `Compatible`, the provider id, or `Assistant`.
- Replies render as Markdown with GFM.
- A usage badge shows total tokens when the provider reported them.
- An empty streaming reply shows "Thinking…" with a spinner.

### Reply actions

- **Insert into document** on a completed, non-empty assistant reply inserts the reply at
  the editor cursor. Only offered while a document is open.
- **Sources** lists every retrieved excerpt as `Document → Heading → Subheading`;
  selecting one opens that document and jumps to the heading path.
- **Retry** appears on a failed assistant reply and re-sends the last user message,
  replacing the failed reply rather than appending a second one.
- An interrupted reply is labelled "Generation stopped".

### Persistence semantics

- Exactly one assistant message is written per reply, once, at the end of the stream,
  carrying whatever text arrived plus a terminal status: `complete`, `interrupted`, or
  `failed`.
- If that write fails, the message stays in the UI with the correct status and attribution
  but is not stored.
- Provider and model are recorded **per assistant message**, taken from the adapter that
  actually served the request, so switching providers mid-conversation never mislabels
  history.
- The conversation title is adopted from the first user message (whitespace collapsed,
  cut at 80 characters, ellipsized past 48) and `updatedAt` is bumped.

`src/features/ai/assistant/conversationTypes.ts`, `conversationStore.ts`,
`conversationStorage.ts`.

### Composer

- Enter sends; Shift+Enter inserts a newline; in-progress IME composition is respected.
- The textarea is disabled while generating and when no model is selected.
- A status row shows a connection dot plus `Generating response`, the model id, "Select a
  model", or "No provider connected".
- With no provider or model, the empty state explains that the key stays on the device and
  offers **Configure providers** / **Choose model**, which opens Preferences on the AI
  section.

### Suggested prompts

Exactly five pills, one per writing skill. Selecting one fills the composer with
`<Label>: <instruction>` rather than sending immediately, so the user can edit or add
context first.

---

## 2.6 Writing skills

Five provider-neutral skills, defined once and shared by the assistant UI and the MCP
server.

| id                      | Label             | Instruction intent                                                                                             |
| ----------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `improve-clarity`       | Improve clarity   | Rewrite for clarity and flow; preserve meaning, facts, links, structure; return only the revised text          |
| `continue-draft`        | Continue draft    | Continue from the ending, match tone and structure, no repetition, no invented facts; return only the new text |
| `outline-from-markdown` | Create an outline | Concise nested outline for the topic and audience, no invented supporting facts                                |
| `proofread-markdown`    | Proofread         | Spelling, grammar, consistency; preserve meaning and formatting; corrected text then questions separately      |
| `summarize-markdown`    | Summarize         | Short accurate bullets, keep caveats, add nothing                                                              |

`buildWritingSkillPrompt(label, markdown)` wraps its input as explicit untrusted source
text; `promptForWritingSkill(label)` produces the composer string.

`src/features/ai/assistant/writingSkills.ts`

---

## 2.7 AI providers (bring your own key)

Three ways to reach a model, all driven by the user's own credential.

| Provider id                | Implementation                                  | Notes                                                                                           |
| -------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `gemini`                   | `src/features/ai/providers/gemini.ts`           | Key sent in `x-goog-api-key`; model list from the Gemini models endpoint                        |
| `openai`                   | `src/features/ai/providers/openai.ts`           | Key sent as `Authorization: Bearer`; Chat Completions                                           |
| `openai-compatible:<slug>` | `src/features/ai/providers/openaiCompatible.ts` | Any Chat Completions endpoint: OpenRouter, Groq, DeepSeek, Ollama, LM Studio, vLLM, and similar |

There is **no Anthropic adapter**, and only these three families exist. Registration is
explicit in `src/features/ai/providers/registry.ts`.

### Provider contract

`src/features/ai/providers/types.ts` defines an adapter as:

- `id`, `displayName`
- `initialize(apiKey) -> ProviderSession`, which keeps the key in a closure and never
  exposes it again
- the session exposes `testConnection()`, `listModels()`, `generateText()`,
  `streamText()`, and optionally `streamTextEvents()` when the provider can report usage
  while streaming
- `ProviderModel` carries `id`, `displayName`, and `capabilities`: `textGeneration` and
  `streaming`

Capabilities are **declared, not assumed**. The assistant only streams when the selected
model declares `streaming`, and the model list marks a model as chat only when the
provider both advertises text generation and the model id passes the catalogue filter.

### Model discovery is deliberately conservative

`src/features/ai/providers/shared/modelCatalog.ts` inspects the ids returned by `/models`:

- Known non-chat families are dropped (embeddings, whisper/audio, tts, image, moderation,
  rerank, and similar).
- Unrecognised ids are listed but **not** labelled chat-capable.
- No context-window size, price, or capability is invented for an unknown id.

`src/features/ai/providers/shared/openAiCompatible.ts` and `sseParser.ts` hold the shared
transport: request building, error mapping, and an incremental SSE parser that tolerates
chunk boundaries inside a JSON frame.

### Connection lifecycle

`src/features/ai/settings/providerConfiguration.ts`

Connecting runs a fixed sequence so a bad key cannot leave a half-connected provider:

1. Validate the key is non-empty.
2. Call `initialize(apiKey)` to build a session.
3. `testConnection()`.
4. `listModels()`.
5. Persist the credential record (see 2.8) and mark the provider connected.

Any failure aborts before persistence and surfaces a normalized message. Several
providers may be connected at once; exactly one is **active**, and switching provider or
model does not reload the page. Disconnecting the active provider promotes another
connected one when one is available.

### Custom compatible providers

`src/features/ai/settings/customProviderStorage.ts`

- Stored in IndexedDB `app-meta`, so a reload keeps the definition.
- Fields: display name, base URL, optional chat and models paths, and a `useRelay` flag.
- The id is a slug of the name with a numeric suffix on collision
  (`openai-compatible:openrouter`, then `-2`, `-3`).
- Removing a custom provider deletes its definition **and** any stored key.

### Error normalization

`src/features/ai/providers/errors.ts` maps HTTP status, provider error payloads, network
failures, and stream interruptions onto a fixed set of codes: `invalid_api_key`,
`quota_exceeded`, `rate_limited`, `network_error`, `unsupported_model`,
`context_length_exceeded`, `provider_unavailable`, `stream_interrupted`,
`invalid_request`, `unknown_provider`, and `unknown`, each with a stable user-facing
message. Provider response bodies and `Authorization` headers are never copied into a
message, log, or usage record. `isAbortError(error)` is the single test used to tell a
user stop apart from a failure.

### Endpoint safety

`src/features/ai/providers/shared/proxyProtocol.ts`

- Remote endpoints must be HTTPS.
- URLs with embedded username or password are rejected.
- Loopback and private hosts are rejected for relay use; loopback HTTP stays allowed for a
  direct browser call so local runtimes such as Ollama or LM Studio work.

---

## 2.8 Credential persistence

`src/features/ai/settings/providerCredentialStorage.ts`

| Property         | Behaviour                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Store            | IndexedDB `app-meta`, key `ai-provider-credentials`, one record per provider                         |
| Contents         | The key, the cached model list, and `connectedAt`                                                    |
| Reload           | Providers come back connected with **no network call**, using the cached models                      |
| Erasure          | Only **Clear key**, **Remove provider**, or disconnect-all deletes a record                          |
| Not erased by    | A failed **Test**, an offline reload, a transient provider error                                     |
| Never written to | workspace state, workspace exports, conversation records, usage records, custom provider definitions |
| Never present in | `localStorage`, `sessionStorage`, logs, analytics, error messages, URLs, request bodies              |

Keys live in the connecting password input only until the connect call resolves, then the
field is cleared. Sessions hold them in closures. In-flight requests belonging to a
disconnected provider are aborted.

---

## 2.9 Compatible-provider relay (opt-in)

Some OpenAI-compatible endpoints omit `Access-Control-Allow-Origin` on real responses, so a
browser cannot read them. The relay is the single server-side component that exists for
this, and it is off unless the user ticks **Send requests through this app's relay** for a
specific custom provider.

`src/features/ai/server/compatibleRelay.ts`, dispatched from `src/server.ts` before the
router for `GET` and `POST /api/compat/*`.

Guarantees, each enforced in code:

- **No credential storage.** The caller's own `Authorization` header is forwarded
  unchanged. The relay holds, injects, and logs no key.
- **Server-side target validation.** The upstream arrives in the `x-compat-upstream`
  header, never a query parameter, and is re-validated here because the route can be called
  directly. A browser-side check is convenience only.
- **Loopback and private hosts are always rejected** at the relay, since from a Worker they
  would address the deployment's own network.
- **Host re-check after joining** the base URL with the request path, to catch a crafted
  base that smuggles a different host.
- **Streaming preserved.** Request and response bodies are streamed, never read, buffered,
  or re-encoded, so SSE arrives incrementally and nothing is compressed twice.
- **Header hygiene.** Hop-by-hop headers, `cookie`, `origin`, `referer`,
  `accept-encoding`, `content-length`, `host`, and the upstream header are dropped on the
  way out; `set-cookie`, `content-encoding`, `content-length`, `transfer-encoding`, and all
  `access-control-*` headers are dropped on the way back; `cache-control: no-store` is set.
- **Status mapping.** `400` with a non-sensitive message for a missing or rejected
  upstream, `499` on client abort, and `502` when the upstream cannot be reached.

---

## 2.10 Workspace intelligence (local semantic search)

`src/features/ai/rag/*`, `src/features/ai/embeddings/*`

An opt-in, per-workspace index that lets the assistant answer from across the workspace. It
stays disabled until the user builds it in **Preferences -> Workspace AI**.

### Local embedding model

| Property      | Value                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------- |
| Model         | `onnx-community/all-MiniLM-L6-v2-ONNX`                                                      |
| Revision      | pinned to `aff7a1d`, so upstream weight changes cannot silently mix with existing vectors   |
| Dimensions    | 384                                                                                         |
| Runtime       | `@huggingface/transformers` 3.8.1 inside a dedicated Web Worker                             |
| Pooling       | mean, normalized; batches of 8                                                              |
| Fetch         | model assets download from Hugging Face on first use, then are browser-cached               |
| Data location | document text and vectors stay in IndexedDB; only retrieved excerpts ever leave the browser |

`src/features/ai/embeddings/local/localEmbedding.ts`, `embeddingWorker.ts`, and
`workerProtocol.ts`. Requests are serialized through a queue; an abort terminates the
worker and rejects all pending requests with a `cancelled` `EmbeddingError`. Progress
(`loading-model`, then `embedding` with `loaded` and `total`) is forwarded to the panel.

### Chunking

`src/features/ai/rag/markdownParser.ts`, `chunker.ts`, `contentHash.ts`

- Markdown is parsed to mdast with `remark-parse` and `remark-gfm`, and each block keeps its
  enclosing heading path (`H1 > H2 > ...`) plus its original source slice.
- Blocks are grouped by heading path until the group reaches about 160 estimated tokens,
  hard flushed at about 200, with about 32 tokens of overlap between consecutive chunks in
  the same heading. Oversized blocks are split on line boundaries and then on character
  count.
- Approximate token counts use 4 characters per token, chosen because the model truncates
  at 256 word pieces; the limits leave headroom for the document title and heading metadata
  prepended at embedding time.
- Chunk ids are deterministic (FNV-1a over workspace id, document id, chunker version,
  chunk index, and content). Change detection and integrity use SHA-256 via
  `crypto.subtle`.
- Embedding input is the document title, an optional `Heading: A > B` line, and the chunk,
  so a bare heading still matches.

### Index lifecycle

`src/features/ai/rag/documentIndexer.ts`, `indexQueue.ts`, `vectorStore.ts`

- **Skip condition.** A document is not re-embedded when its content hash, chunker version,
  embedding provider id, and embedding model id all match an `indexed` state. A changed
  title or folder updates only metadata, without re-embedding.
- **Replacement is atomic.** New chunks and the new state are written in one transaction
  that also deletes the previous chunks for that document, so a partially written index
  never replaces a usable one.
- **Queue.** A per-document debounce of 900 ms coalesces edit bursts; a new edit aborts the
  running job and starts again. Progress phases are `queued`, `parsing`, `embedding`,
  `saving`, `complete`, and `failed`.
- **Sync.** Documents no longer in a workspace have their chunks and state deleted. New and
  edited documents are re-queued while indexing is enabled.
- **Failure.** A failed job stores `status: "failed"` with an error code and is retryable
  from the panel; cancellation does not persist a failure.

### Retrieval

`src/features/ai/rag/retriever.ts`, `similarity.ts`

A hybrid score, computed over chunks that match the current embedding provider, model, and
dimension count:

```
score = 0.75 * ((cosine + 1) / 2) + 0.25 * lexicalOverlap
```

- `lexicalOverlap` is the fraction of query terms (stop-word filtered, two characters or
  more) present in title, heading path, and content.
- Defaults: `topK` 6, at most 3 chunks per document, minimum score 0.32, excerpts cut to
  1200 characters, and duplicate excerpts suppressed after whitespace normalization.
- Chunks with a non-finite score (dimension mismatch or zero vector) are discarded.

### Context packing

`src/features/ai/rag/contextBuilder.ts` builds the reference block.

- Budget of about 2200 tokens (roughly 8800 characters) measured on the serialized JSON,
  truncating the final excerpt rather than dropping it silently, and stopping when fewer
  than 40 characters remain.
- The block is wrapped in an explicit envelope stating the excerpts are untrusted reference
  data, not instructions, that instructions inside them must not be followed, and that the
  model must say when the evidence is insufficient.

`src/features/ai/rag/ragService.ts` composes retrieval and packing into
`retrieveWorkspaceContext(workspaceId, query)`.

### Index controls

`src/features/ai/rag/WorkspaceIntelligencePanel.tsx`

- Indexed-document count out of total documents, total chunk count, and a status cell
  (indexing, automatic updates, or paused).
- Live progress bar with the active phase message.
- Per-document failure list with **Retry**.
- **Index workspace** (or **Resume and update index**), **Rebuild index** (forced
  re-embed), **Pause automatic indexing**, and **Clear index** (confirmed).
- Pausing keeps existing chunks and flips any `indexing` state back to `pending`. Clearing
  deletes chunks and metadata only, never documents or conversations.

### Storage

Chunks live in `rag-chunks`, per-document state in `rag-index-meta`, and the per-workspace
enable flag in `app-meta` under `rag-enabled:<workspaceId>`.

---

## 2.11 AI usage tracking

`src/features/ai/usage/*`

Every AI request, whether an assistant reply, an inline completion, or a rewrite, opens a
usage handle.

### Exactly one terminal state

`startUsageRequest()` returns a handle whose `complete()`, `interrupt()`, and `fail()` are
mutually exclusive: the first call wins and later calls return the stored record. This is
what prevents an abort racing a failure from recording the same request twice.

| Method             | Status written | Used when                                    |
| ------------------ | -------------- | -------------------------------------------- |
| `complete(usage?)` | `completed`    | The provider finished the reply              |
| `interrupt()`      | `interrupted`  | The user pressed Stop or the panel unmounted |
| `fail(code?)`      | `failed`       | The provider or transport errored            |

### Record shape and honesty rules

`src/features/ai/usage/types.ts`

- `providerId`, `modelId`, `conversationId`, `requestId`, `durationMs` from a monotonic
  clock, `createdAt`, `status`, and optional `errorCode`.
- `inputTokens`, `outputTokens`, and `totalTokens` are **null** unless the provider reported
  them. `usageSource` is `provider_reported`, `estimated`, or `unavailable`.
- `normalizeUsage()` drops negative or non-finite values, rounds fractions, and derives a
  total from input plus output only when both are present.
- No estimate is ever written into a provider-reported record. `usageSource` can only be
  `provider_reported` or `unavailable` in practice; nothing in the app produces `estimated`.

### Dashboard

`src/features/ai/usage/UsageDashboard.tsx` (Preferences -> AI usage, local only)

- Requests, reported input tokens, reported output tokens, and reported total tokens.
- Completed, stopped, and failed counts, plus "without provider token data".
- Breakdown tables by provider and by model: requests, input, output, and total, with
  `(n n/a)` for requests that carried no provider counts.
- The 10 most recent requests with time, model, status, duration, and total tokens or
  `unavailable`.
- Refresh re-reads IndexedDB. There is no retention policy: records persist until the store
  is cleared.

---

## 2.12 Storage modes

Both modes sit behind the `DocumentStorageAdapter` interface in
`src/features/workspace/storage.ts`, so the rest of the app never knows which one is active.

### Browser storage (default)

One IndexedDB record, `workspace-state` / `primary-workspace-state`, holding the entire
`WorkspaceState`: workspaces, folders, documents (id, workspace, folder, title, content,
`updatedAt`), `openDocumentIds`, `recentDocumentIds`, `activeDocumentId`,
`activeWorkspaceId`, and `preferences`.

### Local computer folder (opt-in)

`src/features/workspace/localFolderStorage.ts`, `localFolderFormat.ts`

- Uses the File System Access API; the control is disabled where
  `window.showDirectoryPicker` is unavailable, with copy explaining the fallback.
- Real files on disk. Path scheme:
  `<Workspace name>--<first 8 of workspace id>/<Folder...>/<File>.md`, with sanitized path
  segments.
- A top-level `.markdown-ai-workspace.json` manifest holds
  `format: "markdown-ai-workspace-local"`, `version: 1`, an incrementing `revision`, the
  full app state, and per-document `relativePath` plus `contentHash`.
- Reads accept either the manifest or a folder populated by the app; documents whose file is
  missing are reported rather than silently dropped.
- **Conflict detection.** Before overwriting, the file's SHA-256 is compared with the
  manifest entry. A mismatch raises `LocalFolderConflictError` instead of clobbering an
  external edit, and the UI surfaces the adapter's message in the save toast.
- **Permission handling.** A revoked permission raises `LocalFolderPermissionError` and the
  UI asks the user to reconnect.
- **Switching back** to browser storage writes current state to IndexedDB first and keeps
  the folder's files untouched.
- The directory handle is kept in IndexedDB `app-meta` so the connection survives a reload
  where the browser still grants permission.

### Safety

`isSafeRelativeMarkdownPath` rejects absolute paths, `..`, backslashes, and non-Markdown
extensions. Folder hierarchies are cycle-checked before recursion so a corrupted manifest
cannot loop the UI.

---

## 2.13 Import and export

`src/routes/workspace.tsx`

### Import documents

- `.md`, `.markdown`, and `.txt` through the file picker, or by dropping files anywhere on
  the workspace.
- Each file becomes a root-level document named after the file (extension normalized to
  `.md`), with the file's text as content.
- Dropping is handled by `dragover` preventDefault plus `drop` on the page shell; there is no
  visible drop overlay.

### Export

- **Document** downloads the raw Markdown.
- **Workspace** produces a ZIP built with jszip that mirrors the folder tree as directories
  and adds a `.markdown-ai-workspace.json` bundle (`format: "markdown-ai-workspace"`,
  `version: 1`).

### Import workspace ZIP

- If the bundle manifest is present and valid, it is imported as a **new** workspace named
  `"<name> (imported)"` with every workspace, folder, and document id remapped and folder
  parents relinked.
- Otherwise every Markdown entry in the archive is imported into a new workspace,
  recreating the directory structure as nested folders.
- Imports never overwrite the current workspace.

### What backups exclude

Provider keys, conversation history, AI usage records, and the semantic index. A restored
workspace rebuilds the index by re-indexing, which requires no credentials.

---

## 2.14 Preferences

`src/features/workspace/WorkspaceSettings.tsx` is a modal dialog with six sections.

| Section      | Controls                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| General      | Dark or light appearance; wrap long lines in the editor                                                                                               |
| Editor       | Font size slider 12 to 20 px; autosave delay 300, 700, 1200, or 2000 ms                                                                               |
| Storage      | Current storage mode, **Connect local folder** or **Choose or reconnect folder**, **Use browser storage**, unsupported-browser notice, MCP guide link |
| AI providers | The provider panel (see 2.7)                                                                                                                          |
| Workspace AI | The index panel (see 2.10)                                                                                                                            |
| AI usage     | The usage dashboard (see 2.11)                                                                                                                        |

Preferences live on the `WorkspaceState` root rather than inside each workspace, so they are
shared by every workspace in this browser and are saved by the same debounced write as
documents.

---

## 2.15 Guided tour

`src/features/tour/GuidedTour.tsx`

Fifteen steps with a spotlight cutout over the target element and a card with **Back**,
**Next**, **Skip tour**, and **Finish**.

1. Workspace switcher
2. Explorer
3. Editor
4. Writing toolbar
5. Inline AI
6. Assistant panel (opens the panel)
7. Import and export
8. Preferences button
9. General settings
10. Editor settings
11. AI providers
12. Workspace AI
13. AI usage
14. Storage
15. MCP guide link

Steps can force a Preferences section open so the target exists when the step renders.
Completion is stored in `localStorage` under `markdown-ai-workspace-tour-complete`, and the
tour is restartable from the header help button. When a target element is absent, the card
says the control appears when its panel is available instead of breaking the flow.

---

## 2.16 MCP server

`mcp/src/index.ts`, `mcp/src/repository.ts` — published as `@ramaeon/md-workspace-mcp`
v0.1.1, Node 20 or later, stdio transport, bin `markdown-ai-workspace-mcp`. It imports
`writingSkills.ts` and `localFolderFormat.ts` directly from `src/`, so the app and the
server share one definition of both.

### Configuration

| Variable            | Required | Meaning                                                                               |
| ------------------- | -------- | ------------------------------------------------------------------------------------- |
| `MD_WORKSPACE_ROOT` | yes      | Absolute path to the folder the app wrote. The process exits with code 2 when missing |
| `MD_MCP_READ_ONLY`  | no       | Read-only unless set to `0`, `false`, or `no`                                         |

### Tools

| Tool               | Input                                            | Notes                                                |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------- |
| `list_workspaces`  | none                                             | Workspace metadata from the manifest                 |
| `list_documents`   | `workspaceId?`, `query?`                         | Filters on title and body                            |
| `read_document`    | `documentId`                                     | Returns metadata, SHA-256 `contentHash`, and content |
| `search_documents` | `query`, `workspaceId?`                          | Up to 20 matches with an excerpt around each hit     |
| `create_document`  | `workspaceId`, `folderId?`, `title`, `content`   | Write mode only                                      |
| `update_document`  | `documentId`, `expectedHash` (64 hex), `content` | Write mode only; optimistic concurrency              |
| `rename_document`  | `documentId`, `title`, `expectedHash`            | Write mode only; moves the file                      |
| `create_folder`    | `workspaceId`, `parentId?`, `name`               | Write mode only                                      |

There are **no delete tools**, by design.

### Resources and prompts

- Every document is a `text/markdown` resource at `markdown://document/{documentId}`, with a
  `list` callback so clients can enumerate them.
- Prompts: `review-markdown`, `draft-markdown-outline`, plus the five shared writing skills
  registered from `markdownWritingSkills`.

### Safety properties

- The manifest may not be a symlink.
- Every `relativePath` in the manifest is validated, and every resolved path (including the
  realpath of each existing ancestor) must remain inside the realpath'd root. This also
  covers files that do not exist yet.
- Folder cycles are detected before path construction.
- Writes are atomic: write to a unique `.tmp` file with the `wx` flag, then `rename`; a
  failed rename removes the temp file.
- The manifest `revision` increments on every mutation.
- Updates and renames refuse to proceed when the current hash differs from `expectedHash`,
  returning "Document changed since it was read. Read it again before updating."
- The server never calls an AI provider and never receives the app's BYOK keys. Prompts only
  supply text to whichever model the MCP client already uses.

---

## 2.17 Server entry and error handling

`src/server.ts` is the whole server surface.

1. Any request under `/api/compat/` is handed to the relay before the router runs, so a
   streaming body is never touched by route-level processing. Any other method than `GET`
   or `POST` gets `405` with an `Allow` header; an unknown path under the prefix gets `404`.
2. Everything else goes to the TanStack Start server entry, memoised after the first import.
3. Responses with status 500 or higher whose body is h3's swallowed-error JSON
   (`{"unhandled":true,"message":"HTTPError"}`) are replaced with a rendered HTML error page,
   and the original error is logged once with its message, stack, and cause chain. This
   exists because h3 converts in-handler throws into a generic response, so a plain
   `try`/`catch` never sees them.
4. Any other thrown error also renders the error page rather than leaking a stack.

Responses are deliberately **never compressed** in this layer, because the hosting platform
gzip/brotli-encodes every response at the edge; compressing here as well would encode the
body twice and render it garbled. `src/lib/error-capture.ts` keeps the last thrown error
out of band for five seconds so `src/server.ts` can recover a stack after h3 has stripped
it, and `src/lib/lovable-error-reporting.ts` forwards runtime errors to the optional
`window.__lovableEvents` bridge when the host provides one.

---

## 3. Persistence model

One IndexedDB database, `markdown-ai-workspace`, version 4, owned exclusively by
`src/lib/indexedDb.ts`. Feature modules define their own adapter interfaces on top of it.

| Store             | Key   | Indexes                                             | Contents                                                                                      |
| ----------------- | ----- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `workspace-state` | `id`  | none                                                | The whole `WorkspaceState` as one record                                                      |
| `conversations`   | `id`  | `workspaceId`, `updatedAt`                          | Conversation metadata, title, provider and model, timestamps                                  |
| `messages`        | `id`  | `conversationId`, `[conversationId, createdAt]`     | Messages with role, content, status, usage, sources, attribution                              |
| `ai-usage`        | `id`  | `createdAt`                                         | Usage records                                                                                 |
| `app-meta`        | `key` | none                                                | Provider credentials, custom provider definitions, local folder handle, `rag-enabled:*` flags |
| `rag-chunks`      | `id`  | `workspaceId`, `[workspaceId, documentId]`          | Chunk text, heading path, hashes, vectors                                                     |
| `rag-index-meta`  | `id`  | `workspaceId`, `[workspaceId, documentId]` (unique) | Per-document index state                                                                      |

Version history, from the source comments: 1 is workspace state; 2 adds conversations,
messages, usage, and app-meta; 3 adds RAG chunks and index metadata; 4 repairs the
`ai-usage` index, replacing the `timestamp` index (a field `UsageRecord` never had) with
`createdAt`. Migrations are additive except for that index repair; no store is dropped,
re-keyed, or rewritten.

Failure handling: missing `IndexedDB`, an open failure, a blocked upgrade (another tab on an
older version), and an aborted transaction all surface as `StorageUnavailableError` with a
message the UI can show. A `versionchange` from another tab closes this connection rather
than blocking the other tab, and a rejected connection promise is not cached, so a retry
after closing the other tab can succeed.

---

## 4. Module boundaries

| Path                                        | Owns                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/lib/indexedDb.ts`                      | The single database connection, schema, and migration                                    |
| `src/lib/error-capture.ts`, `error-page.ts` | Server-side error recovery and the HTML failure page                                     |
| `src/server.ts`                             | SSR entry, relay dispatch, catastrophic-error normalization                              |
| `src/features/workspace/`                   | Types, starter model, storage adapters, explorer, settings dialog                        |
| `src/features/editor/`                      | CodeMirror editor, preview, Mermaid rendering, heading extraction                        |
| `src/features/ai/providers/`                | Provider contracts, registry, adapters, shared transport, SSE, catalogue, relay protocol |
| `src/features/ai/settings/`                 | Sessions and credential persistence, custom provider definitions, provider panel         |
| `src/features/ai/assistant/`                | Chat transport, conversation store and storage, writing skills, panel                    |
| `src/features/ai/embeddings/`               | Embedding contract, registry, worker, normalized errors                                  |
| `src/features/ai/rag/`                      | Parsing, chunking, index queue, retrieval, context packing, panel                        |
| `src/features/ai/usage/`                    | Request lifecycle, storage, summary, dashboard                                           |
| `src/features/ai/server/`                   | The relay, and nothing else                                                              |
| `src/features/tour/`                        | Tour definition and renderer                                                             |
| `src/features/open-source/`                 | Canonical repository and npm metadata used by landing, guide, and workspace              |
| `src/routes/`                               | Page composition only; no persistence logic of its own                                   |

The intended dependency direction is workspace and editor, then AI features, then
`src/lib`. Provider network access stays inside adapters; the relay is the only server-side
code that carries a provider key.

---

## 5. Test coverage

| Layer              | Location                     | Scope                                                                                                                                                                                                                                                                                          |
| ------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and component | `src/**/*.test.ts(x)`        | Providers and registry, model catalogue, credential persistence and durability, conversation store, chat and completion services, writing skills, chunker, markdown parser, retriever, similarity, vector store, indexer, context builder, relay, usage store, assistant panel, provider panel |
| End-to-end         | `e2e/app.spec.ts`            | Seven specs: landing to workspace, guide page, guided tour and settings panels, workspace CRUD, search, views and persistence, import and export, storage-mode switching, and a full AI flow against a fake API                                                                                |
| MCP                | `mcp/src/repository.test.ts` | Path confinement, manifest validation, create, update, rename, hash conflicts                                                                                                                                                                                                                  |

The AI e2e spec drives the real provider adapters against a stubbed endpoint, so streaming,
error mapping, usage recording, skill prompts, inline completion, and rewrite preview are
exercised through the same code paths as production.

`npm run test:all` chains unit tests, the MCP suite, MCP typecheck and build, the e2e
typecheck, and Playwright.

---

## 6. Verification notes

Behaviour that is easy to misread from the code or from older docs:

- **`AI drafts` is a folder in the starter workspace, not a destination.** Nothing writes
  documents into it automatically.

---

## 7. Documentation drift

Claims found in repository Markdown or in-app copy that the implementation does not support.
The implementation is authoritative.

| Claim and where it appears                                                    | Actual behaviour                                                                                          | Evidence                              |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `docs/workspace-intelligence.md` cites a "21.1 MiB ONNX asset"                | A build-artifact figure that cannot be confirmed from source; treat as stale                              | build output, not source              |
| `docs/workspace-intelligence.md` says rebuild and retry keep prior chunk data | True of chunk rows, but the document state flips to `indexing` first, so the panel shows work in progress | `documentIndexer.ts`, `indexQueue.ts` |

### Resolved in this pass

These were fixed in code rather than documented as defects:

| Was                                                                                 | Now                                                                                |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/routes/guide.tsx` said the assistant could use "selected documents" as context | Says current document or entire workspace, matching `AssistantPanel`               |
| `src/routes/guide.tsx` implied one connected provider at a time                     | States that several providers can stay connected and be switched without reloading |
| Guided tour said appearance "is saved with this local workspace"                    | Says preferences are shared by every workspace in the browser                      |
| Theme changes did not restyle an already-mounted editor                             | Theme is passed to `MarkdownEditor` and applied through a `Compartment`            |
| `src/features/ai/usage/estimate.ts` was exported and tested but never called        | Deleted, along with its test, since estimates must never reach stored usage        |
| The `ai-usage` `timestamp` index was created on a field that never existed          | DB version 4 drops it and adds `createdAt`; reads use the index instead of sorting |
| `README.md` was the original build brief describing an unbuilt app                  | Rewritten as an accurate overview that defers to this document for detail          |
| `noUnusedLocals` and `noUnusedParameters` were off                                  | Both enabled, which surfaced and removed three unused imports                      |

---

## 8. Quick reference

| Need                                             | Where                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| Change a provider adapter                        | `src/features/ai/providers/`, then register it in `registry.ts`     |
| Change the assistant prompt                      | `chatService.ts`, `buildSystemInstruction`                          |
| Change chunking or retrieval tuning              | constants in `chunker.ts`, defaults in `retriever.ts`               |
| Add a persisted field                            | bump `src/lib/indexedDb.ts` and update the owning feature's adapter |
| Change how documents are stored                  | `src/features/workspace/storage.ts` interface, then either adapter  |
| Add a surface linking to the repo or npm package | `src/features/open-source/repository.ts`                            |
| Add an MCP tool                                  | `mcp/src/index.ts`, with the filesystem work in `repository.ts`     |
| Run everything                                   | `npm run test:all`                                                  |
