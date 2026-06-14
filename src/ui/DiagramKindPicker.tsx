import { useEffect, useMemo, useRef, useState } from "react";
import { DIAGRAM_TEMPLATES, templateSource, type DiagramTemplate } from "../core/templates";

interface Props {
  /** Called once when the user confirms a kind. The host then mounts the
   *  matching editor with this template as the initial source. */
  onPick: (template: DiagramTemplate) => void;
  onCancel: () => void;
  /** Optional Mermaid renderer for previewing the highlighted template. */
  renderMermaid?: (source: string) => Promise<string>;
}

// Favorites are a per-device convenience, so we persist them in localStorage
// rather than threading plugin settings (data.json) through the Obsidian layer.
const PIN_STORAGE_KEY = "mge-pinned-kinds";

const loadPinned = (): string[] => {
  try {
    const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
};

const savePinned = (kinds: string[]): void => {
  try {
    window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(kinds));
  } catch {
    // Ignore quota / privacy-mode failures — pinning is non-essential.
  }
};

/**
 * Blank-state landing screen. Shown when the modal is opened without an
 * existing fence (e.g. via the editor right-click menu or the
 * "Insert new Mermaid diagram (GUI)" command).
 *
 * Templates are grouped into Favorites → Available (graphical editing) →
 * Under Construction (form-centric), driven by each template's `editorStage`.
 * Picks reuse the EditorShell-style chrome so the modal remains draggable.
 */
export const DiagramKindPicker = ({ onPick, onCancel, renderMermaid }: Props) => {
  const [highlighted, setHighlighted] = useState<DiagramTemplate>(DIAGRAM_TEMPLATES[0]);
  const [pinned, setPinned] = useState<string[]>(() => loadPinned());
  const [svg, setSvg] = useState<string>("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  const previewSource = useMemo(() => templateSource(highlighted), [highlighted]);

  useEffect(() => {
    if (!renderMermaid) {
      setSvg("");
      setRenderError(null);
      return;
    }
    const token = ++tokenRef.current;
    let cancelled = false;
    void (async () => {
      try {
        const result = await renderMermaid(previewSource);
        if (cancelled || token !== tokenRef.current) return;
        setSvg(result);
        setRenderError(null);
      } catch (err) {
        if (cancelled || token !== tokenRef.current) return;
        setSvg("");
        setRenderError((err as Error).message ?? String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewSource, renderMermaid]);

  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  const togglePin = (kind: string): void => {
    setPinned((prev) => {
      const next = prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind];
      savePinned(next);
      return next;
    });
  };

  const pinnedTemplates = pinned
    .map((k) => DIAGRAM_TEMPLATES.find((t) => t.kind === k))
    .filter((t): t is DiagramTemplate => Boolean(t));
  const available = DIAGRAM_TEMPLATES.filter(
    (t) => t.editorStage === "available" && !pinnedSet.has(t.kind),
  );
  const wip = DIAGRAM_TEMPLATES.filter(
    (t) => t.editorStage === "wip" && !pinnedSet.has(t.kind),
  );

  const renderTile = (tpl: DiagramTemplate) => {
    const active = tpl.kind === highlighted.kind;
    const isPinned = pinnedSet.has(tpl.kind);
    return (
      <li key={tpl.kind}>
        <div
          className={active ? "mge-kind-picker-item active" : "mge-kind-picker-item"}
          role="button"
          tabIndex={0}
          onClick={() => setHighlighted(tpl)}
          onDoubleClick={() => onPick(tpl)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onPick(tpl);
            else if (e.key === " ") {
              e.preventDefault();
              setHighlighted(tpl);
            }
          }}
        >
          <button
            type="button"
            className="mge-kind-picker-star"
            aria-pressed={isPinned}
            aria-label={isPinned ? "お気に入りから外す" : "お気に入りに追加"}
            title={isPinned ? "お気に入りから外す" : "お気に入りに追加"}
            onClick={(e) => {
              e.stopPropagation();
              togglePin(tpl.kind);
            }}
          >
            {isPinned ? "★" : "☆"}
          </button>
          <span className="mge-kind-picker-item-label">{tpl.label}</span>
          <span className="mge-kind-picker-item-desc">{tpl.description}</span>
        </div>
      </li>
    );
  };

  const section = (title: string, items: DiagramTemplate[]) =>
    items.length === 0 ? null : (
      <div className="mge-kind-picker-group">
        <h3 className="mge-kind-picker-section">{title}</h3>
        <ul className="mge-kind-picker-list">{items.map(renderTile)}</ul>
      </div>
    );

  return (
    <div className="mge-editor-shell mge-kind-picker-shell">
      <header className="mge-toolbar mge-editor-toolbar">
        <span className="mge-brand">Mermaid GUI — 新規作成</span>
        <div className="mge-group" style={{ marginLeft: "auto" }}>
          <button className="mge-btn-secondary" onClick={onCancel}>
            キャンセル
          </button>
          <button className="mge-btn-primary" onClick={() => onPick(highlighted)}>
            {highlighted.label} で始める
          </button>
        </div>
      </header>

      <section className="mge-editor-body mge-kind-picker-body">
        <p className="mge-kind-picker-lead">
          図の種別を選択。テンプレートが読み込まれ、続きを GUI で編集できる。☆ で上部にピンできる。
        </p>
        {section("★ お気に入り", pinnedTemplates)}
        {section("Available — GUI で直接編集", available)}
        {section("Under Construction — フォーム中心", wip)}
      </section>

      <aside className="mge-editor-side mge-kind-picker-side">
        <div className="mge-editor-preview">
          <div className="mge-editor-pane-header">Preview — {highlighted.label}</div>
          <div className="mge-editor-preview-inner">
            {!renderMermaid ? (
              <p className="mge-editor-preview-note">プレビュー不可</p>
            ) : renderError ? (
              <div className="mge-preview-error">{renderError}</div>
            ) : svg.length === 0 ? (
              <p className="mge-editor-preview-note">プレビューを描画中…</p>
            ) : (
              <div
                className="mge-mermaid-preview"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            )}
          </div>
        </div>
        <div className="mge-editor-code mge-kind-picker-source">
          <div className="mge-editor-pane-header">Template source</div>
          <textarea value={previewSource} readOnly spellCheck={false} wrap="off" />
        </div>
      </aside>
    </div>
  );
};
