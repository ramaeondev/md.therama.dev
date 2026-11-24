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
| `providers/openai.test.ts` | OpenAI adapter, SSE parser, model catalogue, endpoint validation |
| `providers/registry.test.ts` | Registry resolution, credential isolation, provider switching, compatible providers |
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

Not part of CI. Use a dedicated, restricted key in a controlled environment:

1. Connect Gemini and generate a response.
2. Connect OpenAI and generate a response.
3. Switch Gemini → OpenAI inside one conversation.
4. Switch OpenAI → Gemini.
5. Stop a streaming response mid-flight.
6. Try an invalid OpenAI key.
7. Try a model the key cannot access.
8. Interrupt the network during a stream.
9. Add a compatible provider (for example 100milionseek) and stream a reply.
10. Reload the page: the provider definition survives, the key must be re-entered.

## Known limitations

- Automated tests use mocked `fetch`; real provider drift is caught only manually.
- Compatible providers are not guaranteed to implement every OpenAI option. The
  adapter assumes Chat Completions and SSE only, and retries once without
  `stream_options` if it is rejected.
- Token usage is reported only when the provider sends it; an interrupted stream
  leaves it unavailable by design.
- SSRF protection is host-based and cannot resolve DNS rebinding; a production
  deployment should enforce this server-side.
