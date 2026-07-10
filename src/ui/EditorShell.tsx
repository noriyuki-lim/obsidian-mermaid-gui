import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { EditorActions } from "./EditorActions";
import { useEditorHost, useT } from "./EditorHostContext";
import { blurFocusedEditableOnEscape, blurOnEscape, isEditableShortcutTarget } from "./keyboard";
import type { DiagramKind } from "../core/diagram-kind";
import { loadNumber, previewRatioKey, saveNumber, sideRatioKey } from "./layoutPrefs";

const SIDE_DEFAULT = 0.42;
const HISTORY_LIMIT = 100;
const SIDE_MIN = 0.22;
const SIDE_MAX = 0.7;
const PREVIEW_DEFAULT = 0.58;
const PREVIEW_MIN = 0.2;
const PREVIEW_MAX = 0.85;

export type SourceEditOutcome = { ok: true } | { ok: false; error: string };

interface Props {
  /** Diagram kind this shell instance is editing. Namespaces the persisted
   *  panel-size preferences (side/preview ratio) so resizing one diagram
   *  type's panels does not affect another's. */
  diagramKind: DiagramKind;
  /** Brand label rendered on the left of the toolbar. */
  title?: string;
  /** Latest serialised Mermaid source — driven by the host editor's IR. */
  currentSource: string;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  /** Extra toolbar controls (between brand and Save/Cancel). */
  toolbarExtras?: ReactNode;
  /** Layout variant. `side` preserves the classic two-pane editor. */
  layout?: "side" | "stacked";
  /** Overrides the shared side-ratio default for this diagram kind's first
   *  open (before the user has ever dragged the splitter). Ignored once a
   *  per-kind preference is saved. */
  defaultSideRatio?: number;
  /** Overrides the shared preview-ratio default for this diagram kind's
   *  first open. Ignored once a per-kind preference is saved. */
  defaultPreviewRatio?: number;
  /** For stacked layouts, source starts hidden unless explicitly opened. */
  sourceInitiallyOpen?: boolean;
  /** Button label for the collapsible source pane in stacked layouts. */
  sourceToggleLabel?: string;
  /** Render a Mermaid source into an SVG string (wraps Obsidian's loadMermaid). */
  renderMermaid?: (source: string) => Promise<string>;
  /**
   * Custom interactive preview that replaces the default Mermaid render.
   * Used by diagram-specific GUIs (e.g. quadrantChart) to expose drag handles
   * on the preview itself rather than relying on numeric input fields.
   */
  previewOverride?: ReactNode;
  /** Note shown when the host editor cannot render a preview. */
  previewUnavailableMessage?: string;
  /**
   * Stacked-layout only: a persistent panel occupying a full-height right
   * column alongside preview + source (its own grid area, not part of the
   * preview/body rows). Used by editors that need settings visible at all
   * times rather than tucked into `children` below the preview.
   */
  sidePanel?: ReactNode;
  /**
   * When provided, the Mermaid source textarea becomes editable. The shell
   * keeps the user's draft visible until they blur the textarea so the
   * generator's canonical form does not stomp partial edits. Each keystroke
   * calls back: returning `{ ok: true }` means the new source parses and the
   * host editor has reflected it in IR; returning `{ ok: false }` keeps the
   * old IR and surfaces the error inline.
   */
  onSourceEdit?: (next: string) => SourceEditOutcome;
  /** Main editor body — controls / form sections live here. Optional: an
   *  editor whose controls all live in `sidePanel` (e.g. kanban) has nothing
   *  left to put here. */
  children?: ReactNode;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Shared chrome for every diagram editor: a draggable top toolbar (the modal
 * grabs anything with `.mge-toolbar` as its drag handle), the host editor's
 * controls on the left, and a side panel showing the live preview above the
 * generated Mermaid source. Plugin spec §6 / §7: preview + code visible at all
 * times so the user can verify their edits without leaving the modal.
 */
export const EditorShell = ({
  diagramKind,
  title = "Mermaid GUI",
  currentSource,
  onSave,
  onCancel,
  saving,
  toolbarExtras,
  layout = "side",
  defaultSideRatio,
  defaultPreviewRatio,
  sourceInitiallyOpen = false,
  sourceToggleLabel,
  renderMermaid,
  previewOverride,
  previewUnavailableMessage,
  sidePanel,
  onSourceEdit,
  children,
}: Props) => {
  const t = useT();
  const [svg, setSvg] = useState<string>("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderToken = useRef(0);

  // Source-pane editing state. `draft` is null when the textarea is in lockstep
  // with the IR-derived `currentSource`. The host editor flips into draft mode
  // on the first keystroke and stays there until blur — that prevents the
  // generator's canonical form from stomping partial edits mid-typing.
  const [draft, setDraft] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(sourceInitiallyOpen);
  const editable = typeof onSourceEdit === "function";
  const displaySource = draft ?? currentSource;
  const stacked = layout === "stacked";

  const host = useEditorHost();

  // Source-string undo/redo, shared by every EditorShell editor. We can't see
  // each editor's IR mutations directly, so we treat `currentSource` (the IR's
  // canonical serialisation) as the observable: whenever it changes from a
  // non-undo cause we snapshot the previous value. Undo/redo replay a snapshot
  // through `onSourceEdit`, which rehydrates the host editor's IR. The
  // flowchart editor keeps its own store-level history and does not use this.
  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const lastSourceRef = useRef(currentSource);
  const suppressRef = useRef(false);
  const [, bump] = useState(0);
  const rerender = () => bump((n) => n + 1);

  useEffect(() => {
    if (suppressRef.current) {
      suppressRef.current = false;
      lastSourceRef.current = currentSource;
      return;
    }
    if (currentSource === lastSourceRef.current) return;
    pastRef.current = [...pastRef.current, lastSourceRef.current].slice(-HISTORY_LIMIT);
    futureRef.current = [];
    lastSourceRef.current = currentSource;
    rerender();
  }, [currentSource]);

  const replayHistory = (value: string) => {
    suppressRef.current = true;
    lastSourceRef.current = value;
    setDraft(null);
    setSourceError(null);
    const r = onSourceEdit!(value);
    if (!r.ok) suppressRef.current = false;
    rerender();
  };

  const undo = () => {
    if (!editable || pastRef.current.length === 0) return;
    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, lastSourceRef.current];
    replayHistory(prev);
  };

  const redo = () => {
    if (!editable || futureRef.current.length === 0) return;
    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, lastSourceRef.current];
    replayHistory(next);
  };

