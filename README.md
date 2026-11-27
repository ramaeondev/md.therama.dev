# Markdown Meadow Workspace

> **Note:** This file is the original build brief and no longer matches the shipped
> application (it lists providers, storage behaviour, and UI controls that do not
> exist). For an accurate, source-derived description of every feature, see
> [`docs/features.md`](docs/features.md), which also records each specific
> discrepancy under "Documentation drift".

Build: Markdown AI Workspace – Foundation

Build a modern, premium, developer-focused web application called Markdown AI Workspace.

Product Vision
An AI-powered knowledge workspace built around Markdown. Users can manage Markdown documents, organize workspaces, edit and preview content, and eventually interact with their entire documentation using configurable AI providers.

The application must be designed around three principles:
1. Markdown files are the primary source of truth.
2. Users own and control their documents.
3. AI providers and models must be interchangeable through a provider-independent architecture.

Technology
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- CodeMirror 6 for Markdown editing
- React Markdown for rendering
- IndexedDB for local persistence (e.g. Dexie.js or native IndexedDB wrapper)
Use clean, reusable components and a modular feature-based architecture.

Application Layout
Create a three-panel desktop application:
1. Left Sidebar – Workspace Explorer
- Workspace switcher
- Create workspace
- Create Markdown file
- Create folders
- Nested file explorer with expand/collapse
- Rename, delete, and duplicate files
- Search files
- Recently opened documents
- AI-generated documents folder

2. Center – Markdown Editor
- Tab-based document navigation
- CodeMirror Markdown editor
- Live preview
- Split editor and preview
- Full-screen editing toggle
- Markdown formatting toolbar (bold, italic, headings, lists, quotes, tables, code)
- Heading navigation / Outline view
- Syntax highlighting
- Mermaid code block support
- Autosave indicator
- Word count and character count
- Provide three viewing modes: Editor only, Preview only, and Split view

3. Right Sidebar – AI Assistant
Build the complete visual interface, but do not connect AI APIs yet.
Include:
- Conversation interface with clean message feed
- Message input
- Conversation history
- New conversation button
- Document context selector (attach current document or workspace)
- Workspace context selector
- Selected AI provider/model display pill/badge
- Suggested prompt pills:
  * Summarize this document
  * Explain this section
  * Find potential issues
  * Generate documentation
  * Rephrase selected text
- Make the interface structured and ready for future streaming AI responses

Settings Modal / View
Create a settings area with sections for:
- General preferences (theme, auto-save delay)
- Editor preferences (font size, line wrapping, tab size)
- AI providers (Gemini, OpenAI, Anthropic, OpenRouter, Ollama, custom OpenAI-compatible endpoint)
- AI model selection
- Storage and synchronization status
Design the AI provider settings to accept API keys and endpoints securely in local storage.

Design Direction
- Professional, minimal, modern developer-tool aesthetic (inspired by Obsidian and modern IDEs).
- Dark theme as default (with clean light theme support).
- Neutral dark backgrounds, subtle borders, crisp typography.
- Compact navigation and resizable panels.
- Keyboard-friendly interactions.
- Avoid making the interface look like a generic AI chatbot; Markdown editor is the central focus with AI as an integrated side assistant.

Functional Requirements
Implement real functionality for:
- Creating and switching workspaces.
- Creating and editing Markdown files.
- Creating nested folders.
- Opening multiple documents in tabs.
- Live Markdown preview and synchronized split view.
- Local persistence using IndexedDB (persisting workspaces, folders, documents, and active tab states across browser reloads).
- Importing Markdown files (.md, .markdown, .txt) via file picker and drag-and-drop.
- Exporting Markdown files and exporting the workspace.
- Basic document search.
- Autosaving document changes with visual indicator.

Architecture Requirements
Maintain modular boundaries:
- Workspace management
- Document management
- Markdown editor & preview
- Local persistence adapter (DocumentStorageAdapter decoupled from UI)
- AI assistant UI and provider configuration interfaces (AIProvider decoupled from React components)
Do not hardcode mock AI responses as if they were real AI functionality. Provide pre-seeded sample workspace with starter markdown documentation to showcase the editor immediately.

This project was built with [Lovable](https://lovable.dev).

## Local MCP server

The optional Node MCP server lives in [`mcp/`](./mcp/README.md). It uses the
local folder storage mode and MCP stdio; it does not use Supabase or a remote
MCP endpoint. MCP writes are disabled by default and can be enabled in the
client configuration.

**Live app**: https://markdown-meadow-workspace.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9eb14dfb-e6fe-45de-916b-8c7815e64281).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
