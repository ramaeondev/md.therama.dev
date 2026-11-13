# Markdown AI Workspace Foundation

## Build
- Replace the placeholder home screen with a local-first Markdown workspace: explorer, document tabs/editor/preview, and an AI assistant panel.
- Add a modular IndexedDB adapter and workspace/document state for folders, documents, recent files, active tabs, autosave, import/export, search, and workspace switching.
- Add Markdown rendering with outline navigation, editor formatting controls, Mermaid support, and editor/preview/split modes.
- Add settings for appearance/editor preferences and an AI provider/model configuration interface; keep provider calls disconnected and clearly distinguish configuration from AI functionality.
- Seed a starter workspace and documents on first run, while preserving the user’s browser-owned content thereafter.
- Add route metadata, semantic dark/light design tokens, small behavior tests, and document the architecture decision.

## Technical approach
- Keep the app on TanStack Start and the existing shadcn/Tailwind setup.
- Use CodeMirror 6 for the editor, React Markdown for rendering, Mermaid for diagram blocks, and a browser IndexedDB adapter behind a storage interface.
- Keep workspace management, Markdown/editor presentation, persistence, and provider configuration in separate feature modules; use browser APIs only after client hydration.
