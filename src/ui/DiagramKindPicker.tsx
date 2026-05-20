import { useEffect, useRef, useState } from "react";
import { DIAGRAM_TEMPLATES, type DiagramTemplate } from "../core";

interface Props {
  /** Called once when the user confirms a kind. The host then mounts the
   *  matching editor with this template as the initial source. */
  onPick: (template: DiagramTemplate) => void;
  onCancel: () => void;
  /** Optional Mermaid renderer for previewing the highlighted template. */
  renderMermaid?: (source: string) => Promise<string>;
}

/**
 * Blank-state landing screen. Shown when the modal is opened without an
 * existing fence (e.g. via the editor right-click menu or the
 * "Insert new Mermaid diagram (GUI)" command).
 *
 * Picks reuse the EditorShell-style chrome so the modal remains draggable.
 */
export const DiagramKindPicker = ({ onPick, onCancel, renderMermaid }: Props) => {
  const [highlighted, setHighlighted] = useState<DiagramTemplate>(DIAGRAM_TEMPLATES[0]);
  const [svg, setSvg] = useState<string>("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const tokenRef = useRef(0);

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
        const result = await renderMermaid(highlighted.source);
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
  }, [highlighted, renderMermaid]);

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
        <p className="mge-kind-picker-lead">図の種別を選択。テンプレートが読み込まれ、続きを GUI で編集できる。</p>
        <ul className="mge-kind-picker-list">
          {DIAGRAM_TEMPLATES.map((tpl) => {
            const active = tpl.kind === highlighted.kind;
            return (
              <li key={tpl.kind}>
                <button
                  type="button"
                  className={active ? "mge-kind-picker-item active" : "mge-kind-picker-item"}
                  onClick={() => setHighlighted(tpl)}
                  onDoubleClick={() => onPick(tpl)}
                >
                  <span className="mge-kind-picker-item-label">{tpl.label}</span>
                  <span className="mge-kind-picker-item-desc">{tpl.description}</span>
                </button>
              </li>
            );
          })}
        </ul>
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
        <div className="mge-editor-code">
          <div className="mge-editor-pane-header">Template source</div>
          <textarea value={highlighted.source} readOnly spellCheck={false} wrap="off" />
        </div>
      </aside>
    </div>
  );
};
