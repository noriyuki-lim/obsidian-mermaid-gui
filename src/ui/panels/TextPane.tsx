import { useEffect, useRef } from "react";
import { useEditorStore } from "../EditorContext";

const COMMIT_DEBOUNCE_MS = 700;
const DEFAULT_HEIGHT = 240;
const MIN_HEIGHT = 120;
const MIN_CANVAS_HEIGHT = 160;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const TextPane = () => {
  const text = useEditorStore((s) => s.text);
  const status = useEditorStore((s) => s.status);
  const isDirty = useEditorStore((s) => s.isTextDirty);
  const setText = useEditorStore((s) => s.setText);
  const commitText = useEditorStore((s) => s.commitText);

  const timer = useRef<number | null>(null);
  const paneRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
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

  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const pane = paneRef.current;
    if (!pane) return;
    dragRef.current = { startY: e.clientY, startHeight: pane.getBoundingClientRect().height };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add("mge-text-pane-resizing");
    e.preventDefault();
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const pane = paneRef.current;
    const shell = pane?.parentElement;
    if (!drag || !pane || !shell) return;
    const nextHeight = drag.startHeight - (e.clientY - drag.startY);
    const maxHeight = Math.max(MIN_HEIGHT, shell.getBoundingClientRect().height - 44 - MIN_CANVAS_HEIGHT);
    shell.style.setProperty("--mge-text-pane-height", `${Math.round(clamp(nextHeight, MIN_HEIGHT, maxHeight))}px`);
  };

  const handleResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.classList.remove("mge-text-pane-resizing");
  };

  const handleResizeReset = () => {
    paneRef.current?.parentElement?.style.setProperty("--mge-text-pane-height", `${DEFAULT_HEIGHT}px`);
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
    <section className="mge-text-pane" ref={paneRef}>
      <div
        className="mge-text-pane-resizer"
        onDoubleClick={handleResizeReset}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize source pane"
        title="Drag to resize source pane"
      />
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
