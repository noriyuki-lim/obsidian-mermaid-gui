import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { parseGantt } from "../../core/gantt/parser";
import { generateGantt } from "../../core/gantt/generator";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import type { GanttIR, GanttItem, GanttTask, GanttTaskStatus } from "../../core/gantt/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

type GanttCellColumn = "kind" | "label" | "id" | "modifiers" | "start" | "end";
type CellElement = HTMLInputElement | HTMLSelectElement;

const STATUSES: GanttTaskStatus[] = ["done", "active", "crit", "milestone"];
const COLUMNS: GanttCellColumn[] = ["kind", "label", "id", "modifiers", "start", "end"];
const DAY_MS = 24 * 60 * 60 * 1000;
const VIEWBOX_WIDTH = 920;
const CHART_LEFT = 154;
const CHART_RIGHT = 884;
const CHART_TOP = 56;
const ROW_HEIGHT = 38;
const BAR_HEIGHT = 16;

const seed = (src: string): GanttIR => {
  const r = parseGantt(src);
  return r.ok ? r.ir : { kind: "gantt", items: [] };
};

const uniqueStatuses = (mods: GanttTaskStatus[]) =>
  STATUSES.filter((status) => mods.includes(status));

const parseStatusInput = (value: string): GanttTaskStatus[] => {
  const tokens = value
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return uniqueStatuses(tokens.filter((token): token is GanttTaskStatus =>
    STATUSES.includes(token as GanttTaskStatus),
  ));
};

const isDateToken = (value: string | undefined): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value);

const parseDateUtc = (value: string | undefined): number | null => {
  if (!isDateToken(value)) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
};

