# Browser BYOK security

The Gemini provider adapter sends the user's key directly to Google's Gemini API over HTTPS. It uses the `x-goog-api-key` request header rather than placing the key in a URL. The adapter does not send credentials to an application server and does not write them to localStorage, IndexedDB, logs, or analytics.

The current provider session keeps its key in browser memory only. A key used by a browser application is still visible to that browser's owner and may be inspected with developer tools or browser extensions; network access also depends on the user's browser and device. This is not equivalent to server-side secret storage and should not be used to protect a key from the person using the browser.

Use a dedicated key restricted to the Gemini API, monitor its usage, and revoke it if exposed. Before a future settings screen accepts a key, it must clearly disclose direct browser access and offer session-only credentials. The app must never silently upload a BYOK key to an application backend.

Gemini requests use the documented `models.list`, `generateContent`, and `streamGenerateContent` REST methods. API keys are sent in the supported header form described in Google's key guidance.

- [Gemini API models and methods](https://ai.google.dev/api/models)
- [Google API key best practices](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices)