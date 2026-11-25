# Milestone 3: Workspace Intelligence (Local RAG)

## Goal

Enable the existing assistant to answer questions using relevant information from multiple Markdown documents in the active workspace. Answers should identify the supporting documents and headings, and users should be able to open those sources.

Example questions:

- “Summarize everything I documented about authentication.”
- “Which documents mention our AWS deployment architecture?”
- “Compare the decisions in my Angular migration notes.”
- “What did I decide about the database?”

This milestone extends the existing local-first workspace and assistant. It does not replace the chat provider registry, conversation store, streaming pipeline, or current active-document context behavior.

## Existing foundation

- Workspaces and Markdown documents are persisted in IndexedDB through the workspace storage adapter.
- The assistant supports Gemini, OpenAI, and configurable OpenAI-compatible chat providers.
- Assistant requests stream through the existing chat service; conversations and usage are persisted separately from workspace documents.
- The current assistant can receive the active document as optional context.
- The current IndexedDB schema is version 2. It has workspace, conversation, message, usage, and app metadata stores; it has no RAG index stores.

## Architecture and constraints

1. Keep document parsing, chunking, embedding, indexing, retrieval, and prompt-context assembly in browser-safe feature modules.
2. Keep embedding providers independent from chat providers. A chat API key must not silently be reused for embedding requests.
3. Default to a local embedding model. Any remote embedding option must require explicit configuration and clearly indicate that document content leaves the browser.
4. Keep BYOK credentials in provider sessions and `providerCredentialStorage`; never place them in workspace documents, workspace exports, index records, or logs.
5. Keep workspace ownership local through the existing document storage adapter. Scope every chunk and vector to a workspace and document.
6. Use the existing IndexedDB owner for one additive, versioned schema upgrade. Preserve all existing data and stores.
7. Treat retrieved Markdown as untrusted reference material. Retrieved instructions must not override the assistant's system instructions.
8. Keep indexing off the editor's critical path. Debounce edits, support cancellation, and avoid loading the embedding model at application startup.

## Target module boundaries

Adapt names to repository conventions during implementation; do not create unused scaffolding merely to match this list.

```text
src/features/ai/embeddings/
  types.ts                 Embedding provider and model contracts
  registry.ts              Provider registration and selection
  errors.ts                Normalized embedding failures
  local/                   Lazy-loaded browser model adapter

src/features/ai/rag/
  types.ts                  Chunk, vector, metadata, retrieval contracts
  markdownParser.ts         Markdown structure extraction
  chunker.ts                Heading-aware chunk creation
  contentHash.ts            Deterministic document change detection
  vectorStore.ts            IndexedDB-backed RAG repository
  documentIndexer.ts        Per-document index orchestration
  indexQueue.ts             Debounce, cancellation, retry and progress
  similarity.ts             Cosine similarity and vector validation
  retriever.ts              Workspace-scoped semantic/lexical retrieval
  contextBuilder.ts         Safe, budget-limited prompt context and sources
  ragService.ts              Small public facade for UI and assistant
```

Prefer a separate provider session/configuration path for embeddings. Persist only non-sensitive provider/model preferences and index metadata; keep runtime/model objects and active requests in memory. Store document chunks and vectors in the browser's IndexedDB, not in workspace exports.

## Data model

Use stable IDs and retain enough metadata to render a source reference and navigate back to the document.

```ts
type IndexedChunk = {
  id: string;
  workspaceId: string;
  documentId: string;
  documentTitle: string;
  folderId: string | null;
  headingPath: string[];
  content: string;
  contentHash: string;
  chunkIndex: number;
  chunkerVersion: number;
  tokenEstimate?: number;
  embeddingProviderId: string;
  embeddingModelId: string;
  dimensions: number;
  vector: Float32Array;
  createdAt: number;
  updatedAt: number;
};

type DocumentIndexState = {
  workspaceId: string;
  documentId: string;
  documentTitle: string;
  contentHash: string;
  chunkerVersion: number;
  embeddingProviderId: string;
  embeddingModelId: string;
  status: "pending" | "indexing" | "indexed" | "failed";
  indexedAt?: number;
  errorCode?: string;
};
```