  const exportSvg = host.onExportSvg ? () => host.onExportSvg!(currentSource) : undefined;

  const actions = (
    <EditorActions
      onUndo={undo}
      onRedo={redo}
      canUndo={editable && pastRef.current.length > 0}
      canRedo={editable && futureRef.current.length > 0}
      onExport={exportSvg}
    />
  );

  const shellRef = useRef<HTMLDivElement>(null);
  const sideDrag = useRef<{ startX: number; startRatio: number } | null>(null);
  const previewDrag = useRef<{ startY: number; startRatio: number } | null>(null);

  // Initial ratios come from this diagram kind's saved preference (falling
  // back to the shared default), so reopening the editor keeps the panel
  // sizes the user last set for this specific diagram type.
  const [initialSideRatio] = useState(() =>
    clamp(
      loadNumber(sideRatioKey(diagramKind), defaultSideRatio ?? SIDE_DEFAULT),
      SIDE_MIN,
      SIDE_MAX,
    ),
  );
  const [initialPreviewRatio] = useState(() =>
    clamp(
      loadNumber(previewRatioKey(diagramKind), defaultPreviewRatio ?? PREVIEW_DEFAULT),
      PREVIEW_MIN,
      PREVIEW_MAX,
    ),
  );

  // Render Mermaid source to SVG whenever it (or the renderer) changes. We use
  // a monotonically increasing token so an in-flight render that resolves late
  // never overwrites a newer result. Skipped when a host editor supplies its
  // own interactive preview via `previewOverride`.
  useEffect(() => {
    if (!renderMermaid || previewOverride !== undefined) {
      setSvg("");
      setRenderError(null);
      return;
    }
    if (currentSource.trim().length === 0) {
      setSvg("");
      setRenderError(null);
      return;
    }
    const token = ++renderToken.current;
    let cancelled = false;
    void (async () => {
      try {
        const result = await renderMermaid(currentSource);
        if (cancelled || token !== renderToken.current) return;
        setSvg(result);
        setRenderError(null);
      } catch (err) {
        if (cancelled || token !== renderToken.current) return;
        setSvg("");
        setRenderError((err as Error).message ?? String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSource, renderMermaid, previewOverride]);

  // Ctrl/Cmd+Z / Ctrl+Y / Ctrl+Shift+Z drive the source-string history. We skip
  // when focus is inside an input/textarea so the browser's native text undo
  // keeps working while the user types.
  useEffect(() => {
    const root = shellRef.current;
    if (!root || !editable) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || isEditableShortcutTarget(e.target)) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
    // undo/redo read mutable refs, so the first-render closures stay correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  const startSideDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !shellRef.current) return;
    const width = shellRef.current.getBoundingClientRect().width;
    const ratio = parseFloat(
      shellRef.current.style.getPropertyValue("--mge-side-ratio") || `${SIDE_DEFAULT}`,
    );
    sideDrag.current = { startX: e.clientX, startRatio: Number.isFinite(ratio) ? ratio : SIDE_DEFAULT };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add("mge-side-resizing");
    e.preventDefault();
    void width;
  };
  const moveSideDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = sideDrag.current;
    const shell = shellRef.current;
    if (!drag || !shell) return;
    const width = shell.getBoundingClientRect().width;
    if (width <= 0) return;
    const dx = e.clientX - drag.startX;
    // Side panel sits on the right, so dragging the splitter left widens it.
    const next = clamp(drag.startRatio - dx / width, SIDE_MIN, SIDE_MAX);
    shell.style.setProperty("--mge-side-ratio", String(next));
  };
  const endSideDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!sideDrag.current) return;
    sideDrag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointer capture may already be released
    }
    document.body.classList.remove("mge-side-resizing");
    const ratio = parseFloat(shellRef.current?.style.getPropertyValue("--mge-side-ratio") ?? "");
    if (Number.isFinite(ratio)) saveNumber(sideRatioKey(diagramKind), ratio);
  };