const formatDateUtc = (time: number): string => {
  const date = new Date(time);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const parseDurationDays = (value: string | undefined): number | null => {
  if (!value) return null;
  const match = value.trim().match(/^(\d+)\s*([dhwMs])$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit === "h") return Math.max(1, Math.ceil(amount / 24));
  if (unit === "w") return amount * 7;
  if (unit === "m") return amount * 30;
  return amount;
};

const parseAfterReference = (value: string | undefined): string | null => {
  const match = value?.trim().match(/^after\s+(\S+)$/i);
  return match ? match[1] : null;
};

const addDays = (time: number, days: number) => time + days * DAY_MS;

const diffDays = (start: number, end: number) =>
  Math.max(1, Math.round((end - start) / DAY_MS));

const firstExplicitDate = (items: GanttItem[]) => {
  for (const item of items) {
    if (item.type !== "task") continue;
    const start = parseDateUtc(item.start);
    if (start !== null) return start;
    const end = parseDateUtc(item.end);
    if (end !== null) return end;
  }
  return Date.UTC(2024, 0, 1);
};

interface TaskLayout {
  index: number;
  task: GanttTask;
  row: number;
  start: number;
  end: number;
}

interface GanttTimeline {
  tasks: TaskLayout[];
  min: number;
  max: number;
  ticks: number[];
}

const buildTimeline = (ir: GanttIR): GanttTimeline => {
  const fallbackStart = firstExplicitDate(ir.items);
  const endById = new Map<string, number>();
  const tasks: TaskLayout[] = [];
  let previousEnd = fallbackStart;

  ir.items.forEach((item, index) => {
    if (item.type !== "task") return;

    const explicitStart = parseDateUtc(item.start);
    const afterId = parseAfterReference(item.start);
    const afterEnd = afterId ? endById.get(afterId) ?? null : null;
    const explicitEnd = parseDateUtc(item.end);
    const durationDays = parseDurationDays(item.end);
    const defaultDuration = item.modifiers.includes("milestone") ? 1 : 3;

    let start = explicitStart ?? afterEnd ?? previousEnd ?? fallbackStart;
    let end: number;

    if (explicitEnd !== null) {
      end = explicitEnd;
      if (explicitStart === null && afterEnd === null) {
        start = addDays(end, -defaultDuration);
      }
    } else {
      end = addDays(start, durationDays ?? defaultDuration);
    }

    if (end <= start) end = addDays(start, 1);

    tasks.push({ index, task: item, row: tasks.length, start, end });
    previousEnd = end;
    if (item.id) endById.set(item.id, end);
  });

  const rawMin = tasks.length ? Math.min(...tasks.map((task) => task.start)) : fallbackStart;
  const rawMax = tasks.length ? Math.max(...tasks.map((task) => task.end)) : addDays(fallbackStart, 14);
  const min = addDays(rawMin, -1);
  const max = addDays(rawMax, 2);
  const totalDays = diffDays(min, max);
  const step = totalDays > 90 ? 14 : totalDays > 45 ? 7 : 3;
  const ticks: number[] = [];
  for (let t = min; t <= max; t = addDays(t, step)) ticks.push(t);
  if (!ticks.includes(max)) ticks.push(max);
  return { tasks, min, max, ticks };
};

const taskColorClass = (task: GanttTask) => {
  if (task.modifiers.includes("crit")) return "crit";
  if (task.modifiers.includes("done")) return "done";
  if (task.modifiers.includes("active")) return "active";
  if (task.modifiers.includes("milestone")) return "milestone";
  return "default";
};

interface GanttPreviewProps {
  ir: GanttIR;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onPatchTask: (index: number, patch: Partial<GanttTask>) => void;
  onAddTask: (start?: string) => void;
}

const GanttInteractivePreview = ({
  ir,
  selectedIndex,
  onSelect,
  onPatchTask,
  onAddTask,
}: GanttPreviewProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const dragRef = useRef<{
    index: number;
    pointerId: number;
    mode: "move" | "resize-start" | "resize-end";
    clientX: number;
    start: number;
    end: number;
    originalEnd?: string;
  } | null>(null);

  const timeline = useMemo(() => buildTimeline(ir), [ir]);
  const spanDays = Math.max(1, (timeline.max - timeline.min) / DAY_MS);
  const chartWidth = CHART_RIGHT - CHART_LEFT;
  const height = Math.max(220, CHART_TOP + Math.max(timeline.tasks.length, 1) * ROW_HEIGHT + 52);

  const xForDate = (time: number) =>
    CHART_LEFT + ((time - timeline.min) / (timeline.max - timeline.min)) * chartWidth;

  const dateForClientX = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const scaledChartLeft = (CHART_LEFT / VIEWBOX_WIDTH) * rect.width;
    const scaledChartWidth = (chartWidth / VIEWBOX_WIDTH) * rect.width;
    const ratio = Math.min(Math.max((clientX - rect.left - scaledChartLeft) / scaledChartWidth, 0), 1);
    return addDays(timeline.min, Math.round(ratio * spanDays));
  };

  const daysDeltaForClient = (clientX: number, startClientX: number) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const scaledChartWidth = (chartWidth / VIEWBOX_WIDTH) * rect.width;
    return Math.round(((clientX - startClientX) / scaledChartWidth) * spanDays);
  };

  const startDrag = (
    layout: TaskLayout,
    mode: "move" | "resize-start" | "resize-end",
  ) => (event: ReactPointerEvent<SVGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    onSelect(layout.index);
    dragRef.current = {
      index: layout.index,
      pointerId: event.pointerId,
      mode,
      clientX: event.clientX,
      start: layout.start,
      end: layout.end,
      originalEnd: layout.task.end,
    };
  };

  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    try {
      (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    } catch {
      // Already released by the browser.
    }
    dragRef.current = null;
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = daysDeltaForClient(event.clientX, drag.clientX);
    if (delta === 0) return;

    if (drag.mode === "move") {
      const nextStart = addDays(drag.start, delta);
      const nextEnd = addDays(drag.end, delta);
      onPatchTask(drag.index, {
        start: formatDateUtc(nextStart),
        end: parseDurationDays(drag.originalEnd) !== null
          ? drag.originalEnd
          : formatDateUtc(nextEnd),
      });
      return;
    }

    if (drag.mode === "resize-start") {
      const nextStart = Math.min(addDays(drag.start, delta), addDays(drag.end, -1));
      onPatchTask(drag.index, {
        start: formatDateUtc(nextStart),
        end: parseDurationDays(drag.originalEnd) !== null
          ? `${diffDays(nextStart, drag.end)}d`
          : formatDateUtc(drag.end),
      });
      return;
    }

    const nextEnd = Math.max(addDays(drag.end, delta), addDays(drag.start, 1));
    onPatchTask(drag.index, {
      end: parseDurationDays(drag.originalEnd) !== null
        ? `${diffDays(drag.start, nextEnd)}d`
        : formatDateUtc(nextEnd),
    });
  };

  const onBackgroundDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const target = event.target as Element;
    if (event.target !== event.currentTarget && !target.classList.contains("mge-gantt-bg")) return;
    const date = dateForClientX(event.clientX);
    onAddTask(date ? formatDateUtc(date) : undefined);
  };

  return (
    <div className="mge-gantt-preview">
      <div className="mge-gantt-preview-tools">
        <span>{ir.title || "Gantt chart"}</span>
        <button className="mge-gantt-preview-btn" onClick={() => onAddTask()}>
          + task
        </button>
      </div>
      <svg
        ref={svgRef}
        className="mge-gantt-preview-svg"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${height}`}
        preserveAspectRatio="xMinYMin meet"
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onDoubleClick={onBackgroundDoubleClick}
      >
        <rect x={0} y={0} width={VIEWBOX_WIDTH} height={height} className="mge-gantt-bg" />
        <line x1={CHART_LEFT} y1={CHART_TOP - 14} x2={CHART_RIGHT} y2={CHART_TOP - 14} className="mge-gantt-axis" />
        {timeline.ticks.map((tick) => {
          const x = xForDate(tick);
          return (
            <g key={tick}>
              <line x1={x} y1={CHART_TOP - 16} x2={x} y2={height - 28} className="mge-gantt-grid-line" />
              <text x={x} y={CHART_TOP - 24} className="mge-gantt-tick" textAnchor="middle">
                {formatDateUtc(tick).slice(5)}
              </text>
            </g>
          );
        })}

        {timeline.tasks.length === 0 ? (
          <text x={VIEWBOX_WIDTH / 2} y={height / 2} className="mge-gantt-empty-preview" textAnchor="middle">
            + task で追加、または空白をダブルクリック
          </text>
        ) : null}

        {timeline.tasks.map((layout) => {
          const x = xForDate(layout.start);
          const w = Math.max(8, xForDate(layout.end) - x);
          const y = CHART_TOP + layout.row * ROW_HEIGHT;
          const selected = selectedIndex === layout.index;
          const editing = editingIndex === layout.index;
          const colorClass = taskColorClass(layout.task);
          const isMilestone = layout.task.modifiers.includes("milestone");

          return (
            <g
              key={layout.index}
              className={`mge-gantt-task ${selected ? "selected" : ""} ${colorClass}`}
              onPointerDown={startDrag(layout, "move")}
              onDoubleClick={(event) => {
                event.stopPropagation();
                setEditingIndex(layout.index);
                onSelect(layout.index);
              }}
            >
              <text x={10} y={y + 15} className="mge-gantt-row-label">
                {layout.task.label || "(untitled)"}
              </text>
              {isMilestone ? (
                <rect
                  x={x}
                  y={y + 4}
                  width={BAR_HEIGHT}
                  height={BAR_HEIGHT}
                  transform={`rotate(45 ${x + BAR_HEIGHT / 2} ${y + 4 + BAR_HEIGHT / 2})`}
                  rx={2}
                  className="mge-gantt-bar"
                />
              ) : (
                <rect
                  x={x}
                  y={y + 4}
                  width={w}
                  height={BAR_HEIGHT}
                  rx={4}
                  className="mge-gantt-bar"
                />
              )}
              <rect
                x={x - 4}
                y={y + 2}
                width={8}
                height={BAR_HEIGHT + 4}
                className="mge-gantt-resize-hit"
                onPointerDown={startDrag(layout, "resize-start")}
              />
              <rect
                x={x + w - 4}
                y={y + 2}
                width={8}
                height={BAR_HEIGHT + 4}
                className="mge-gantt-resize-hit"
                onPointerDown={startDrag(layout, "resize-end")}
              />
              {editing ? (
                <foreignObject x={Math.min(x + 8, CHART_RIGHT - 210)} y={y - 1} width={206} height={28}>
                  <input
                    className="mge-gantt-inline-input"
                    value={layout.task.label}
                    autoFocus
                    onPointerDown={(event) => event.stopPropagation()}
                    onChange={(event) => onPatchTask(layout.index, { label: event.target.value })}
                    onBlur={() => setEditingIndex(null)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter" || event.key === "Escape") {
                        setEditingIndex(null);
                      }
                    }}
                  />
                </foreignObject>
              ) : (
                <text x={x + w + 8} y={y + 17} className="mge-gantt-bar-label">
                  {layout.task.id ? `${layout.task.label} (${layout.task.id})` : layout.task.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mge-gantt-preview-help">
        バーをドラッグして移動。左右端で期間変更。ダブルクリックでタスク名編集。
      </p>
    </div>
  );
};

export const GanttEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const [ir, setIr] = useState<GanttIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<number, string>>({});
  const cellRefs = useRef(new Map<string, CellElement>());

  const patchItem = useCallback((idx: number, patch: Partial<GanttItem>) => {
    setIr((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? ({ ...it, ...patch } as GanttItem) : it)),
    }));
  }, []);

  const patchTask = useCallback((idx: number, patch: Partial<GanttTask>) => {
    setIr((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === idx && item.type === "task" ? { ...item, ...patch } : item,
      ),
    }));
  }, []);

  const deleteItem = (idx: number) => {
    setIr((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
    setStatusDrafts((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const row = Number(key);
        if (row < idx) next[row] = value;
        else if (row > idx) next[row - 1] = value;
      });
      return next;
    });
    setSelectedIndex((prev) => (prev === idx ? null : prev !== null && prev > idx ? prev - 1 : prev));
  };

  const addSection = () =>
    setIr((prev) => ({
      ...prev,
      items: [...prev.items, { type: "section", title: "New Section" }],
    }));

  const addTask = useCallback((start?: string) => {
    setIr((prev) => {
      const nextIndex = prev.items.length;
      setSelectedIndex(nextIndex);
      return {
        ...prev,
        items: [
          ...prev.items,
          { type: "task", label: "New task", modifiers: [], start, end: "3d" },
        ],
      };
    });
  }, []);

  const setItemKind = (idx: number, kind: GanttItem["type"]) => {
    setIr((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i !== idx || item.type === kind) return item;
        if (kind === "section") {
          const title =
            item.type === "task"
              ? item.label
              : item.type === "raw"
                ? item.line.trim() || "New Section"
                : "New Section";
          return { type: "section", title };
        }
        if (kind === "task") {
          const label =
            item.type === "section"
              ? item.title
              : item.type === "raw"
                ? item.line.trim() || "New task"
                : "New task";
          return { type: "task", label, modifiers: [], end: "3d" };
        }
        return {
          type: "raw",
          line:
            item.type === "section"
              ? `    section ${item.title}`
              : item.type === "task"
                ? `    ${item.label} :${item.end ?? ""}`
                : "",
        };
      }),
    }));
  };

  const currentSource = useMemo(() => generateGantt(ir), [ir]);

  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const r = parseGantt(next);
    if (!r.ok) return { ok: false, error: r.message };
    setIr(r.ir);
    setStatusDrafts({});
    setSelectedIndex(null);
    return { ok: true };
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

  const cellKey = (row: number, column: GanttCellColumn) => `${row}:${column}`;

  const registerCell = (row: number, column: GanttCellColumn) => (element: CellElement | null) => {
    const key = cellKey(row, column);
    if (element) cellRefs.current.set(key, element);
    else cellRefs.current.delete(key);
  };

  const focusCell = (row: number, colIndex: number) => {
    const maxRow = ir.items.length - 1;
    if (maxRow < 0) return;
    const nextRow = Math.min(Math.max(row, 0), maxRow);
    const nextCol = Math.min(Math.max(colIndex, 0), COLUMNS.length - 1);
    window.setTimeout(() => {
      const el = cellRefs.current.get(cellKey(nextRow, COLUMNS[nextCol]));
      el?.focus();
      if (el instanceof HTMLInputElement) el.select();
    }, 0);
  };

  const onCellKeyDown = (row: number, colIndex: number) => (event: KeyboardEvent<CellElement>) => {
    const move = (nextRow: number, nextCol: number) => {
      event.preventDefault();
      focusCell(nextRow, nextCol);
    };

    if (event.key === "Tab") {
      const delta = event.shiftKey ? -1 : 1;
      const flat = row * COLUMNS.length + colIndex + delta;
      const maxFlat = Math.max(0, ir.items.length * COLUMNS.length - 1);
      const clamped = Math.min(Math.max(flat, 0), maxFlat);
      move(Math.floor(clamped / COLUMNS.length), clamped % COLUMNS.length);
    } else if (event.key === "Enter") {
      move(Math.min(row + 1, ir.items.length - 1), colIndex);
    } else if (event.key === "ArrowRight") {
      move(row, colIndex + 1);
    } else if (event.key === "ArrowLeft") {
      move(row, colIndex - 1);
    } else if (event.key === "ArrowDown") {
      move(row + 1, colIndex);
    } else if (event.key === "ArrowUp") {
      move(row - 1, colIndex);
    }
  };

  const renderTextCell = (item: GanttItem, idx: number) => {
    if (item.type === "section") {
      return (
        <input
          ref={registerCell(idx, "label")}
          className="mge-gantt-cell-input"
          value={item.title}
          onFocus={() => setSelectedIndex(idx)}
          onKeyDown={onCellKeyDown(idx, 1)}
          onChange={(event) => patchItem(idx, { title: event.target.value })}
        />
      );
    }
    if (item.type === "raw") {
      return (
        <input
          ref={registerCell(idx, "label")}
          className="mge-gantt-cell-input mge-gantt-cell-mono"
          value={item.line}
          onFocus={() => setSelectedIndex(idx)}
          onKeyDown={onCellKeyDown(idx, 1)}
          onChange={(event) => patchItem(idx, { line: event.target.value })}
        />
      );
    }
    return (
      <input
        ref={registerCell(idx, "label")}
        className="mge-gantt-cell-input"
        value={item.label}
        onFocus={() => setSelectedIndex(idx)}
        onKeyDown={onCellKeyDown(idx, 1)}
        onChange={(event) => patchTask(idx, { label: event.target.value })}
      />
    );
  };

  return (
    <EditorShell
      currentSource={currentSource}
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      renderMermaid={renderMermaid}
      onSourceEdit={handleSourceEdit}
      layout="stacked"
      sourceToggleLabel="ソースを表示"
      previewOverride={
        <GanttInteractivePreview
          ir={ir}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onPatchTask={patchTask}
          onAddTask={addTask}
        />
      }
    >
      <div className="mge-gantt-editor">
        <section className="mge-gantt-settings">
          <label>
            <span>title</span>
            <input
              className="mge-gantt-field"
              value={ir.title ?? ""}
              onChange={(event) => setIr({ ...ir, title: event.target.value || undefined })}
              placeholder="(no title)"
            />
          </label>
          <label>
            <span>dateFormat</span>
            <input
              className="mge-gantt-field"
              value={ir.dateFormat ?? ""}
              onChange={(event) => setIr({ ...ir, dateFormat: event.target.value || undefined })}
              placeholder="YYYY-MM-DD"
            />
          </label>
          <div className="mge-gantt-table-actions">
            <button className="mge-gantt-action" onClick={addSection}>+ section</button>
            <button className="mge-gantt-action" onClick={() => addTask()}>+ task</button>
          </div>
        </section>

        <section className="mge-gantt-grid-shell" aria-label="Gantt task table">
          <div className="mge-gantt-grid-header">
            <span>type</span>
            <span>label / section / raw</span>
            <span>id</span>
            <span>status</span>
            <span>start</span>
            <span>end</span>
            <span />
          </div>
          {ir.items.length === 0 ? (
            <div className="mge-gantt-grid-empty">+ task か + section で開始。</div>
          ) : null}
          {ir.items.map((item, idx) => {
            const task = item.type === "task" ? item : null;
            const rowClass = [
              "mge-gantt-grid-row",
              item.type === "section" ? "section" : "",
              item.type === "raw" ? "raw" : "",
              selectedIndex === idx ? "selected" : "",
            ].filter(Boolean).join(" ");

            return (
              <div key={idx} className={rowClass}>
                <select
                  ref={registerCell(idx, "kind")}
                  className="mge-gantt-cell-select"
                  value={item.type}
                  onFocus={() => setSelectedIndex(idx)}
                  onKeyDown={onCellKeyDown(idx, 0)}
                  onChange={(event) => setItemKind(idx, event.target.value as GanttItem["type"])}
                >
                  <option value="task">task</option>
                  <option value="section">section</option>
                  <option value="raw">raw</option>
                </select>

                {renderTextCell(item, idx)}

                <input
                  ref={registerCell(idx, "id")}
                  className="mge-gantt-cell-input"
                  value={task?.id ?? ""}
                  readOnly={!task}
                  aria-disabled={!task}
                  onFocus={() => setSelectedIndex(idx)}
                  onKeyDown={onCellKeyDown(idx, 2)}
                  onChange={(event) => patchTask(idx, { id: event.target.value || undefined })}
                  placeholder="id"
                />
                <input
                  ref={registerCell(idx, "modifiers")}
                  className="mge-gantt-cell-input"
                  value={task ? statusDrafts[idx] ?? task.modifiers.join(", ") : ""}
                  readOnly={!task}
                  aria-disabled={!task}
                  onFocus={() => setSelectedIndex(idx)}
                  onKeyDown={onCellKeyDown(idx, 3)}
                  onBlur={(event) => {
                    if (!task) return;
                    patchTask(idx, { modifiers: parseStatusInput(event.target.value) });
                    setStatusDrafts((prev) => {
                      const next = { ...prev };
                      delete next[idx];
                      return next;
                    });
                  }}
                  onChange={(event) => {
                    const next = event.target.value;
                    setStatusDrafts((prev) => ({ ...prev, [idx]: next }));
                    patchTask(idx, { modifiers: parseStatusInput(next) });
                  }}
                  placeholder="done, active"
                />
                <input
                  ref={registerCell(idx, "start")}
                  className="mge-gantt-cell-input"
                  value={task?.start ?? ""}
                  readOnly={!task}
                  aria-disabled={!task}
                  onFocus={() => setSelectedIndex(idx)}
                  onKeyDown={onCellKeyDown(idx, 4)}
                  onChange={(event) => patchTask(idx, { start: event.target.value || undefined })}
                  placeholder="YYYY-MM-DD / after id"
                />
                <input
                  ref={registerCell(idx, "end")}
                  className="mge-gantt-cell-input"
                  value={task?.end ?? ""}
                  readOnly={!task}
                  aria-disabled={!task}
                  onFocus={() => setSelectedIndex(idx)}
                  onKeyDown={onCellKeyDown(idx, 5)}
                  onChange={(event) => patchTask(idx, { end: event.target.value || undefined })}
                  placeholder="YYYY-MM-DD / 7d"
                />
                <button
                  className="mge-gantt-delete"
                  aria-label="Delete item"
                  onClick={() => deleteItem(idx)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </section>
      </div>
    </EditorShell>
  );
};