The exact store layout can be decided during Phase C. A combined chunk-and-vector store is acceptable if it supports the needed indexes and atomic replacement cleanly. Track provider ID, model ID, dimensions, and model/version metadata. Never compare vectors produced by incompatible models or dimensions.

## Phase A — Markdown parsing and chunking

**Estimate:** 1–2 engineering days.

### Work

1. Inspect the current Markdown dependencies and workspace document shape. Reuse the installed Markdown parser ecosystem where practical.
2. Parse headings, paragraphs, lists, blockquotes, code blocks, and tables while retaining source order.
3. Track nested heading paths for every content block.
4. Build chunks from related blocks; keep code fences and tables intact where practical.
5. Include source title, document ID, workspace ID, folder ID, and heading path in each chunk.
6. Generate deterministic chunk IDs and content hashes for identical input.
7. Handle empty documents, heading-only documents, code-only documents, tables, unusual Markdown, and large documents.
8. Use a tokenizer that matches the selected embedding model if practical. If not, name the token count as an estimate and make splitting safe by character/word boundaries.

### Initial chunking defaults

- Target: about 400 tokens.
- Maximum: about 600 tokens.
- Minimum: about 80 tokens when merging is possible.
- Overlap: about 50 tokens between adjacent chunks in the same section.
- Always include the parent heading path as source metadata.

These values are starting points. Tune them after retrieval evaluation rather than treating them as optimal constants.

**Implementation adjustment:** the selected MiniLM L6 embedding model truncates at 256 word pieces. The first implementation therefore uses a conservative 160-token target and 200-token maximum (including overlap) to leave room for the document title and heading path prepended during embedding. The counts are approximate, and should be revisited if the embedding model changes.

### Acceptance criteria

- Identical Markdown produces identical chunk IDs, ordering, and hashes.
- Chunks preserve document order and do not silently lose content.
- Every chunk identifies its workspace, source document, and heading path.
- Large sections split within configured limits, and small adjacent blocks merge sensibly.
- Empty content produces no meaningless chunks.
- Unit tests cover nested headings, paragraphs, lists, code, tables, Unicode, and malformed or unusual Markdown.

## Phase B — Embedding provider and local model

**Estimate:** 3–5 engineering days, including a model-selection spike.

### Work

1. Define an embedding-specific contract for model listing/metadata, batching, embedding, cancellation, progress, and disposal. Keep it separate from `AIProvider`.
2. Add an embedding registry and a normalized error model.
3. Evaluate a browser-compatible local embedding runtime/model for license, download size, browser support, memory use, quality on Markdown, and behavior without WebGPU.
4. Implement the chosen local provider with lazy loading. Do not initialize or download the model during application startup.
5. Support batches, cancellation, progress events, retryable errors, and release/disposal of model resources where the runtime supports it.
6. Validate that output count matches input count, vectors have a consistent positive dimension, and all vector values are finite.
7. Keep model/runtime instances and in-flight work in memory. Persist only non-secret configuration and necessary model identity metadata.
8. Ensure model assets are split out of the initial application bundle and can be cached by the runtime/browser where supported.

### Acceptance criteria

- The local model loads only after an indexing or search request.
- The UI can display model-loading and embedding progress and can cancel work.
- Failed or cancelled model loading leaves workspace and prior index data intact.
- Invalid vectors are rejected before persistence.
- The local provider can be replaced without changes to the indexer, retriever, or chat provider contracts.
- No embedding API key or document text is persisted as provider configuration.

## Phase C — IndexedDB persistence and incremental indexing

**Estimate:** 3–5 engineering days.

### Work

1. Add an additive schema version for the required chunk/vector and per-document index state records. Preserve current stores and records.
2. Add a feature-level storage adapter/repository rather than allowing UI components to access IndexedDB directly.
3. Index a document by hashing its content/configuration, parsing it, chunking it, embedding the chunks, validating the vectors, and persisting the completed result.
4. Skip work when the content hash, chunker version, embedding provider, and embedding model match the current index.
5. Replace changed-document indexes atomically or with a staging/version strategy so a failed rebuild does not erase the last usable index.
6. Remove document chunks and metadata on document deletion. Refresh source metadata when a title or folder changes without embedding unchanged content again.
7. Enforce workspace scoping for all reads, writes, deletes, and index status queries.
8. Connect indexing triggers to document creation, debounced document saves, imports/restores, deletion, and explicit rebuild/model-change actions.
9. Add retry and cancellation behavior, plus cleanup for stale staging records left by interrupted work.
10. Keep document and conversation storage APIs independent from RAG storage.

