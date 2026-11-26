# Test suite and guided tour

## Run the full suite

```sh
npm test
npm run test:mcp
npm run typecheck:e2e
npm run test:e2e
```

The E2E suite starts the Vite app at `127.0.0.1:4189` and runs in Chromium. It
uses a fake OpenAI-compatible response server and an in-memory File System
Access API, so it needs no provider key, account, cloud API, or real folder.
If Playwright's bundled Chromium is not installed, run `npx playwright install
chromium`. An installed Chrome can be selected with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/chrome`.

## Coverage map

- Unit tests cover workspace models, IndexedDB, document/folder operations,
  local-folder manifest validation and file behavior, AI provider configuration
  and credential isolation, chat history/streaming, usage, retrieval/indexing,
  writing skills, completion cancellation, editor explorer controls, settings,
  and the MCP filesystem repository.
- Playwright covers the landing route, the interactive tour, workspace and
  document CRUD, search, editor/preview, local persistence, imports and ZIP
  round-trips, Markdown export, browser/folder storage switching, AI provider
  connection, assistant chat, completion/rewrite acceptance and cancellation,
  settings, usage, intelligence, and MCP setup visibility.
- Tests never use real API credentials. Provider calls are fulfilled by the
  local Playwright route handler. The MCP repository tests use disposable
  temporary directories and include stale hashes, path traversal, and symlink
  escape checks.

## Guided tour

The first workspace visit offers the tour once. Users can restart it at any
time with the question-mark button in the workspace header. The **Next** and
**Back** controls lead through workspaces, the explorer, editor and preview,
formatting, AI writing, import/export, preferences, provider setup, local
intelligence, usage, browser/folder storage, and MCP setup. It highlights the
relevant app control and opens the appropriate Preferences section for settings
steps.

Tour completion is stored only in this browser's local storage. There is no
Pendo account, analytics beacon, or tracking service.
