# OpenAI provider integration

Phase C adds OpenAI as the second native provider and makes the adapter layer
model-agnostic through a generic OpenAI-compatible provider.

## Files

| File | Responsibility |
| --- | --- |
| `src/features/ai/providers/shared/openAiCompatible.ts` | Shared Chat Completions transport: request mapping, SSE, usage, errors |
| `src/features/ai/providers/shared/sseParser.ts` | Incremental SSE parser for OpenAI-style streams |
| `src/features/ai/providers/shared/modelCatalog.ts` | Chat-capability classification for discovered model IDs |
| `src/features/ai/providers/openai.ts` | Official OpenAI adapter |
| `src/features/ai/providers/openaiCompatible.ts` | Generic adapter factory for compatible services |
| `src/features/ai/settings/customProviderStorage.ts` | Persists compatible-provider definitions in `app-meta` |
| `src/features/ai/settings/ProviderSettingsPanel.tsx` | Provider settings UI for all three categories |

## Endpoints

| Purpose | Endpoint |
| --- | --- |
| Model discovery | `GET {baseUrl}/models` |
| Chat + streaming | `POST {baseUrl}/chat/completions` |

Authentication is `Authorization: Bearer <api key>`. The official adapter uses
`https://api.openai.com/v1`; a compatible instance uses its configured base URL.

Chat Completions is implemented rather than the Responses API because it matches
the existing `AIProvider` contract. A future migration changes the OpenAI adapter
only.

## Request mapping

| Application concept | OpenAI parameter |
| --- | --- |
| Selected model | `model` |
| Conversation messages | `messages` (with `role: user` / `assistant`) |
| System instructions | `role: system` message |
| Streaming | `stream: true` |
| Usage reporting | `stream_options.include_usage` |
| Temperature | `temperature` — only when the model accepts sampling |
| Max output | `max_tokens` — only when the model accepts sampling |

Requests stay conservative. `temperature` and `max_tokens` are omitted for
reasoning models (`o*`, `*-thinking`, `*-reasoning`), which reject sampling
parameters, and nothing is sent that the caller did not ask for.

If a compatible server rejects `stream_options`, the adapter retries the stream
once without it so streaming still works.

## Response and stream mapping

Non-streaming responses read `choices[0].message.content` and `usage`.
Streaming reads `choices[0].delta.content` and emits the shared `text` events;
`reasoning_content`/`reasoning` deltas are ignored so only answer text reaches
the assistant.

The shared stream contract is unchanged: `{ type: "text" }` events followed by at
most one `{ type: "usage" }` event. The assistant cannot tell which provider a
chunk came from.

## SSE handling

`SseParser` handles the cases a network stream actually produces:

- several events in one read,
- one event split across reads,
- a multi-byte UTF-8 character split across reads (`TextDecoder` with `stream`),
- CRLF, LF, and bare CR line endings,
- multi-line `data:` fields, comments, and `event:`/`id:` fields,
- a final event with no trailing blank line,
- `[DONE]` termination.

A malformed JSON payload fails with `stream_interrupted` rather than being
silently skipped, so a corrupt stream is never presented as a complete answer.

## Usage extraction

OpenAI reports `prompt_tokens`, `completion_tokens`, and `total_tokens`, mapped to
`inputTokens`, `outputTokens`, and `totalTokens` with
`source: "provider_reported"`.

The usage-only final chunk legitimately has an empty `choices` array; it is
accepted, and usage is emitted after the text loop so it can never be dropped. An
interrupted stream that never delivers that chunk records usage as
`unavailable` — never zero and never estimated.

## Model discovery

`GET /models` returns identifiers without capability metadata. The catalogue in
`shared/modelCatalog.ts` classifies each ID:

| Classification | Result |
| --- | --- |
| `chat` | `availability: "available"`, `textGeneration: true` |
| `unknown` | `availability: "unknown"`, `textGeneration: false` |
| `unsupported` | Excluded from the list |

Known non-chat families (embeddings, whisper, TTS, image, moderation, realtime,
rerank) are excluded rather than advertised. Unrecognised IDs are listed but never
claimed as chat-capable, and the UI labels them "untested". No context-window,
pricing, or token-limit value is invented: discovery returns none, so the adapter
reports none.

Discovery is dynamic. A failed discovery never deletes a previously connected
provider's models; only that provider's state is affected.

## Error normalization

OpenAI errors map onto the existing `ProviderErrorCode` values — no parallel error
system.

| Condition | Code |
| --- | --- |
| HTTP 401 | `invalid_api_key` |
| HTTP 403 | `invalid_api_key` (authenticated but not permitted) |
| HTTP 404 / `model_not_found` | `unsupported_model` |
| HTTP 429 rate limit | `rate_limited` |
| HTTP 429 `insufficient_quota` | `quota_exceeded` |
| HTTP 400 | `invalid_request` |
| HTTP 5xx | `provider_unavailable` |
| Network failure | `network_error` |
| Abort | `AbortError` (cancellation) |
| Malformed SSE | `stream_interrupted` |

Rate limiting and quota exhaustion are distinguished by inspecting the error code
and body, not the status alone: the fix for one is waiting, for the other billing.

