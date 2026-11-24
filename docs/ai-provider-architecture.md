# AI provider architecture

## Contract and registry

`src/features/ai/providers/types.ts` defines provider capabilities, model metadata, requests, reported usage, and the adapter/session contracts. `ProviderRegistry` registers and resolves adapters by stable provider ID; application code should depend on sessions resolved through this registry, not provider-specific HTTP methods.

Adapters expose connection checks, model discovery, one-shot generation, and async text streaming. Provider errors are converted to `ProviderError` codes with safe user-facing messages; raw provider error bodies and credentials are not included in errors.

`src/features/ai/settings/providerConfiguration.ts` owns the active browser-memory session and resolves the registered adapter. It exposes safe model/connection results to settings, and disconnecting also aborts tracked assistant requests. The settings UI persists only the selected provider and model ID through workspace preferences; it never persists the API key.

`src/features/ai/assistant/chatService.ts` resolves the active adapter through the registry and delegates streaming through the shared provider session. It exposes two entry points: `streamAssistantReply` yields text only, and `streamAssistantReplyEvents` yields text plus a terminal `done` event carrying provider-reported usage. Both record a usage entry per request. `AssistantPanel` owns the visible conversation and persists terminal messages through `conversationStore`.

## Conversations

`conversationTypes.ts` defines `Conversation` and `ConversationMessage`. A conversation belongs to a workspace, may reference a document, and records the provider and model used. A message carries `role`, `content`, `status` (`complete` | `interrupted` | `failed`), a monotonic `sequence` for stable ordering, and optional provider-reported `usage`. No message or conversation record contains a credential.

`conversationStorage.ts` is the repository over the `conversations`, `messages`, and `app-meta` stores; `conversationStore.ts` is the only module that writes conversations and messages and is what the UI calls. Streaming text is buffered in component state and written exactly once when the request reaches a terminal state, so an interrupted request cannot leave duplicated or half-written assistant rows. A user's stopped generation is stored as `interrupted` with the partial text that arrived.

## Usage tracking

`src/features/ai/usage/` tracks usage independently of any provider. `startUsageRequest` opens a request lifecycle and settles it exactly once as `completed`, `interrupted`, or `failed`; a stopped or failed request is never counted as a completed success. Records store `usageSource`:

- `provider_reported` — counts came from the provider.
- `estimated` — a caller explicitly supplied a heuristic value.
- `unavailable` — the provider returned no usage; counts stay `null` rather than being invented.

Dashboard totals sum `provider_reported` records only. `estimate.ts` provides a rough character-based hint and is never used to fill stored provider fields. `UsageDashboard` renders the totals, per-provider and per-model breakdowns, recent requests, and failure counts in Settings under **AI usage**; it is informational and enforces no quota.

## Storage schema

`src/lib/indexedDb.ts` owns the single database connection and its version history. Version 1 stored `workspace-state`; version 2 adds `conversations`, `messages`, `ai-usage`, and `app-meta` with their indexes. Migrations are additive and never clear or drop a store, so existing workspaces, documents, and settings survive an upgrade. A failed upgrade aborts its transaction, leaving the previous version and its data intact.


## Gemini adapter

The initial registry contains Google Gemini. Its adapter uses the Gemini REST `models.list`, `generateContent`, and `streamGenerateContent` methods, reads model capabilities and token limits from discovery, and reports usage only when returned by the provider. Models are identified as dynamically discovered; no fallback catalog is presented as live data.

Each call to `initialize` creates an isolated in-memory session. The session retains its BYOK key only in a closure and sends it in the `x-goog-api-key` header. The adapter does not persist provider settings or credentials. Browser-direct key risks and handling guidance are documented in [BYOK security](./byok-security.md).

## Adding an adapter

Implement the `AIProvider` descriptor and `initialize` method in a provider-specific module, normalize all failures with the shared error contract, and register it in `createDefaultProviderRegistry`. Preserve the common request/model types; add optional capabilities rather than branching provider HTTP behavior into assistant or workspace UI code.

Optionally implement `streamTextEvents` alongside `streamText` to surface provider-reported token usage during streaming. When an adapter omits it, usage is recorded as unavailable rather than estimated.

OpenAI remains a later Milestone 2 phase.