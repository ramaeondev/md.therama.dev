import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";

export type MarkdownEditorHandle = {
  format: (prefix: string, suffix?: string) => void;
  jumpToHeading: (text: string) => void;
};

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  fontSize: number;
  wordWrap: boolean;
};

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(
  { value, onChange, fontSize, wordWrap },
  forwardedRef,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

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
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
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
      view.destroy();
      viewRef.current = null;
    };
  }, [fontSize, wordWrap]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  useImperativeHandle(forwardedRef, () => ({
    format(prefix, suffix = "") {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to);
      view.dispatch({
        changes: { from, to, insert: `${prefix}${selected || (suffix ? "text" : "")}${suffix}` },
        selection: { anchor: from + prefix.length, head: from + prefix.length + selected.length },
        scrollIntoView: true,
      });
      view.focus();
    },
    jumpToHeading(text) {
      const view = viewRef.current;
      if (!view) return;
      const line = view.state.doc.toString().split("\n").findIndex((item) => item.replace(/^#{1,6}\s+/, "").trim() === text);
      if (line < 0) return;
      const position = view.state.doc.line(line + 1).from;
      view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: "start" }) });
      view.focus();
    },
  }), []);

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden" aria-label="Markdown editor" />;
});