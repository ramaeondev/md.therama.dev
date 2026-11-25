# Workspace Intelligence

Workspace Intelligence adds browser-local semantic indexing to the Markdown workspace and an explicit workspace context mode to the existing assistant.

## Enable and manage an index

Open **Preferences → Workspace AI** for the active workspace, then select **Index workspace**. Indexing downloads the embedding runtime/model on first use, parses the workspace's Markdown documents, and stores heading-aware chunks and vectors in this browser's IndexedDB. Later document edits are indexed after a short debounce. New and imported documents are picked up while automatic indexing is enabled; deleting documents removes their indexed content.

The panel reports indexed documents, chunks, active progress, and failures. It supports retry, pause, rebuild, and clear. Clearing or pausing the index does not remove Markdown documents or conversations. Rebuild and retry keep the previous usable chunk data until replacement data has been generated successfully.

## Ask workspace questions

In the assistant, choose **Entire workspace** in **Answer using**. The app embeds the question locally, searches only the active workspace, and sends the most relevant excerpts to the currently selected chat provider. The response shows source document and heading references; selecting a source opens that document and jumps to its heading.

**Active document** preserves single-document context. **No document context** sends no document excerpts. Workspace mode with no relevant indexed passages instructs the assistant to say that it did not find enough evidence rather than inventing citations.

## Local model and data handling

The default model is `onnx-community/all-MiniLM-L6-v2-ONNX`, pinned to revision `aff7a1d` so existing vectors are not silently mixed with changed upstream weights. It is Apache-2.0 licensed. Its source model configuration specifies a maximum sequence length of 256 word pieces, so this implementation uses conservative approximate chunk limits (160 target / 200 maximum) and includes document and heading metadata when embedding. These limits should be revisited if the model changes.

The model is loaded lazily through Transformers.js 3.8.1 inside a dedicated Web Worker, keeping CPU inference off the editor thread. Model assets are fetched from Hugging Face on first use and cached by the browser/runtime where supported. The production build emits a 21.1 MiB ONNX WebAssembly asset, below Cloudflare Workers' 25 MiB per-file asset limit. Embedding inference runs in the browser; workspace document content and vectors stay in local IndexedDB. When a user asks a workspace question, only retrieved excerpts and the question are sent through the selected chat provider. Chat API credentials remain in the existing provider credential storage and are never added to workspace records or RAG index records.

Browser storage is local to the current browser profile and origin. Clearing site data removes both the workspace and its index. Exported workspace backups contain documents, not embeddings; the index can be rebuilt after import.

## Implementation boundaries

- `src/features/ai/embeddings/` owns the embedding contracts, registry, normalized errors, and lazy local model adapter.
- `src/features/ai/rag/` owns Markdown parsing/chunking, hashes, IndexedDB persistence, index queue, retrieval, context construction, and index controls.
- `src/features/ai/assistant/` continues to own chat transport, conversation persistence, and response streaming; workspace retrieval is passed into that path as explicit context.
- `src/lib/indexedDb.ts` owns the additive schema version 3 upgrade and new `rag-chunks` / `rag-index-meta` stores.

## Validation

Tests cover Markdown structure and chunk determinism, vector validation/ranking, workspace scoping, atomic index replacement, schema migration, assistant prompt safety, and persisted source references. The local model download and performance are browser/runtime dependent; the production bundle includes a deferred Transformers.js chunk and ONNX WebAssembly assets, which are used when indexing or querying rather than at application startup.
