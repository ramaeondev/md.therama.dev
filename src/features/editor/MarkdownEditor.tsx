import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { Decoration, EditorView, WidgetType, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";

type CompletionSuggestion = { pos: number; text: string };
const setCompletion = StateEffect.define<CompletionSuggestion>();
const clearCompletion = StateEffect.define<void>();

class CompletionWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  override eq(other: CompletionWidget): boolean {
    return this.text === other.text;
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-ai-completion";
    wrapper.setAttribute("aria-hidden", "true");
    const suggestion = document.createElement("span");
    suggestion.textContent = this.text;
    wrapper.append(suggestion);
    const hint = document.createElement("span");
    hint.className = "cm-ai-completion-hint";
    hint.textContent = "  Tab to accept · Esc to dismiss";
    wrapper.append(hint);
    return wrapper;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

const completionField = StateField.define<CompletionSuggestion | null>({
  create: () => null,
  update(value, transaction) {
    const selectionChanged =
      transaction.selection !== undefined &&
      !transaction.selection.eq(transaction.startState.selection);
    let next =
      transaction.docChanged || selectionChanged ? null : value;
    for (const effect of transaction.effects) {
      if (effect.is(setCompletion)) next = effect.value;
      else if (effect.is(clearCompletion)) next = null;
    }
    return next;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (suggestion) =>
      suggestion
        ? Decoration.set([
            Decoration.widget({ widget: new CompletionWidget(suggestion.text), side: 1 }).range(
              suggestion.pos,
            ),
          ])
        : Decoration.none,
    ),
});

export type MarkdownEditorHandle = {
  format: (prefix: string, suffix?: string) => void;
  insertText: (text: string) => void;
  jumpToHeading: (text: string, headingPath?: string[]) => void;
  requestCompletion: () => Promise<void>;
  clearCompletion: () => void;
};

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  fontSize: number;
  wordWrap: boolean;
  onRequestCompletion?: (prefix: string, suffix: string, signal: AbortSignal) => Promise<string>;
  onCompletionStatusChange?: (status: "idle" | "loading" | "suggested") => void;
  onCompletionError?: (error: unknown) => void;
};

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    { value, onChange, fontSize, wordWrap, onRequestCompletion, onCompletionStatusChange, onCompletionError },
    forwardedRef,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const changeRef = useRef(onChange);
    const completionProviderRef = useRef(onRequestCompletion);
    const completionStatusRef = useRef(onCompletionStatusChange);
    const completionErrorRef = useRef(onCompletionError);
    const completionControllerRef = useRef<AbortController | null>(null);
    changeRef.current = onChange;
    completionProviderRef.current = onRequestCompletion;
    completionStatusRef.current = onCompletionStatusChange;
    completionErrorRef.current = onCompletionError;

    async function requestCompletion(view: EditorView): Promise<void> {
      const provider = completionProviderRef.current;
      if (!provider) return;
      const selection = view.state.selection.main;
      if (selection.from !== selection.to) {
        completionErrorRef.current?.(new Error("Place the cursor without selecting text to get a completion."));
        return;
      }
      completionControllerRef.current?.abort();
      const controller = new AbortController();
      completionControllerRef.current = controller;
      const originalDoc = view.state.doc.toString();
      const originalPos = selection.head;
      const prefix = view.state.sliceDoc(Math.max(0, originalPos - 4000), originalPos);
      const suffix = view.state.sliceDoc(originalPos, Math.min(view.state.doc.length, originalPos + 1200));
      view.dispatch({ effects: clearCompletion.of(undefined) });
      completionStatusRef.current?.("loading");
      try {
        const text = await provider(prefix, suffix, controller.signal);
        if (controller.signal.aborted) return;
        const currentSelection = view.state.selection.main;
        if (
          !text ||
          view.state.doc.toString() !== originalDoc ||
          currentSelection.from !== originalPos ||
          currentSelection.to !== originalPos
        ) {
          completionStatusRef.current?.("idle");
          return;
        }
        view.dispatch({ effects: setCompletion.of({ pos: originalPos, text }) });
        completionStatusRef.current?.("suggested");
      } catch (error) {
        if (!controller.signal.aborted) {
          completionStatusRef.current?.("idle");
          completionErrorRef.current?.(error);
        }
      } finally {
        if (completionControllerRef.current === controller) completionControllerRef.current = null;
      }
    }

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      const view = new EditorView({
        state: EditorState.create({
          doc: value,
          extensions: [
            lineNumbers(),
            highlightActiveLine(),
            history(),
            markdown(),
            completionField,
            keymap.of([
              {
                key: "Mod-Shift-Space",
                run: (editor) => {
                  void requestCompletion(editor);
                  return true;
                },
              },
              {
                key: "Tab",
                run: (editor) => {
                  const suggestion = editor.state.field(completionField);
                  if (!suggestion) return false;
                  completionControllerRef.current?.abort();
                  editor.dispatch({
                    changes: { from: suggestion.pos, to: suggestion.pos, insert: suggestion.text },
                    selection: { anchor: suggestion.pos + suggestion.text.length },
                    effects: clearCompletion.of(undefined),
                    scrollIntoView: true,
                  });
                  completionStatusRef.current?.("idle");
                  return true;
                },
              },
              {
                key: "Escape",
                run: (editor) => {
                  if (!editor.state.field(completionField)) return false;
                  completionControllerRef.current?.abort();
                  editor.dispatch({ effects: clearCompletion.of(undefined) });
                  completionStatusRef.current?.("idle");
                  return true;
                },
              },
              ...defaultKeymap,
              ...historyKeymap,
              indentWithTab,
            ]),
            EditorView.theme({
              ".cm-ai-completion": {
                color: "var(--muted-foreground)",
                opacity: "0.72",
                whiteSpace: "pre-wrap",
                pointerEvents: "none",
              },
              ".cm-ai-completion-hint": {
                color: "var(--primary)",
                opacity: "0.9",
                fontSize: "0.75em",
              },
            }),
            EditorView.updateListener.of((update) => {
              if (update.docChanged || update.selectionSet) {
                const hadCompletion =
                  Boolean(update.startState.field(completionField)) ||
                  Boolean(completionControllerRef.current);
                completionControllerRef.current?.abort();
                if (hadCompletion) completionStatusRef.current?.("idle");
              }
              if (update.docChanged) changeRef.current(update.state.doc.toString());
            }),
            EditorView.theme({
              "&": { height: "100%", fontSize: `${fontSize}px` },
              ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-mono)" },
              ".cm-content": { padding: "28px 28px 80px", lineHeight: "1.8" },
              ".cm-gutters": { border: "none", paddingLeft: "10px" },
              ".cm-lineNumbers .cm-gutterElement": { minWidth: "42px" },
              ".cm-activeLineGutter": { backgroundColor: "transparent" },
            }),
            ...(wordWrap ? [EditorView.lineWrapping] : []),
            ...(document.documentElement.classList.contains("dark") ? [oneDark] : []),
          ],
        }),
        parent: host,
      });
      viewRef.current = view;
      return () => {
        completionControllerRef.current?.abort();
        view.destroy();
        viewRef.current = null;
      };
    }, [fontSize, wordWrap]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view || view.state.doc.toString() === value) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }, [value]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        requestCompletion() {
          const view = viewRef.current;
          if (!view) return Promise.resolve();
          view.focus();
          return requestCompletion(view);
        },
        clearCompletion() {
          const view = viewRef.current;
          completionControllerRef.current?.abort();
          if (view?.state.field(completionField)) {
            view.dispatch({ effects: clearCompletion.of(undefined) });
          }
          completionStatusRef.current?.("idle");
        },
        insertText(text) {
          const view = viewRef.current;
          if (!view || !text) return;
          const { from, to } = view.state.selection.main;
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
            scrollIntoView: true,
          });
          view.focus();
        },
        format(prefix, suffix = "") {
          const view = viewRef.current;
          if (!view) return;
          const { from, to } = view.state.selection.main;
          const selected = view.state.sliceDoc(from, to);
          view.dispatch({
            changes: {
              from,
              to,
              insert: `${prefix}${selected || (suffix ? "text" : "")}${suffix}`,
            },
            selection: {
              anchor: from + prefix.length,
              head: from + prefix.length + selected.length,
            },
            scrollIntoView: true,
          });
          view.focus();
        },
        jumpToHeading(text, headingPath) {
          const view = viewRef.current;
          if (!view) return;
          const headings: string[] = [];
          const lines = view.state.doc.toString().split("\n");
          const line = lines.findIndex((item) => {
            const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(item);
            if (!match) return false;
            const level = match[1]?.length ?? 1;
            const title = (match[2] ?? "").replace(/[`*_~]/g, "").trim();
            headings.length = Math.max(0, level - 1);
            headings.push(title);
            return headingPath
              ? headings.length === headingPath.length &&
                  headings.every((heading, index) => heading === headingPath[index])
              : title === text;
          });
          if (line < 0) return;
          const position = view.state.doc.line(line + 1).from;
          view.dispatch({
            selection: { anchor: position },
            effects: EditorView.scrollIntoView(position, { y: "start" }),
          });
          view.focus();
        },
      }),
      [],
    );

    return (
      <div ref={hostRef} className="h-full min-h-0 overflow-hidden" aria-label="Markdown editor" />
    );
  },
);
