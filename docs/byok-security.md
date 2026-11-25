# Browser BYOK security

Browser-direct BYOK remains an accepted MVP trade-off, now covering two providers.

## Key handling

Gemini requests send the key in the `x-goog-api-key` header. OpenAI requests and
OpenAI-compatible requests send it in `Authorization: Bearer`. No adapter places a
key in a URL, a request body, localStorage, sessionStorage, logs, or analytics.
A key *is* stored in this origin's IndexedDB so a refresh does not force the user
to paste it again — see [Credential persistence](#credential-persistence).

Requests are browser-direct by default, so no request reaches an application
server. The one exception is a compatible provider added with the relay enabled,
which is an explicit, disclosed choice — see [The relay](#the-relay-and-what-it-changes)
below.

| Requirement | Behaviour |
| --- | --- |
| Persistence | A key is stored in this device's browser storage (`app-meta`, key `ai-provider-credentials`) so a reload keeps the provider connected. It is never written into a workspace document, a workspace export, or a provider definition record. |
| Erasure | Only an explicit **Clear key**, a **Remove provider**, or clearing all providers deletes the stored record. A failed **Test**, an offline reload, or a transient error never erases it. |
| Browser storage | No localStorage or sessionStorage entry. IndexedDB is the only store, on this origin. |
| React state | Keys live in an input field and are cleared after connecting. |
| Sessions | Each provider keeps its key in a closure inside a session. |
| Logging | Credentials are never logged. |
| Errors | Authorization headers and provider bodies are excluded from messages. |
| Disconnect | Deletes that provider's stored record and aborts its tracked requests. |
| Switching | A record and a session are keyed by provider ID, so one provider's key is never reused. |
| Analytics | Credentials are never included. |

Several providers can be connected at once, each with an independent session. A
reconnect replaces only that provider's session and stored key; the others keep
working.

## Credential persistence

`src/features/ai/settings/providerCredentialStorage.ts` keeps one record per
connected provider in the existing `app-meta` key/value store:
`{ providerId, apiKey, models, connectedAt }`. It is separate from workspace
storage, so a credential never enters a workspace document, a workspace export,
or a saved compatible-provider definition.

The behaviour the app promises:

- **A refresh keeps providers connected.** On load, `restoreConnectedProviders`
  rebuilds an in-memory session per stored record and makes the provider recorded
  in preferences active.
- **Only the user disconnects.** A stored key is deleted by **Clear key**, by
  **Remove provider**, or by a full disconnect — never by a failed **Test**, a
  transient network error, an offline reload, or a provider outage.
- **Reconnecting replaces, never duplicates.** One record per provider ID; a new
  key overwrites the old record and the old session.
- **Cached models are used on restore.** A reload does not need a network call to
  list models. A revoked key surfaces as an error on the next request or **Test**,
  not as a silent disconnection.

What this does and does not protect against: the record is readable by anything
running on this origin and by someone with access to this browser profile. It is
not encryption against the device owner, and storage is per browser profile and
per origin. Use a dedicated, restricted key and revoke it if the profile may be
shared.

## The relay, and what it changes

Some OpenAI-compatible services cannot be called from a browser at all: they send
`Access-Control-Allow-Origin` on the preflight but not on the real response, so the
browser discards a response the server actually produced. `100milionseek.top` is
one of them.

For those, a compatible provider can be added with **"Send requests through this
app's relay"** enabled. Requests then go to this app's own origin and the server
forwards them. This is opt-in per provider, chosen while adding it, and stated in
the form.

What stays true:

- The key is still only typed by the user and forwarded from this browser. The
  relay forwards the caller's `Authorization` header unchanged and holds no key
  of its own.
- The relay derives nothing from stored state; the target comes from the request.
- Keys and upstream URLs never appear in relay error messages or logs.

What changes:

| Aspect | Browser-direct | Through the relay |
| --- | --- | --- |
| Path of the key | browser → provider | browser → this app's server → provider |
| Who can see the key | the browser's owner | the browser's owner **and** the server operator |
| Ceremony | none | explicit checkbox when adding the provider |

Because the key now transits the server, the relay must not log request headers or
bodies. It must also not become an open proxy: it re-validates the target
server-side, rejects loopback, private, link-local, and internal hosts, and allows
only `GET` and `POST`. Anything stricter (per-account allow-lists, egress rules)
belongs at the network layer; see the SSRF note below.

If you do not want a key touching the server at all, leave the relay off and use a
provider that sets CORS headers — OpenAI, OpenRouter, Groq, DeepSeek, Together, or
Gemini all do.


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

Because credentials can be present in browser memory and in this origin's
IndexedDB, the app must not let untrusted content execute scripts on its origin.
Assistant output is rendered through `react-markdown` with `remark-gfm` and no raw
HTML rehype plugin, so generated Markdown cannot inject script tags.

Use dedicated keys restricted to the relevant API, monitor their usage, and revoke
them if exposed. The settings screen discloses direct browser access and
device-stored credentials, and the relay is an explicit opt-in per provider rather
than a silent fallback: the app must never quietly upload a BYOK key to an
application backend. When the relay is enabled the key does reach this app's
server, which must therefore be treated as trusted for that key.

## References

- [Gemini API models and methods](https://ai.google.dev/api/models)
- [Google API key best practices](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices)
- [OpenAI API reference](https://developers.openai.com/api/reference/overview)
