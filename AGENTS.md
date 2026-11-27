## Workspace architecture

- Keep workspace and document ownership browser-local through a `DocumentStorageAdapter`; provider network access stays isolated in replaceable adapters, outside workspace persistence and state.
- Keep persistence, workspace state/operations, Markdown editing/rendering, and workspace presentation in separate feature modules to support independent evolution.
- Keep AI provider contracts and adapters in browser-safe feature modules behind a provider registry; BYOK credentials live in provider sessions and are persisted only by `providerCredentialStorage` so a refresh keeps providers connected, never by an adapter and never in workspace storage.
- The compatible-provider relay (`src/features/ai/server/compatibleRelay.ts`) is the only place a provider key may transit the server. It must stay opt-in per provider, forward the caller's own credentials without storing or injecting any, and re-validate the upstream target server-side.
- Keep provider configuration and assistant chat orchestration in separate browser-safe services; persist only provider/model preferences and keep BYOK sessions and active requests in memory so credentials never enter workspace storage.
