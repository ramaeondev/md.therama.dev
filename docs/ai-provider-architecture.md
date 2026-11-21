# AI provider architecture

## Contract and registry

`src/features/ai/providers/types.ts` defines provider capabilities, model metadata, requests, reported usage, and the adapter/session contracts. `ProviderRegistry` registers and resolves adapters by stable provider ID; application code should depend on sessions resolved through this registry, not provider-specific HTTP methods.

Adapters expose connection checks, model discovery, one-shot generation, and async text streaming. Provider errors are converted to `ProviderError` codes with safe user-facing messages; raw provider error bodies and credentials are not included in errors.

`src/features/ai/settings/providerConfiguration.ts` owns the active browser-memory session and resolves the registered adapter. It exposes safe model/connection results to settings, and disconnecting also aborts tracked assistant requests. The settings UI persists only the selected provider and model ID through workspace preferences; it never persists the API key.

`src/features/ai/assistant/chatService.ts` resolves the active adapter through the registry and delegates streaming through the shared provider session. `AssistantPanel` owns only the current page-session conversation and streams each chunk into the active response. Persistent conversations and usage tracking remain Phase F.

## Gemini adapter

The initial registry contains Google Gemini. Its adapter uses the Gemini REST `models.list`, `generateContent`, and `streamGenerateContent` methods, reads model capabilities and token limits from discovery, and reports usage only when returned by the provider. Models are identified as dynamically discovered; no fallback catalog is presented as live data.

Each call to `initialize` creates an isolated in-memory session. The session retains its BYOK key only in a closure and sends it in the `x-goog-api-key` header. The adapter does not persist provider settings or credentials. Browser-direct key risks and handling guidance are documented in [BYOK security](./byok-security.md).

## Adding an adapter

Implement the `AIProvider` descriptor and `initialize` method in a provider-specific module, normalize all failures with the shared error contract, and register it in `createDefaultProviderRegistry`. Preserve the common request/model types; add optional capabilities rather than branching provider HTTP behavior into assistant or workspace UI code.

OpenAI remains a later Milestone 2 phase. Conversation persistence and usage tracking are deferred to Phase F.