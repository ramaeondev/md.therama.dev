# Browser BYOK security

Browser-direct BYOK remains an accepted MVP trade-off, now covering two providers.

## Key handling

Gemini requests send the key in the `x-goog-api-key` header. OpenAI requests and
OpenAI-compatible requests send it in `Authorization: Bearer`. No adapter places a
key in a URL, a request body, localStorage, IndexedDB, logs, or analytics, and no
request is sent to an application server.

| Requirement | Behaviour |
| --- | --- |
| Persistence | The raw key is never persisted. |
| Browser storage | No localStorage, sessionStorage, or IndexedDB entry. |
| React state | Keys live in an input field and are cleared after connecting. |
| Sessions | Each provider keeps its key in a closure inside an in-memory session. |
| Logging | Credentials are never logged. |
| Errors | Authorization headers and provider bodies are excluded from messages. |
| Disconnect | Clears that provider's session and aborts its tracked requests. |
| Switching | A session is keyed by provider ID, so one provider's key is never reused. |
| Analytics | Credentials are never included. |

Several providers can be connected at once, each with an independent session. A
reconnect replaces only that provider's session; the others keep working.

## Compatible-provider endpoints

A user supplies an arbitrary base URL, so it is validated before an adapter exists:
remote endpoints must use HTTPS, URL-embedded credentials are rejected, and
private, link-local, and internal hosts are blocked to limit SSRF. Loopback HTTP is
permitted for local runtimes such as Ollama and LM Studio. This is host-based
protection and does not resolve DNS rebinding; a production deployment should
enforce it server-side.

## Residual risk

A key used by a browser application is visible to that browser's owner and may be
inspected with developer tools or browser extensions; network access also depends
on the user's browser and device. This is not equivalent to server-side secret
storage and should not be used to protect a key from the person using the browser.

Because credentials can be present in browser memory, the app must not let
untrusted content execute scripts on its origin. Assistant output is rendered
through `react-markdown` with `remark-gfm` and no raw HTML rehype plugin, so
generated Markdown cannot inject script tags.

Use dedicated keys restricted to the relevant API, monitor their usage, and revoke
them if exposed. The settings screen discloses direct browser access and
session-only credentials. The app must never silently upload a BYOK key to an
application backend; a production deployment that needs a stronger boundary should
add an explicit credential proxy instead.

## References

- [Gemini API models and methods](https://ai.google.dev/api/models)
- [Google API key best practices](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices)
- [OpenAI API reference](https://developers.openai.com/api/reference/overview)
