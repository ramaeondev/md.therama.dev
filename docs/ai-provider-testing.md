# AI provider testing

## Running the suites

```bash
npx vitest run                      # everything
npx vitest run src/features/ai      # provider, settings, assistant, usage
npx tsc --noEmit                    # type check
```

Automated tests never call a real provider: every request is served by a stubbed
`fetch`. Real-key verification is a manual step (see the end of this document).

## Coverage by file

| File | Covers |
| --- | --- |
| `providers/providers.test.ts` | Provider foundation and the full Gemini adapter (unchanged) |
| `providers/openai.test.ts` | OpenAI adapter, SSE parser, model catalogue, endpoint validation, relay targeting |
| `providers/registry.test.ts` | Registry resolution, credential isolation, provider switching, compatible providers |
| `server/compatibleRelay.test.ts` | Relay forwarding, SSRF rejection, header hygiene, SSE pass-through |
| `settings/ProviderSettingsPanel.test.tsx` | Provider settings UI for all three categories |
| `assistant/chatService.test.ts` | Gemini streaming, usage lifecycle, cancellation (unchanged) |
| `assistant/AssistantPanel.test.tsx` | Conversation UI, per-message provider attribution, switching between turns |
| `usage/usageStore.test.ts` | Usage lifecycle and summary math (unchanged) |

## What the OpenAI adapter tests assert

**Contract and configuration**

- Empty key is rejected before a session exists.
- Descriptor capabilities match the existing provider contract.
- Bearer token and exact endpoint URLs are sent.

**Model discovery**

- Chat models are discovered with `availability: "available"`.
- Embedding, whisper, TTS, image, and moderation models are excluded.
- Unrecognised IDs are listed but marked `textGeneration: false`.
- No context window or token limit is invented.
- Chat-capable models sort first.

**Generation**

- System instruction, history, and roles map correctly.
- `temperature` and `max_tokens` are sent for normal models and omitted for
  reasoning models.
- Usage maps to `inputTokens`/`outputTokens`/`totalTokens`.
- An empty or malformed model ID fails before any network call.

**Streaming**

- `stream: true` with `stream_options.include_usage` is requested.
- Text deltas become `text` events; reasoning deltas are ignored.
- A usage-only final chunk with empty `choices` yields a `usage` event.
- No usage event when the provider reports none.
- Malformed JSON and a broken connection both fail with `stream_interrupted`.
- Abort propagates as `AbortError`.
- A server rejecting `stream_options` is retried once without it.

**SSE parser**

- Events split across reads and multiple events in one read.
- CRLF, LF, and bare CR endings.
- A multi-byte character split across reads.
- Multi-line `data:` fields, comments, and other fields.
- A final event with no trailing blank line.

**Errors**

- 401, 403, 429 rate limit, 429 quota, 400, 404, and 5xx map to existing codes.
- Quota exhaustion is distinguished from rate limiting on the same status.
- Network failure becomes `network_error`.
- Provider messages and keys never appear in thrown errors.

**Endpoint safety**

- HTTPS and loopback HTTP accepted; plain remote HTTP rejected.
- Private, link-local, and internal hosts rejected.
- Credentials in the URL rejected; query and fragment stripped.

## Registry and switching tests

- Both built-in adapters register and resolve independently.
- Gemini and OpenAI connect simultaneously; both keys stay live.
- Each session sends only its own header (`x-goog-api-key` vs `authorization`).
- One provider failing does not disturb the other.
- Disconnecting a provider makes it unselectable while the other keeps working.
- A conversation started on Gemini continues on OpenAI with history preserved.
- Usage records carry the correct provider and model.
- Each assistant message keeps the provider/model that produced it.
- The conversation record reflects the latest reply's provider.

## Compatible-provider tests

- Stable, registry-unique instance IDs are derived from display names.
- 100milionseek connects via a custom base URL, discovers models, and streams.
- The definition persists but the API key never appears in storage.
- Saved instances re-register after a simulated reload.
- Removing an instance unregisters its adapter.
- An unsafe endpoint is rejected at creation and skipped at load.

## UI tests

- Gemini and OpenAI appear as independent cards with masked key fields.
- Connecting sends the key, then clears the field.
- A missing key shows a validation message instead of calling out.
- Both providers can be connected; the active one is marked.
- Selecting a model and switching providers call the right handlers.
- An unconfirmed model is labelled "untested", never "chat".
- Clearing one provider's key does not affect the other.
- A provider error is shown without any key text in the DOM.
- The compatible-provider form validates required fields and adds the provider.
- A saved compatible provider can be removed after confirmation.

