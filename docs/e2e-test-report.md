# E2E test report

**Date:** 2026-11-25  
**Result:** 5 Playwright E2E tests passed; 247 Vitest tests passed.

## Coverage

- Guest workspace deletion and empty-state recovery before account creation.
- Signup, email-confirmation gate, confirmation link, sign-in, encrypted starter-document sync, and device registration.
- Sync pause/resume behavior, verifying local edits remain unsynced while paused and transfer after resume.
- BYOK provider key storage in browser IndexedDB and isolation from fake Auth/sync payloads.
- Sign-out behavior, password recovery and update, sign-in with the replacement password, workspace deletion, cloud tombstones, and reload without recreating intentionally deleted docs.
- Folder creation, rename, and cascading deletion; document creation, rename, duplication, and deletion.
- General/editor/workspace AI/usage/storage settings, including the anonymous disabled sync control.
- Markdown import, workspace ZIP export/import, workspace creation, and workspace switching.
- Mocked provider model discovery and streamed assistant reply, plus conversation rename, delete, history, and new conversation.
- Each Markdown toolbar formatter, document search, editor/preview/split views, outline, tab closing, and assistant-panel visibility controls.

## Verification

| Command                                                                             | Result                                                                                                                             |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:e2e`                                                                  | Passed: 5 tests                                                                                                                    |
| `npm test`                                                                          | Passed: 23 files, 247 tests                                                                                                        |
| `npx eslint playwright.config.ts tests/e2e/*.spec.ts tests/e2e/fake-api-server.mjs` | Passed                                                                                                                             |
| `npm run build`                                                                     | Passed                                                                                                                             |
| `npm run lint`                                                                      | Failed on existing repository-wide Prettier lint errors: 189 errors and 8 warnings. The new E2E/config files pass targeted ESLint. |
| `git diff --check`                                                                  | Passed                                                                                                                             |

## Findings and limits

- The fake API initially exposed a user-id lookup defect and did not accept Supabase Auth's `PUT /auth/v1/user` password update request. Both issues were fixed in the test double; the complete suite now passes.
- Vite logs a React hydration mismatch for the starter Markdown preview: server HTML has different heading text/IDs from the client render. It did not break the tests and is not changed by this test setup.
- Auth, sync, email links, and AI provider responses are simulated locally. Production Cloudflare routing, Supabase schema/RLS behavior, actual email delivery, and live AI provider connectivity remain outside this test run.
