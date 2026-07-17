import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { DIAGRAM_TEMPLATES, templateSource, type DiagramTemplate } from "../core/templates";
import type { DiagramKind } from "../core/diagram-kind";
import { useT } from "./EditorHostContext";

interface Props {
  /** Called once when the user confirms a kind. The host then mounts the
   *  matching editor with this template as the initial source. */
  onPick: (template: DiagramTemplate) => void;
  onCancel: () => void;
  /** Optional Mermaid renderer for previewing the highlighted template. */
  renderMermaid?: (source: string) => Promise<string>;
}

// Favorites and the custom tile order are per-device conveniences, so we
// persist them in localStorage rather than threading plugin settings
// (data.json) through the Obsidian layer.
const PIN_STORAGE_KEY = "mge-pinned-kinds";
const ORDER_STORAGE_KEY = "mge-kind-order";

const loadStringList = (key: string): string[] => {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
};

const saveStringList = (key: string, kinds: string[]): void => {
  try {
    window.localStorage.setItem(key, JSON.stringify(kinds));
  } catch {
    // Ignore quota / privacy-mode failures — persistence is non-essential.
  }
};

/**
 * Merge a saved tile order with the current template list: kinds the user
 * has already ordered keep their relative order, kinds added since (new
 * templates) are appended in their default-array position, and kinds that no
 * longer exist (removed templates) are dropped silently.
 */
const mergeOrder = (saved: string[], defaultOrder: string[]): string[] => {
  const known = new Set(defaultOrder);
  const kept = saved.filter((k) => known.has(k));
  const keptSet = new Set(kept);
  const appended = defaultOrder.filter((k) => !keptSet.has(k));
  return [...kept, ...appended];
};

/**
 * Blank-state landing screen. Shown when the modal is opened without an
 * existing fence (e.g. via the editor right-click menu or the
 * "Insert new Mermaid diagram (GUI)" command).
 *
 * Templates are grouped into Favorites → the rest, ordered by the user's
 * saved tile order (falls back to `DIAGRAM_TEMPLATES` order, persisted in
 * localStorage per device via the grip handle's drag-to-reorder). Picks reuse
 * the EditorShell-style chrome so the modal remains draggable.
 */
