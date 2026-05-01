import { useEffect, useRef } from "react";
import { useEditorStore } from "../EditorContext";

const COMMIT_DEBOUNCE_MS = 700;

export const TextPane = () => {
  const text = useEditorStore((s) => s.text);
  const status = useEditorStore((s) => s.status);
  const isDirty = useEditorStore((s) => s.isTextDirty);
  const setText = useEditorStore((s) => s.setText);
  const commitText = useEditorStore((s) => s.commitText);

  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commitText(), COMMIT_DEBOUNCE_MS);
  };

  const handleBlur = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (isDirty) commitText();
  };

  let statusEl: React.ReactElement;
  if (status.kind === "error") {
    statusEl = (
      <span className="mge-status err">
        Parse error{status.line ? ` (line ${status.line})` : ""}: {status.message}
      </span>
    );
  } else if (isDirty) {
    statusEl = <span className="mge-status dirty">Editing… (parses on idle / blur)</span>;
  } else {
    statusEl = <span className="mge-status ok">In sync</span>;
  }

  return (
    <section className="mge-text-pane">
      <div className="mge-text-pane-header">
        <span>Mermaid</span>
        {statusEl}
      </div>
      <textarea
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        spellCheck={false}
        wrap="off"
      />
    </section>
  );
};