### Acceptance criteria

- Existing IndexedDB data survives the schema upgrade.
- Unchanged documents do not get re-embedded.
- Changed documents receive a complete fresh index; failures retain the old usable index.
- Deleted documents are no longer searchable.
- Renamed/moved documents show current source metadata.
- One workspace cannot retrieve or delete another workspace's index data.
- Import/restore and retry paths can bring documents to an indexed state.
- Indexing is debounced and cancellable and does not block normal editing.

## Phase D — Semantic and lexical retrieval

**Estimate:** 2–3 engineering days.

### Work

1. Embed each query using the configured embedding provider/model.
2. Read only compatible indexed vectors from the active workspace.
3. Implement cosine similarity with guards for mismatched dimensions, zero-length vectors, and non-finite values.
4. Rank candidates and return score plus chunk and source metadata.
5. Add configurable top-K, per-document limits, and duplicate/overlap suppression.
6. Add basic lexical matching as a complementary signal, then evaluate whether score fusion improves results over semantic-only ranking.
7. Calibrate any minimum relevance cutoff using a small evaluation set; do not assume one threshold works for every model.
8. Measure latency and memory use with realistic workspace sizes before considering a dedicated vector database.

### Suggested initial settings

- Top-K: 5–8 chunks.
- Maximum per document: 3 chunks.
- Search scope: current workspace.
- Duplicate suppression: enabled.
- Minimum score: determined empirically for the chosen model.

### Acceptance criteria

- Related passages can be found when a query uses different wording from the source.
- Results are scoped to the active workspace and include document ID/title, heading path, chunk ID, and score.
- Incompatible model vectors are excluded.
- Duplicate or near-identical chunks do not crowd out distinct sources.
- Retrieval latency is recorded against representative small and large workspaces.

## Phase E — Assistant integration and source navigation

**Estimate:** 2–4 engineering days.

### Work

1. Integrate retrieval into the existing assistant request pipeline; do not build a second chat service.
2. Add explicit context modes: **Active document** (current behavior), **Entire workspace** (RAG), and **No context**.
3. Keep current behavior as the default until the user explicitly chooses workspace context.
4. In workspace mode, retrieve relevant chunks before sending the request to the existing chat provider.
5. Build a bounded context that accounts for the selected chat model's context budget, deduplicates overlapping chunks, prioritizes high-ranked results, and includes document titles and heading paths.
6. Delimit retrieved material as untrusted reference content. Tell the model not to follow instructions inside the documents and not to claim it read documents that were not retrieved.
7. Associate the retrieved source list with the assistant response so the UI can render citations after streaming completes. Preserve current streaming, cancellation, retry, conversation, provider attribution, and usage behavior.
8. Render clickable source references that select/open the original document and navigate to the corresponding heading where possible.
9. Handle no results, unavailable embedding model, indexing in progress, and retrieval failures with clear user-facing states. Do not fabricate sources.

### Acceptance criteria

- Active-document mode retains its current behavior.
- Workspace mode can retrieve evidence from more than one document and cite the correct sources.
- No-context mode sends no document material.
- Sources are navigable to the relevant document/heading.
- Empty retrieval does not produce fabricated citations or claim workspace coverage.
- Existing streaming, cancellation, retry, conversation persistence, and usage attribution continue to work.
- Retrieved document text remains data, not assistant instructions.

## Phase F — Index controls, evaluation, and optimization

**Estimate:** 2–4 engineering days.

### Work