Raw provider bodies and authorization headers never reach user-facing messages or
logs.

## Provider switching

Sessions are keyed by provider ID. Connecting OpenAI does not disturb Gemini, and
disconnecting one provider aborts only that provider's tracked requests. Selecting
a provider that has no session is rejected, so a request can never be sent with a
missing key or another provider's credentials.

Switching providers mid-conversation changes the resolved session only: the same
message history is sent through the shared request contract. Each assistant reply
records the provider and model that actually served it (taken from the terminal
stream event, not from current UI state), so attribution survives later switches.

## Compatible providers

`createOpenAiCompatibleProvider` builds one adapter per configured service, with a
stable ID such as `openai-compatible:100milionseek`. Example configuration:

| Field | Value |
| --- | --- |
| Name | `100milionseek` |
| Base URL | `https://100milionseek.top/v1` |
| Model | `deepseek-v4.1-flash-free` |

The same adapter serves OpenRouter, Groq, DeepSeek, Together, Fireworks, Ollama,
LM Studio, and vLLM. Compatibility is not assumed to be full OpenAI equivalence:
capabilities are whatever the endpoint actually reports.

Only the definition (name, ID, base URL, optional paths, and whether the relay is
used) is persisted, in the existing `app-meta` store. The key is not stored, so it
is re-entered after a reload.

### CORS: direct calls vs. the relay

The browser requires `Access-Control-Allow-Origin` on **every** response,
including `POST` and the streamed response — not only on the `OPTIONS` preflight.
A server that answers the preflight but omits the header on the real response is
still unusable: the browser discards the response and `fetch` rejects with
`TypeError: Failed to fetch`, which the app reports as `network_error`.

`https://100milionseek.top` behaves exactly like that — `OPTIONS` returns
`access-control-allow-origin: *`, but `GET /v1/models`, `POST /v1/chat/completions`,
and even the keyless `/health` send no `Access-Control-Allow-Origin`. It works
from Node and is blocked from the browser.

Such a provider can still be used by ticking **"Send requests through this app's
relay"** when adding it. The adapter then targets `/api/compat/*` on this app's own
origin and sends the real endpoint in the `x-compat-upstream` header:

```
browser ──POST /api/compat/chat/completions──▶ this app's server ──▶ endpoint
         Authorization: Bearer <key>            (forwards the same headers)
         x-compat-upstream: https://…/v1
```

Endpoints that work browser-direct and need no relay: OpenAI, OpenRouter, Groq,
DeepSeek, Together, and Gemini. A local Ollama works directly once
`OLLAMA_ORIGINS` allows the app's origin.

### The relay

`src/features/ai/server/compatibleRelay.ts` forwards a request to
`upstream + path` and returns the upstream response unchanged.

- **The key is still the user's.** The caller's `Authorization` header is forwarded
  as-is. The relay holds no provider key of its own and never injects one, so it is
  a transport hop, not a credential store. It is still a change in trust: the key
  passes through this app's server instead of going browser → provider directly,
  which is why it is an explicit checkbox rather than an automatic fallback.
- **The upstream is re-validated server-side.** A browser-side check is a
  convenience; the relay can be called directly, so it validates the header itself
  and rejects loopback, private, link-local, and internal hosts. Loopback is
  allowed for direct browser calls (Ollama) but never through the relay, where it
  would mean the deployment's own network.
- **Streaming is passed through untouched.** The body is never read, buffered, or
  re-encoded, so SSE arrives incrementally; `firstChunkMs` measured 1 ms against
  the live endpoint. `content-encoding` is dropped so the edge does not compress
  an already-encoded body twice.
- **Request/response hygiene.** `host`, `origin`, `referer`, `cookie`,
  `accept-encoding`, and the upstream header are stripped from the request;
  `set-cookie`, `content-encoding`, `content-length`, and all `access-control-*`
  headers are stripped from the response, which is marked `cache-control: no-store`.
- **Only `GET` and `POST`** are forwarded; anything else gets `405`.
- Upstream status and body are preserved, so the adapter's existing error mapping
  (401 → `invalid_api_key`, `insufficient_quota` → `quota_exceeded`, …) works
  unchanged. Relay-level failures use `400` for a rejected endpoint and `502` for
  an unreachable one, and never include the URL or key in the message.



## Endpoint validation

Compatible endpoints are validated before an adapter is created:

- only `https:` and `http:` are accepted,
- remote endpoints must use HTTPS,
- URL-embedded credentials are rejected,
- private, link-local, and internal hosts are rejected to limit SSRF,
- loopback (`localhost`, `127.0.0.1`, `::1`) is allowed over HTTP for local runtimes,
- query strings and fragments are stripped.

A stored definition whose endpoint no longer validates is skipped at load rather
than becoming a live adapter.

## Security summary

- Keys are held in memory only; never in localStorage, IndexedDB, logs, or analytics.
- No application-owned OpenAI key exists.
- Authorization headers are never echoed in errors.
- Browser-direct BYOK remains an explicit MVP trade-off; see
  [BYOK security](./byok-security.md).
- Assistant output is rendered through `react-markdown` without raw HTML, so
  generated Markdown cannot execute scripts on the application origin.
