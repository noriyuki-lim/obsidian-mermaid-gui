import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

const SIDE_DEFAULT = 0.42;
const SIDE_MIN = 0.22;
const SIDE_MAX = 0.7;
const PREVIEW_DEFAULT = 0.58;
const PREVIEW_MIN = 0.2;
const PREVIEW_MAX = 0.85;

export type SourceEditOutcome = { ok: true } | { ok: false; error: string };

interface Props {
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
   * When provided, the Mermaid source textarea becomes editable. The shell
   * keeps the user's draft visible until they blur the textarea so the
   * generator's canonical form does not stomp partial edits. Each keystroke
   * calls back: returning `{ ok: true }` means the new source parses and the
   * host editor has reflected it in IR; returning `{ ok: false }` keeps the
   * old IR and surfaces the error inline.
   */
  onSourceEdit?: (next: string) => SourceEditOutcome;
  /** Main editor body — controls / form sections live here. */
  children: ReactNode;
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
  title = "Mermaid GUI",
  currentSource,
  onSave,
  onCancel,
  saving,
  toolbarExtras,
  layout = "side",
  sourceInitiallyOpen = false,
  sourceToggleLabel = "Mermaid source",
  renderMermaid,
  previewOverride,
  previewUnavailableMessage,
  onSourceEdit,
  children,
}: Props) => {
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

  const shellRef = useRef<HTMLDivElement>(null);
  const sideDrag = useRef<{ startX: number; startRatio: number } | null>(null);
  const previewDrag = useRef<{ startY: number; startRatio: number } | null>(null);

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
  };

  const startPreviewDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !shellRef.current) return;
    const side = shellRef.current.querySelector<HTMLElement>(".mge-editor-side");
    if (!side) return;
    const height = side.getBoundingClientRect().height;
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
    const side = shell.querySelector<HTMLElement>(".mge-editor-side");
    if (!side) return;
    const height = side.getBoundingClientRect().height;
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
  };

  const previewBody = (() => {
    if (previewOverride !== undefined) return previewOverride;
    if (!renderMermaid) {
      return (
        <p className="mge-editor-preview-note">
          {previewUnavailableMessage ?? "プレビューは利用できない。"}
        </p>
      );
    }
    if (renderError) {
      return (
        <div className="mge-preview-error">Mermaid render error: {renderError}</div>
      );
    }
    if (svg.length === 0) {
      return <p className="mge-editor-preview-note">プレビューを描画中…</p>;
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
            <span className="mge-source-status dirty">編集中… blur で確定</span>
          ) : (
            <span className="mge-source-status ok">同期済み</span>
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
        className={`mge-editor-shell mge-editor-shell-stacked ${sourceOpen ? "mge-source-open" : ""}`}
        ref={shellRef}
        style={{
          ["--mge-side-ratio" as string]: SIDE_DEFAULT,
          ["--mge-preview-ratio" as string]: PREVIEW_DEFAULT,
        }}
      >
        <header className="mge-toolbar mge-editor-toolbar">
          <span className="mge-brand">{title}</span>
          {toolbarExtras ? <div className="mge-editor-toolbar-extras">{toolbarExtras}</div> : null}
          <div className="mge-group" style={{ marginLeft: "auto" }}>
            <button
              className="mge-btn-secondary"
              onClick={() => setSourceOpen((open) => !open)}
              aria-pressed={sourceOpen}
            >
              {sourceOpen ? "ソースを隠す" : sourceToggleLabel}
            </button>
            <button
              className="mge-btn-secondary"
              onClick={onCancel}
              disabled={saving}
            >
              キャンセル
            </button>
            <button
              className="mge-btn-primary"
              onClick={() => void onSave()}
              disabled={saving}
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </header>

        {previewPane}

        <section className="mge-editor-body">
          <div className="mge-editor-main-content">{children}</div>
          {sourceOpen ? <aside className="mge-editor-source-drawer">{sourcePane}</aside> : null}
        </section>
      </div>
    );
  }

  return (
    <div
      className="mge-editor-shell"
      ref={shellRef}
      style={{
        ["--mge-side-ratio" as string]: SIDE_DEFAULT,
        ["--mge-preview-ratio" as string]: PREVIEW_DEFAULT,
      }}
    >
      <header className="mge-toolbar mge-editor-toolbar">
        <span className="mge-brand">{title}</span>
        {toolbarExtras ? <div className="mge-editor-toolbar-extras">{toolbarExtras}</div> : null}
        <div className="mge-group" style={{ marginLeft: "auto" }}>
          <button
            className="mge-btn-secondary"
            onClick={onCancel}
            disabled={saving}
          >
            キャンセル
          </button>
          <button
            className="mge-btn-primary"
            onClick={() => void onSave()}
            disabled={saving}
          >
            {saving ? "保存中…" : "保存"}
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
