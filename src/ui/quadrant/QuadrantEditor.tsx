import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { parseQuadrant } from "../../core/quadrant/parser";
import { generateQuadrant } from "../../core/quadrant/generator";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import { useT } from "../EditorHostContext";
import { shouldRemoveSelectionFromKey } from "../keyboard";
import { QuadrantInteractivePreview } from "./QuadrantInteractivePreview";
import type {
  QuadrantIR,
  QuadrantItem,
} from "../../core/quadrant/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

const seed = (initialSource: string): QuadrantIR => {
  const outcome = parseQuadrant(initialSource);
  if (outcome.ok) return outcome.ir;
  return { kind: "quadrantChart", quadrants: {}, items: [] };
};

const quadrantKeys = ["q1", "q2", "q3", "q4"] as const;
const quadrantLabels: Record<(typeof quadrantKeys)[number], string> = {
  q1: "Quadrant 1 (top right)",
  q2: "Quadrant 2 (top left)",
  q3: "Quadrant 3 (bottom left)",
  q4: "Quadrant 4 (bottom right)",
};

const round = (n: number) => Math.round(n * 1000) / 1000;
const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);
const POINT_STEP = 0.01;

export const QuadrantEditor = ({ initialSource, onSave, onCancel }: Props) => {
  // QuadrantEditor swaps Mermaid's static render for an interactive SVG so the
  // user can drag points instead of typing x/y by hand. `renderMermaid` from
  // props is intentionally ignored — the override always wins.
  const t = useT();
  const [ir, setIr] = useState<QuadrantIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const pointsPanelRef = useRef<HTMLDivElement>(null);

  const updateItem = (index: number, patch: Partial<QuadrantItem>) => {
    setIr((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? ({ ...item, ...patch } as QuadrantItem) : item,
      ),
    }));
  };

  const movePoint = (index: number, x: number, y: number) => {
    setIr((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index && item.type === "point"
          ? { ...item, x: round(x), y: round(y) }
          : item,
      ),
    }));
  };

  const deleteItem = (index: number) => {
    setIr((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
    setSelectedPoint((prev) => {
      if (prev === null) return null;
      if (prev === index) return null;
      return prev > index ? prev - 1 : prev;
    });
  };

  const addPoint = () => {
    const next = ir.items.filter((i) => i.type === "point").length + 1;
    const newIndex = ir.items.length;
    setIr((prev) => ({
      ...prev,
      items: [...prev.items, { type: "point", name: `Point ${next}`, x: 0.5, y: 0.5 }],
    }));
    focusPointName(newIndex);
  };

  const currentSource = useMemo(() => generateQuadrant(ir), [ir]);

  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const outcome = parseQuadrant(next);
    if (!outcome.ok) return { ok: false, error: outcome.message };
    setIr(outcome.ir);
    setSelectedPoint(null);
    return { ok: true };
  }, []);

  const onPreviewKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (selectedPoint === null || !shouldRemoveSelectionFromKey(e)) return;
    e.preventDefault();
    deleteItem(selectedPoint);
  };

  const onPreviewClick = (e: MouseEvent<HTMLDivElement>) => {
    if (selectedPoint === null) return;
    const target = e.target as HTMLElement;
    if (!target.closest(".mge-quad-point") && !target.closest(".mge-quad-points-row")) {
      setSelectedPoint(null);
    }
  };

  // Double-clicking a point in the preview selects it and jumps focus (with
  // the text pre-selected, ready to overwrite) to that point's name input in
  // the adjacent Points panel — mirrors XYChartEditor's focusXYCell, which
  // uses the same querySelector-after-a-tick pattern for cross-component
  // focus handoff.
  const focusPointName = useCallback((index: number) => {
    setSelectedPoint(index);
    window.setTimeout(() => {
      const input = pointsPanelRef.current?.querySelector<HTMLInputElement>(
        `[data-quad-point-name="${index}"]`,
      );
      input?.focus();
      input?.select();
    }, 0);
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(currentSource);
    } finally {
      setSaving(false);
    }
  }, [saving, currentSource, onSave]);

  return (
    <EditorShell
      diagramKind="quadrantChart"
      defaultSideRatio={0.62}
      defaultPreviewRatio={0.68}
      currentSource={currentSource}
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      previewOverride={
        <div
          className="mge-quad-preview-wrap"
          tabIndex={-1}
          onKeyDown={onPreviewKeyDown}
          onClick={onPreviewClick}
        >
          <QuadrantInteractivePreview
            ir={ir}
            selected={selectedPoint}
            onPointMove={movePoint}
            onSelectPoint={setSelectedPoint}
            onFocusPointName={focusPointName}
          />
          <div className="mge-quad-points-panel" ref={pointsPanelRef}>
            <div className="mge-seq-section-header">
              <span className="mge-seq-section-title">Points</span>
              <div className="mge-seq-add-btns">
                <button className="mge-seq-btn mge-seq-btn-sm" onClick={addPoint}>
                  + point
                </button>
              </div>
            </div>
            {ir.items.filter((i) => i.type === "point").length === 0 && (
              <p className="mge-seq-empty">{t.quadrant.pointsEmpty}</p>
            )}
            {ir.items.map((item, idx) => {
              if (item.type === "point") {
                const isSelected = selectedPoint === idx;
                return (
                  <div
                    key={idx}
                    className={"mge-quad-points-row" + (isSelected ? " selected" : "")}
                    onClick={() => setSelectedPoint(idx)}
                  >
                    <div className="mge-quad-points-row-top">
                      <input
                        className="mge-seq-input mge-quad-points-name-input"
                        value={item.name}
                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                        placeholder="name"
                        data-quad-point-name={idx}
                      />
                      <button
                        className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
                        onClick={() => deleteItem(idx)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="mge-quad-points-row-bottom">
                      <span className="mge-seq-row-label">x</span>
                      <span className="mge-quad-point-field">
                        <input
                          className="mge-seq-input"
                          type="number"
                          step={POINT_STEP}
                          min={0}
                          max={1}
                          value={item.x}
                          onChange={(e) => updateItem(idx, { x: Number(e.target.value) })}
                        />
                        <span className="mge-quad-point-stepper">
                          <button
                            type="button"
                            tabIndex={-1}
                            className="mge-quad-point-stepper-btn"
                            aria-label={t.quadrant.increaseX}
                            onClick={() => updateItem(idx, { x: round(clamp01(item.x + POINT_STEP)) })}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            tabIndex={-1}
                            className="mge-quad-point-stepper-btn"
                            aria-label={t.quadrant.decreaseX}
                            onClick={() => updateItem(idx, { x: round(clamp01(item.x - POINT_STEP)) })}
                          >
                            ▼
                          </button>
                        </span>
                      </span>
                      <span className="mge-seq-row-label">y</span>
                      <span className="mge-quad-point-field">
                        <input
                          className="mge-seq-input"
                          type="number"
                          step={POINT_STEP}
                          min={0}
                          max={1}
                          value={item.y}
                          onChange={(e) => updateItem(idx, { y: Number(e.target.value) })}
                        />
                        <span className="mge-quad-point-stepper">
                          <button
                            type="button"
                            tabIndex={-1}
                            className="mge-quad-point-stepper-btn"
                            aria-label={t.quadrant.increaseY}
                            onClick={() => updateItem(idx, { y: round(clamp01(item.y + POINT_STEP)) })}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            tabIndex={-1}
                            className="mge-quad-point-stepper-btn"
                            aria-label={t.quadrant.decreaseY}
                            onClick={() => updateItem(idx, { y: round(clamp01(item.y - POINT_STEP)) })}
                          >
                            ▼
                          </button>
                        </span>
                      </span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={idx} className="mge-seq-row mge-seq-row-raw">
                  <span className="mge-seq-badge mge-seq-badge-raw">raw</span>
                  <code className="mge-seq-raw-line">{item.line.trim()}</code>
                </div>
              );
            })}
          </div>
        </div>
      }
      onSourceEdit={handleSourceEdit}
    >
      <div className="mge-seq-body">
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Chart settings</span>
          </div>
          <div className="mge-seq-row">
            <span className="mge-seq-row-label">title</span>
            <input
              className="mge-seq-input mge-seq-input-wide"
              value={ir.title ?? ""}
              onChange={(e) => setIr({ ...ir, title: e.target.value || undefined })}
              placeholder="(no title)"
            />
          </div>
        </section>

        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Axes</span>
          </div>
          <div className="mge-seq-row">
            <span className="mge-seq-badge">x-axis</span>
            <input
              className="mge-seq-input mge-seq-input-wide"
              value={ir.xAxis?.left ?? ""}
              onChange={(e) =>
                setIr({
                  ...ir,
                  xAxis: e.target.value
                    ? { left: e.target.value, right: ir.xAxis?.right }
                    : undefined,
                })
              }
              placeholder="left label"
            />
            <span className="mge-seq-row-label">→</span>
            <input
              className="mge-seq-input mge-seq-input-wide"
              value={ir.xAxis?.right ?? ""}
              onChange={(e) =>
                setIr({
                  ...ir,
                  xAxis: ir.xAxis
                    ? { ...ir.xAxis, right: e.target.value || undefined }
                    : e.target.value
                      ? { left: "", right: e.target.value }
                      : undefined,
                })
              }
              placeholder="right label (optional)"
            />
          </div>
          <div className="mge-seq-row">
            <span className="mge-seq-badge">y-axis</span>
            <input
              className="mge-seq-input mge-seq-input-wide"
              value={ir.yAxis?.bottom ?? ""}
              onChange={(e) =>
                setIr({
                  ...ir,
                  yAxis: e.target.value
                    ? { bottom: e.target.value, top: ir.yAxis?.top }
                    : undefined,
                })
              }
              placeholder="bottom label"
            />
            <span className="mge-seq-row-label">→</span>
            <input
              className="mge-seq-input mge-seq-input-wide"
              value={ir.yAxis?.top ?? ""}
              onChange={(e) =>
                setIr({
                  ...ir,
                  yAxis: ir.yAxis
                    ? { ...ir.yAxis, top: e.target.value || undefined }
                    : e.target.value
                      ? { bottom: "", top: e.target.value }
                      : undefined,
                })
              }
              placeholder="top label (optional)"
            />
          </div>
        </section>

        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Quadrant labels</span>
          </div>
          {quadrantKeys.map((key) => (
            <div key={key} className="mge-seq-row">
              <span className="mge-seq-row-label">{quadrantLabels[key]}</span>
              <input
                className="mge-seq-input mge-seq-input-wide"
                value={ir.quadrants[key] ?? ""}
                onChange={(e) =>
                  setIr({
                    ...ir,
                    quadrants: { ...ir.quadrants, [key]: e.target.value || undefined },
                  })
                }
                placeholder="(no label)"
              />
            </div>
          ))}
        </section>
      </div>
    </EditorShell>
  );
};
