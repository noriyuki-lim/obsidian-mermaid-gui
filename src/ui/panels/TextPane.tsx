import { useEffect, useRef } from "react";
import { useEditorStore } from "../EditorContext";
import { blurOnEscape } from "../keyboard";
import { FLOWCHART_TEXT_PANE_HEIGHT_KEY, loadNumber, saveNumber } from "../layoutPrefs";

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
  const sortSourceByCanvas = useEditorStore((s) => s.sortSourceByCanvas);

  const timer = useRef<number | null>(null);
  const paneRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  // Restore the last saved source-pane height once the shell (grid parent) is
  // mounted, so reopening the flowchart editor keeps the user's preferred
  // split instead of resetting to DEFAULT_HEIGHT every time.
  useEffect(() => {
    const shell = paneRef.current?.parentElement;
    if (!shell) return;
    const saved = loadNumber(FLOWCHART_TEXT_PANE_HEIGHT_KEY, DEFAULT_HEIGHT);
    shell.style.setProperty("--mge-text-pane-height", `${Math.round(clamp(saved, MIN_HEIGHT, Number.MAX_SAFE_INTEGER))}px`);
  }, []);

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
    const shell = paneRef.current?.parentElement;
    const height = parseFloat(shell?.style.getPropertyValue("--mge-text-pane-height") ?? "");
    if (Number.isFinite(height)) saveNumber(FLOWCHART_TEXT_PANE_HEIGHT_KEY, height);
  };

  const handleResizeReset = () => {
    paneRef.current?.parentElement?.style.setProperty("--mge-text-pane-height", `${DEFAULT_HEIGHT}px`);
    saveNumber(FLOWCHART_TEXT_PANE_HEIGHT_KEY, DEFAULT_HEIGHT);
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
        aria-label="Drag to resize source pane"
      />
      <div className="mge-text-pane-header">
        <span>Mermaid</span>
        <button
          type="button"
          className="mge-source-sort-btn"
          onClick={sortSourceByCanvas}
          title="Reorder Mermaid source by current canvas positions"
        >
          Sort source by canvas
        </button>
        {statusEl}
      </div>
      <textarea
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={blurOnEscape}
        spellCheck={false}
        wrap="off"
      />
    </section>
  );
};