  const startPreviewDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !shellRef.current) return;
    const target = stacked
      ? shellRef.current
      : shellRef.current.querySelector<HTMLElement>(".mge-editor-side");
    if (!target) return;
    const height = target.getBoundingClientRect().height;
    if (height <= 0) return;
    const ratio = parseFloat(
      shellRef.current.style.getPropertyValue("--mge-preview-ratio") || `${PREVIEW_DEFAULT}`,
    );
    previewDrag.current = {
      startY: e.clientY,
      startRatio: Number.isFinite(ratio) ? ratio : PREVIEW_DEFAULT,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add("mge-preview-resizing");
    e.preventDefault();
  };
  const movePreviewDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = previewDrag.current;
    const shell = shellRef.current;
    if (!drag || !shell) return;
    const target = stacked ? shell : shell.querySelector<HTMLElement>(".mge-editor-side");
    if (!target) return;
    const height = target.getBoundingClientRect().height;
    if (height <= 0) return;
    const dy = e.clientY - drag.startY;
    const next = clamp(drag.startRatio + dy / height, PREVIEW_MIN, PREVIEW_MAX);
    shell.style.setProperty("--mge-preview-ratio", String(next));
  };
  const endPreviewDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!previewDrag.current) return;
    previewDrag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointer capture may already be released
    }
    document.body.classList.remove("mge-preview-resizing");
    const ratio = parseFloat(shellRef.current?.style.getPropertyValue("--mge-preview-ratio") ?? "");
    if (Number.isFinite(ratio)) saveNumber(previewRatioKey(diagramKind), ratio);
  };

  const previewBody = (() => {
    if (previewOverride !== undefined) return previewOverride;
    if (!renderMermaid) {
      return (
        <p className="mge-editor-preview-note">
          {previewUnavailableMessage ?? t.common.previewUnavailable}
        </p>
      );
    }
    if (renderError) {
      return (
        <div className="mge-preview-error">Mermaid render error: {renderError}</div>
      );
    }
    if (svg.length === 0) {
      return <p className="mge-editor-preview-note">{t.common.previewRendering}</p>;
    }
    return (
      <div
        className="mge-mermaid-preview"
        // eslint-disable-next-line react/no-danger -- SVG comes from Obsidian's
        // sandboxed mermaid runtime; rendering as innerHTML matches the
        // postProcessor's behaviour for read view.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  })();

  const sourcePane = (
    <div className="mge-editor-code">
      <div className="mge-editor-pane-header">
        <span>Mermaid source</span>
        {editable ? (
          sourceError ? (
            <span className="mge-source-status err">parse error: {sourceError}</span>
          ) : draft !== null ? (
            <span className="mge-source-status dirty">{t.common.sourceDirty}</span>
          ) : (
            <span className="mge-source-status ok">{t.common.sourceSynced}</span>
          )
        ) : null}
      </div>
      <textarea
        value={displaySource}
        readOnly={!editable}
        spellCheck={false}
        wrap="off"
        onChange={
          editable
            ? (e) => {
                const next = e.target.value;
                setDraft(next);
                const result = onSourceEdit!(next);
                setSourceError(result.ok ? null : result.error);
              }
            : undefined
        }
        onKeyDown={editable ? blurOnEscape : undefined}
        onBlur={
          editable
            ? () => {
                // Snap back to the canonical IR-derived source. When the
                // draft still has a parse error, we keep it visible so the
                // user can fix it instead of silently losing their typing.
                if (sourceError !== null) return;
                setDraft(null);
              }
            : undefined
        }
      />
    </div>
  );

  const previewPane = (
    <div className="mge-editor-preview">
      <div className="mge-editor-pane-header">Preview</div>
      <div className="mge-editor-preview-inner">{previewBody}</div>
    </div>
  );

  if (stacked) {
    return (
      <div
        className={`mge-editor-shell mge-editor-shell-stacked ${sourceOpen ? "mge-source-open" : ""} ${sidePanel ? "mge-has-sidepanel" : ""}`}
        ref={shellRef}
        onKeyDownCapture={blurFocusedEditableOnEscape}
        style={{
          ["--mge-side-ratio" as string]: initialSideRatio,
          ["--mge-preview-ratio" as string]: initialPreviewRatio,
        }}
      >
        <header className="mge-toolbar mge-editor-toolbar">
          <span className="mge-brand">{title}</span>
          {toolbarExtras ? <div className="mge-editor-toolbar-extras">{toolbarExtras}</div> : null}
          {actions}
          <div className="mge-group" style={{ marginLeft: "auto" }}>
            <button
              className="mge-btn-secondary"
              onClick={() => setSourceOpen((open) => !open)}
              aria-pressed={sourceOpen}
            >
              {sourceOpen ? t.common.hideSource : sourceToggleLabel ?? t.common.showSource}
            </button>
            <button
              className="mge-btn-secondary"
              onClick={onCancel}
              disabled={saving}
            >
              {t.common.cancel}
            </button>
            <button
              className="mge-btn-primary"
              onClick={() => void onSave()}
              disabled={saving}
            >
              {saving ? t.common.saving : t.common.save}
            </button>
          </div>
        </header>

        {previewPane}

        <div
          className="mge-preview-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize preview and table"
          onPointerDown={startPreviewDrag}
          onPointerMove={movePreviewDrag}
          onPointerUp={endPreviewDrag}
          onPointerCancel={endPreviewDrag}
        />

        <section className="mge-editor-body">
          <div className="mge-editor-main-content">{children}</div>
          {sourceOpen ? <aside className="mge-editor-source-drawer">{sourcePane}</aside> : null}
        </section>

        {sidePanel ? <aside className="mge-editor-sidepanel">{sidePanel}</aside> : null}
      </div>
    );
  }

  return (
    <div
      className="mge-editor-shell"
      ref={shellRef}
      onKeyDownCapture={blurFocusedEditableOnEscape}
      style={{
        ["--mge-side-ratio" as string]: initialSideRatio,
        ["--mge-preview-ratio" as string]: initialPreviewRatio,
      }}
    >
      <header className="mge-toolbar mge-editor-toolbar">
        <span className="mge-brand">{title}</span>
        {toolbarExtras ? <div className="mge-editor-toolbar-extras">{toolbarExtras}</div> : null}
        {actions}
        <div className="mge-group" style={{ marginLeft: "auto" }}>
          <button
            className="mge-btn-secondary"
            onClick={onCancel}
            disabled={saving}
          >
            {t.common.cancel}
          </button>
          <button
            className="mge-btn-primary"
            onClick={() => void onSave()}
            disabled={saving}
          >
            {saving ? t.common.saving : t.common.save}
          </button>
        </div>
      </header>

      <section className="mge-editor-body">{children}</section>

      <div
        className="mge-side-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize side panel"
        onPointerDown={startSideDrag}
        onPointerMove={moveSideDrag}
        onPointerUp={endSideDrag}
        onPointerCancel={endSideDrag}
      />

      <aside className="mge-editor-side">
        {previewPane}
        <div
          className="mge-preview-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize preview"
          onPointerDown={startPreviewDrag}
          onPointerMove={movePreviewDrag}
          onPointerUp={endPreviewDrag}
          onPointerCancel={endPreviewDrag}
        />
        {sourcePane}
      </aside>
    </div>
  );
};