## Manual verification with real keys

Not part of CI. Use a dedicated, restricted key in a controlled environment.
Run these in the browser, not from Node: only the browser enforces CORS.

1. Connect Gemini and generate a response.
2. Connect OpenAI and generate a response.
3. Switch Gemini → OpenAI inside one conversation.
4. Switch OpenAI → Gemini.
5. Stop a streaming response mid-flight.
6. Try an invalid OpenAI key.
7. Try a model the key cannot access.
8. Interrupt the network during a stream.
9. Add a compatible provider and stream a reply.
10. Reload the page: the provider definition survives, the key must be re-entered.
11. Add the same provider with the relay enabled and confirm it connects and
    streams where the direct attempt failed.

### Relay checks

These run against a real server, not a mocked `fetch`:

```bash
KEY=...                       # the user's own key, never committed
BASE=http://localhost:8081    # the dev server

# Models through the relay
curl -sS -H "authorization: Bearer $KEY" \
  -H "x-compat-upstream: https://100milionseek.top/v1" \
  "$BASE/api/compat/models"

# Streaming must arrive incrementally, not in one buffered burst
curl -sS -N -H "authorization: Bearer $KEY" -H "content-type: application/json" \
  -H "x-compat-upstream: https://100milionseek.top/v1" \
  -d '{"model":"deepseek-v4.1-flash-free","messages":[{"role":"user","content":"Count 1 to 20"}],"stream":true,"stream_options":{"include_usage":true}}' \
  "$BASE/api/compat/chat/completions"
```

Each of these must be rejected with `400` and no upstream call:

```bash
-H "x-compat-upstream: http://localhost:11434/v1"     # loopback
-H "x-compat-upstream: https://192.168.1.10/v1"       # private
-H "x-compat-upstream: https://169.254.169.254/"      # link-local / metadata
-H "x-compat-upstream: http://api.example.com/v1"     # plain http
-H "x-compat-upstream: https://u:p@api.example.com/v1" # embedded credentials
```

`DELETE` on the relay path must return `405`.

To check the built Worker (since `vite preview` serves the wrong directory):

```bash
node -e '
const m = await import("./.output/server/index.mjs");
const w = m.default ?? m;
const res = await w.fetch(new Request("http://x/api/compat/models", {
  headers: {
    authorization: `Bearer ${process.env.KEY}`,
    "x-compat-upstream": "https://100milionseek.top/v1",
  },
}), {}, { waitUntil() {}, passThroughOnException() {} });
console.log(res.status, (await res.text()).slice(0, 120));
'
```

Before step 9, confirm the endpoint sends `Access-Control-Allow-Origin` on the
actual `POST` and on the streamed response, not just on `OPTIONS`:

```bash
curl -sS -o /dev/null -D - -X OPTIONS \
  -H "Origin: https://md.therama.dev" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  "$BASE/v1/chat/completions" | grep -i access-control

curl -sS -o /dev/null -D - \
  -H "Origin: https://md.therama.dev" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"'"$MODEL"'","messages":[{"role":"user","content":"hi"}]}' \
  "$BASE/v1/chat/completions" | grep -i access-control
```

The second command must also print `access-control-allow-origin`. If it does not,
the provider cannot be used browser-direct regardless of any passing test.

## Known limitations

- Automated tests use mocked `fetch`; real provider drift is caught only manually.
- Automated tests cannot observe CORS: a stubbed `fetch` never enforces browser
  origin rules, so an endpoint that answers `OPTIONS` but omits
  `Access-Control-Allow-Origin` on real responses passes every test and still
  fails in the browser as `network_error`. This is what the relay exists for, and
  it means the relay itself must be exercised over a real server: the unit tests
  cover the handler, but the built Worker has to be verified separately.
- `vite preview` cannot serve this app's built output (it looks for `dist/server/`
  while the build writes `.output/`), so verify the production Worker by importing
  `.output/server/index.mjs` and calling `fetch` on it, or by deploying.
- Compatible providers are not guaranteed to implement every OpenAI option. The
  adapter assumes Chat Completions and SSE only, and retries once without
  `stream_options` if it is rejected.
- Token usage is reported only when the provider sends it; an interrupted stream
  leaves it unavailable by design.
- SSRF protection in the relay is host-based and cannot resolve DNS rebinding; a
  production deployment should also restrict egress at the network layer.

