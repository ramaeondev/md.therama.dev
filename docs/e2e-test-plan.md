# Browser E2E test plan

## Test environment

- Run the Vite app on `127.0.0.1:4173` with a test-only Supabase URL and publishable key.
- Start an in-memory fake API on `127.0.0.1:54321` for Auth, email links, device registration, key envelopes, and encrypted Markdown rows.
- Use a fresh Playwright browser context and reset fake API state before each test. Never contact the production Auth or sync API.
- Keep signup and password-reset messages in the fake API mailbox so tests follow the same links as a user without sending email.

## Lifecycle scenarios

1. As a guest, delete the last workspace and confirm the local document list is empty.
2. Sign up with name, email, and password. Verify the user remains signed out until email confirmation, and reject sign-in before confirmation.
3. Follow the fake confirmation email link. Verify cloud sync defaults on and the first clean account sync creates, encrypts, and uploads the starter workspace.
4. Pause cloud sync, create a Markdown note, and confirm the server copy does not change. Resume sync and confirm the note is uploaded encrypted.
5. Connect a provider using a sentinel BYOK key. Confirm the key is sent only to the mocked provider, is stored in browser IndexedDB, and never appears in fake Auth/sync requests or document payloads.
6. Sign out. Confirm the app returns home, removes the locally stored BYOK key, and keeps Markdown documents on the device.
7. Request password reset, follow the fake recovery email, set a new password, and sign in with it.
8. Delete the workspace while signed in. Confirm the local documents disappear, the provider key remains, and cloud rows become tombstones.
9. Reload after deletion. Confirm the starter workspace is not recreated for an account with prior sync history and deleted rows.

## Workspace and AI feature scenarios

10. Create a nested folder and Markdown file, rename and duplicate the file, delete the duplicate, rename the folder, then delete the folder and confirm its child document is removed.
11. Open Preferences and visit General, Editor, Workspace AI, AI usage, and Storage. Change the theme and confirm the anonymous cloud-sync control stays disabled.
12. Import a Markdown file, export the workspace as a ZIP, import the ZIP as a new workspace, create another workspace, and switch between workspaces while confirming each keeps its own document list.
13. Connect OpenAI with a test-only key and mocked model endpoint. Send a chat prompt through a mocked streaming completion, rename and delete the saved conversation, and start a new conversation.
14. Exercise each Markdown toolbar formatter, document search, editor/preview/split views, outline navigation, closing tabs, and assistant-panel show/hide controls.

## Coverage boundaries

- All Auth and `/md/v1` traffic is handled by the local in-memory fake API. The app's production API hostname is rewritten to loopback inside Playwright, and provider network calls are intercepted at the browser.
- This validates the UI's client behavior, request payload shape, encryption boundary, and sync lifecycle. It does not verify production Cloudflare routing, production Supabase schema/RLS, real email delivery, or connectivity to external AI services.
- The test run reports an existing React hydration warning on the starter Markdown preview: the server-rendered heading IDs/text differ from the client-rendered preview after hydration. Assertions still pass; investigate this separately if the warning is unexpected.

## Automated command

```sh
npm run test:e2e
```

The fake API exposes only test state and mailbox endpoints in addition to the Supabase-compatible routes used by the app. Test state omits passwords and request bodies; it records only request method/path and a boolean indicating whether the BYOK sentinel reached the fake service.