export const DiagramKindPicker = ({ onPick, onCancel, renderMermaid }: Props) => {
  const t = useT();
  const [highlighted, setHighlighted] = useState<DiagramTemplate>(DIAGRAM_TEMPLATES[0]);
  const [pinned, setPinned] = useState<string[]>(() => loadStringList(PIN_STORAGE_KEY));
  const [order, setOrder] = useState<string[]>(() =>
    mergeOrder(
      loadStringList(ORDER_STORAGE_KEY),
      DIAGRAM_TEMPLATES.map((t) => t.kind),
    ),
  );
  const [draggingKind, setDraggingKind] = useState<string | null>(null);
  const dragRef = useRef<{ pointerId: number; kind: string; lastTarget: string } | null>(null);
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
      saveStringList(PIN_STORAGE_KEY, next);
      return next;
    });
  };

  const resetOrder = (): void => {
    const defaultOrder = DIAGRAM_TEMPLATES.map((t) => t.kind);
    setOrder(defaultOrder);
    saveStringList(ORDER_STORAGE_KEY, defaultOrder);
  };

  // Move `fromKind` to sit where `toKind` currently is. Operates on the full
  // order (not the pinned/rest sub-lists), so dragging within either visible
  // group only changes the two kinds' relative position to each other.
  const reorderKind = (fromKind: string, toKind: string): void => {
    if (fromKind === toKind) return;
    setOrder((prev) => {
      const fromIdx = prev.indexOf(fromKind);
      if (fromIdx === -1 || !prev.includes(toKind)) return prev;
      const next = prev.slice();
      next.splice(fromIdx, 1);
      next.splice(next.indexOf(toKind), 0, fromKind);
      saveStringList(ORDER_STORAGE_KEY, next);
      return next;
    });
  };

  const kindFromPoint = (x: number, y: number): string | null => {
    // `elementFromPoint` only returns the topmost hit — near the scroll
    // container's edge (e.g. the rightmost grid column, under a scrollbar)
    // that topmost element can be something with no `data-kind-tile`
    // ancestor at all, making the tile underneath unreachable. Walk the full
    // hit stack instead so an overlay never blocks the drop target.
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      const tile = el.closest<HTMLElement>("[data-kind-tile]");
      if (tile) return tile.dataset.kindTile ?? null;
    }
    return null;
  };

  // Tiles are keyed by `kind` (content identity, not array position), so
  // reordering physically relocates the dragged tile's DOM node. Relying on
  // `setPointerCapture` on that node breaks mid-drag: Chromium can implicitly
  // release capture when the captured element moves within the DOM, and no
  // `pointerup` ever arrives — leaving the tile stuck in its "grabbed" state.
  // Tracking the drag via window-level listeners sidesteps this entirely.
  useEffect(() => {
    if (!draggingKind) return;
    const handleMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const target = kindFromPoint(e.clientX, e.clientY);
      // Skip both no-hit and "still hovering the spot we already reordered
      // against" — without this guard every pointermove over the same tile
      // re-splices the order array and re-persists to localStorage.
      if (!target || target === drag.kind || target === drag.lastTarget) return;
      reorderKind(drag.kind, target);
      drag.lastTarget = target;
    };
    const handleEnd = (e: PointerEvent) => {
      if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
      dragRef.current = null;
      setDraggingKind(null);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
  }, [draggingKind]);

  const startDrag = (kind: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { pointerId: e.pointerId, kind, lastTarget: kind };
    setDraggingKind(kind);
  };

  const orderIndex = useMemo(() => new Map(order.map((k, i) => [k, i])), [order]);
  const sortedTemplates = useMemo(
    () =>
      [...DIAGRAM_TEMPLATES].sort(
        (a, b) => (orderIndex.get(a.kind) ?? Number.MAX_SAFE_INTEGER) -
          (orderIndex.get(b.kind) ?? Number.MAX_SAFE_INTEGER),
      ),
    [orderIndex],
  );
  const pinnedTemplates = sortedTemplates.filter((t) => pinnedSet.has(t.kind));
  const rest = sortedTemplates.filter((t) => !pinnedSet.has(t.kind));

  const renderTile = (tpl: DiagramTemplate) => {
    const active = tpl.kind === highlighted.kind;
    const isPinned = pinnedSet.has(tpl.kind);
    return (
      <li key={tpl.kind}>
        <div
          className={
            "mge-kind-picker-item" +
            (active ? " active" : "") +
            (draggingKind === tpl.kind ? " dragging" : "")
          }
          role="button"
          tabIndex={0}
          data-kind-tile={tpl.kind}
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
            className="mge-kind-picker-handle"
            aria-label={t.picker.dragReorder}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={startDrag(tpl.kind)}
          >
            <span className="mge-kind-picker-grip" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mge-kind-picker-star"
            aria-pressed={isPinned}
            aria-label={isPinned ? t.picker.unpin : t.picker.pin}
            onClick={(e) => {
              e.stopPropagation();
              togglePin(tpl.kind);
            }}
          >
            {isPinned ? "★" : "☆"}
          </button>
          <span className="mge-kind-picker-item-label">{tpl.label}</span>
          <span className="mge-kind-picker-item-desc">
            {(t.templateDescriptions as Partial<Record<DiagramKind, string>>)[tpl.kind] ??
              tpl.description}
          </span>
        </div>
      </li>
    );
  };

  const section = (title: string | null, items: DiagramTemplate[]) =>
    items.length === 0 ? null : (
      <div className="mge-kind-picker-group">
        {title ? <h3 className="mge-kind-picker-section">{title}</h3> : null}
        <ul className="mge-kind-picker-list">{items.map(renderTile)}</ul>
      </div>
    );

  return (
    <div className="mge-editor-shell mge-kind-picker-shell">
      <header className="mge-toolbar mge-editor-toolbar">
        <span className="mge-brand">{t.picker.brand}</span>
        <div className="mge-group" style={{ marginLeft: "auto" }}>
          <button className="mge-btn-secondary" onClick={onCancel}>
            {t.common.cancel}
          </button>
          <button className="mge-btn-primary" onClick={() => onPick(highlighted)}>
            {t.picker.startWith(highlighted.label)}
          </button>
        </div>
      </header>

      <section className="mge-editor-body mge-kind-picker-body">
        <div className="mge-kind-picker-lead-row">
          <p className="mge-kind-picker-lead">{t.picker.intro}</p>
          <button type="button" className="mge-kind-picker-reset" onClick={resetOrder}>
            {t.picker.resetOrder}
          </button>
        </div>
        {section(t.picker.favorites, pinnedTemplates)}
        {section(null, rest)}
      </section>

      <aside className="mge-editor-side mge-kind-picker-side">
        <div className="mge-editor-preview">
          <div className="mge-editor-pane-header">Preview — {highlighted.label}</div>
          <div className="mge-editor-preview-inner">
            {!renderMermaid ? (
              <p className="mge-editor-preview-note">{t.picker.previewUnavailable}</p>
            ) : renderError ? (
              <div className="mge-preview-error">{renderError}</div>
            ) : svg.length === 0 ? (
              <p className="mge-editor-preview-note">{t.common.previewRendering}</p>
            ) : (
              <div
                className="mge-mermaid-preview"
                // eslint-disable-next-line react/no-danger -- SVG comes from
                // Obsidian's sandboxed mermaid runtime; rendering as innerHTML
                // matches the postProcessor's behaviour for read view.
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