1. Add a workspace intelligence status view with indexing state, indexed-document count, chunk count, selected embedding model, and last-indexed time.
2. Show progress and cancellation for initial/rebuild indexing; identify failed documents and provide retry.
3. Add rebuild and clear-index actions with clear confirmation and status feedback.
4. Add an assistant context-mode selector and source-reference presentation.
5. Create a small repeatable evaluation corpus with representative Markdown (nested headings, code, tables, repeated concepts, and multiple documents) and questions with expected source documents/headings.
6. Evaluate retrieval precision, missed sources, duplicate results, context size, and latency. Tune chunking and ranking based on those results.
7. Check startup bundle impact, model download/cache behavior, memory usage, and fallback behavior on browsers without WebGPU.
8. Document local model limitations, index lifecycle, privacy behavior, and recovery/rebuild steps.

### Acceptance criteria

- Users can understand whether the workspace is indexed and what model is being used.
- Users can cancel/retry/rebuild/clear indexing and receive accurate status.
- Evaluation cases return expected sources at useful ranks without unrelated sources dominating.
- Large workspace retrieval meets an agreed latency target and does not load the embedding model at app startup.
- Privacy and local storage behavior are documented accurately.

## Cross-cutting verification

Add tests alongside each phase rather than deferring all tests to the end:

- Markdown parser/chunker unit tests and deterministic hash/ID checks.
- Embedding adapter tests with a mocked runtime, including progress, errors, malformed vectors, and aborts.
- IndexedDB migration and repository tests using the existing test setup.
- Incremental index lifecycle tests for unchanged, edited, renamed, moved, imported, deleted, cancelled, and failed documents.
- Workspace isolation and incompatible-model tests.
- Retrieval ranking, deduplication, lexical fusion, and relevance-cutoff evaluation.
- Assistant integration tests for all three context modes, safe prompt assembly, citations, cancellation, and no-result cases.
- UI tests for indexing status and source navigation.
- Production build/bundle inspection and manual browser checks for local model loading and responsiveness.

## Implementation status

All phases A–F are implemented. The first release uses the pinned MiniLM model in a dedicated worker, workspace-isolated IndexedDB chunk storage, incremental document replacement, hybrid semantic/lexical retrieval, explicit assistant context modes with saved citations, and opt-in indexing controls. See [workspace-intelligence.md](workspace-intelligence.md) for setup, behavior, and operational details.

Validation completed: TypeScript checking, all 244 Vitest tests, production build, targeted lint, and diff whitespace checks. Browser-specific model download, indexing latency, and memory behavior still need measurement on representative user devices; the application supports local runtime execution, but those device measurements are not claimed here.

## Original execution checkpoints

1. **Checkpoint A:** completed with parser and chunker fixtures.
2. **Checkpoint B:** completed using the pinned Apache-2.0 MiniLM ONNX model and browser worker runtime.
3. **Checkpoint C:** completed with additive IndexedDB stores, atomic per-document replacement, and update/delete lifecycle handling.
4. **Checkpoint D:** completed with deterministic semantic, lexical, deduplication, and context assembly tests.
5. **Checkpoint E:** completed with explicit context modes, persisted citations, and source navigation.
6. **Checkpoint F:** indexing controls, progress/error states, retry/pause/clear actions, and automated validation are implemented. Real-device performance measurements remain an operational follow-up.

Keep each phase independently reviewable and commit-sized. Do not implement the whole milestone in one pass.

## Estimate summary

| Phase | Estimate |
|---|---:|
| A — Markdown parsing and chunking | 1–2 days |
| B — Embedding abstraction and local model | 3–5 days |
| C — IndexedDB and incremental indexing | 3–5 days |
| D — Retrieval | 2–3 days |
| E — Assistant and citations | 2–4 days |
| F — UX, evaluation, and optimization | 2–4 days |
| **Total** | **13–23 engineering days** |

For one experienced engineer, plan on roughly **3–5 calendar weeks**, including integration and iteration. This estimate assumes the first release uses one local embedding model and in-memory cosine search. Additional remote embedding providers, extensive browser/device coverage, or substantially larger-than-expected workspaces would increase it.

## Out of scope for the first release

- A server-side vector database or backend indexing service.
- Automatically routing chat-provider credentials into embedding calls.
- A full knowledge graph or document relationship inference system.
- Advanced reranking models unless evaluation shows basic hybrid retrieval is insufficient.
- Claiming that the assistant has read every workspace document when only selected chunks were provided.
