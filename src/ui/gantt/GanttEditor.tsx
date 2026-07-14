import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { parseGantt } from "../../core/gantt/parser";
import { generateGantt } from "../../core/gantt/generator";
import { formatGanttAxisTick } from "../../core/gantt/axis-format";
import {
  formatDurationToken,
  oneUnitMs,
  parseDurationDays,
  parseDurationToken,
  type GanttDurationUnit,
} from "../../core/gantt/duration";
import { buildTicks, paddedRange, pickTickIntervalMs } from "../../core/gantt/tick-scale";
import {
  DEFAULT_DATE_FORMAT,
  addDateField,
  fieldAtCaret,
  formatDateWithFormat,
  isDateStringForFormat,
  nativeDateInput,
  parseDateWithFormat,
} from "../../core/gantt/date-format";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import { useT } from "../EditorHostContext";
import { blurOnEscape } from "../keyboard";
import type { GanttIR, GanttItem, GanttTask, GanttTaskStatus } from "../../core/gantt/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

type GanttCellColumn = "kind" | "label" | "id" | "modifiers" | "start" | "end";
type CellElement = HTMLInputElement | HTMLSelectElement;
type ScheduleField = "start" | "end";
type SchedulePickerMode = "duration" | "after";
type ScheduleValueType = "date" | "duration" | "after";

type PrimaryStatus = GanttTaskStatus | "";
/** Statuses selectable as the single "primary" status in the table dropdown. */
const PRIMARY_STATUSES: PrimaryStatus[] = ["", "done", "active", "milestone"];
const COLUMNS: GanttCellColumn[] = ["kind", "label", "id", "modifiers", "start", "end"];
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_TASK_DURATION_MS = 60_000; // 1 minute — last-resort guard, not a general minimum
const CHART_LEFT = 154;
const CHART_TOP = 56;
const ROW_HEIGHT = 38;
const BAR_HEIGHT = 16;
const EDGE_HANDLE_W = 10;
const MIN_VIEWBOX_WIDTH = 920;
const CHART_RIGHT_PAD = 36;

const seed = (src: string): GanttIR => {
  const r = parseGantt(src);
  return r.ok ? r.ir : { kind: "gantt", items: [] };
};

/** Primary status = the first non-crit status; crit is an orthogonal flag. */
const primaryStatus = (mods: GanttTaskStatus[]): PrimaryStatus => {
  const found = mods.find((m) => m !== "crit");
  return found ?? "";
};

/**
 * Recompose modifiers from a primary selection + crit flag, preserving the
 * `:crit, active` round-trip order (crit first when combined).
 */
const composeModifiers = (primary: PrimaryStatus, crit: boolean): GanttTaskStatus[] => {
  const out: GanttTaskStatus[] = [];
  if (crit) out.push("crit");
  if (primary) out.push(primary);
  return out;
};

/**
 * Whether `value` is a date/time token — shaped to the chart's own
 * `dateFormat` (e.g. `HH:mm`), not a hardcoded `YYYY-MM-DD` assumption.
 */
const isDateToken = (value: string | undefined, dateFormat: string): value is string =>
  typeof value === "string" && isDateStringForFormat(value, dateFormat);

const parseDateUtc = (value: string | undefined, dateFormat: string): number | null => {
  if (!isDateToken(value, dateFormat)) return null;
  return parseDateWithFormat(value, dateFormat);
};

const formatDateUtc = (time: number, dateFormat: string): string => formatDateWithFormat(time, dateFormat);

const parseAfterReference = (value: string | undefined): string | null => {
  const match = value?.trim().match(/^after\s+(\S+)$/i);
  return match ? match[1] : null;
};

const isAfterReference = (value: string | undefined) => parseAfterReference(value) !== null;

const addDays = (time: number, days: number) => time + days * DAY_MS;

const todayDate = (dateFormat: string) => formatDateUtc(Date.now(), dateFormat);

/**
 * `setPointerCapture` can throw (e.g. `NotFoundError` if the browser no
 * longer considers the pointer active) — unlike its `releasePointerCapture`
 * counterpart elsewhere in this file, it wasn't wrapped, so a throw here
 * used to abort the rest of the handler, silently skipping the drag-ref
 * assignment that follows it and leaving the gesture dead on arrival.
 */
const trySetPointerCapture = (el: Element, pointerId: number) => {
  try {
    el.setPointerCapture?.(pointerId);
  } catch {
    // best-effort — the drag still tracks via the ref below regardless
  }
};

const scheduleValueType = (field: ScheduleField, value: string | undefined): ScheduleValueType => {
  if (field === "start" && isAfterReference(value)) return "after";
  if (field === "end" && parseDurationDays(value) !== null) return "duration";
  return "date";
};

const firstExplicitDate = (items: GanttItem[], dateFormat: string) => {
  for (const item of items) {
    if (item.type !== "task") continue;
    const start = parseDateUtc(item.start, dateFormat);
    if (start !== null) return start;
    const end = parseDateUtc(item.end, dateFormat);
    if (end !== null) return end;
  }
  return Date.UTC(2024, 0, 1);
};

// ---- axisFormat presets (goals 1 & 2) ----------------------------------

const AXIS_PRESET_VALUES = ["%m/%d", "%W"] as const;

/** Strip a trailing weekday token like `(%a)` or `%a`, returning base + flag. */
const splitWeekday = (fmt: string): { base: string; weekday: boolean } => {
  const m = fmt.match(/^(.*?)(\(%a\)|%a)\s*$/);
  if (m) return { base: m[1], weekday: true };
  return { base: fmt, weekday: false };
};

const composeAxisFormat = (base: string, weekday: boolean): string => {
  const trimmed = base.trim();
  if (!weekday) return trimmed;
  if (!trimmed) return "%a";
  return `${trimmed}(%a)`;
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
  sectionSpans: { title: string; fromRow: number; toRow: number }[];
  min: number;
  max: number;
  ticks: number[];
}

const buildTimeline = (ir: GanttIR): GanttTimeline => {
  const dateFormat = ir.dateFormat ?? DEFAULT_DATE_FORMAT;
  const fallbackStart = firstExplicitDate(ir.items, dateFormat);
  const endById = new Map<string, number>();
  const tasks: TaskLayout[] = [];
  const sectionSpans: { title: string; fromRow: number; toRow: number }[] = [];
  let previousEnd = fallbackStart;
  let currentSection: { title: string; fromRow: number; toRow: number } | null = null;

  ir.items.forEach((item, index) => {
    if (item.type === "section") {
      if (currentSection) sectionSpans.push(currentSection);
      currentSection = { title: item.title, fromRow: tasks.length, toRow: tasks.length - 1 };
      return;
    }
    if (item.type !== "task") return;

    const explicitStart = parseDateUtc(item.start, dateFormat);
    const afterId = parseAfterReference(item.start);
    const afterEnd = afterId ? endById.get(afterId) ?? null : null;
    const explicitEnd = parseDateUtc(item.end, dateFormat);
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

    if (end <= start) end = start + MIN_TASK_DURATION_MS;

    const row = tasks.length;
    tasks.push({ index, task: item, row, start, end });
    if (currentSection) currentSection.toRow = row;
    previousEnd = end;
    if (item.id) endById.set(item.id, end);
  });
  if (currentSection) sectionSpans.push(currentSection);

  const rawMin = tasks.length ? Math.min(...tasks.map((task) => task.start)) : fallbackStart;
  const rawMax = tasks.length ? Math.max(...tasks.map((task) => task.end)) : addDays(fallbackStart, 14);
  const { min, max } = paddedRange(rawMin, rawMax);
  const ticks = buildTicks(min, max, pickTickIntervalMs(max - min));
  return { tasks, sectionSpans, min, max, ticks };
};

const taskColorClass = (task: GanttTask) => {
  if (task.modifiers.includes("crit")) return "crit";
  if (task.modifiers.includes("done")) return "done";
  if (task.modifiers.includes("active")) return "active";
  if (task.modifiers.includes("milestone")) return "milestone";
  return "default";
};

type Selection =
  | { type: "task"; index: number }
  | { type: "dep"; index: number }
  | null;

interface GanttPreviewProps {
  ir: GanttIR;
  axisPreset: string;
  axisWeekday: boolean;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onPatchTask: (index: number, patch: Partial<GanttTask>) => void;
  onAddTask: (start?: string) => void;
  onLinkAfter: (sourceIndex: number, targetIndex: number) => void;
  onAxisPresetChange: (value: string) => void;
  onAxisWeekdayChange: (value: boolean) => void;
  onAxisFormatChange: (value: string) => void;
  onReorderItem: (from: number, to: number) => void;
}

const GanttInteractivePreview = ({
  ir,
  axisPreset,
  axisWeekday,
  selection,
  onSelect,
  onPatchTask,
  onAddTask,
  onLinkAfter,
  onAxisPresetChange,
  onAxisWeekdayChange,
  onAxisFormatChange,
  onReorderItem,
}: GanttPreviewProps) => {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [viewBoxWidth, setViewBoxWidth] = useState(MIN_VIEWBOX_WIDTH);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // Viewport zoom (goal 4): SESSION-ONLY. Never flows into IR / source.
  const [viewport, setViewport] = useState<{ min: number; max: number } | null>(null);
  const dragRef = useRef<{
    index: number;
    pointerId: number;
    mode: "move" | "resize-start" | "resize-end";
    clientX: number;
    start: number;
    end: number;
    originalStart?: string;
    originalEnd?: string;
  } | null>(null);
  const edgeDragRef = useRef<{
    pointerId: number;
    side: "left" | "right";
    clientX: number;
    min: number;
    max: number;
  } | null>(null);
  const linkDragRef = useRef<{
    sourceIndex: number;
    pointerId: number;
  } | null>(null);
  const [linkCursor, setLinkCursor] = useState<{ x: number; y: number; fromX: number; fromY: number } | null>(null);
  const rowDragRef = useRef<{ pointerId: number; currentIndex: number } | null>(null);
  const [previewDraggingIndex, setPreviewDraggingIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setViewBoxWidth(Math.max(MIN_VIEWBOX_WIDTH, Math.round(rect.width)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const dateFormat = ir.dateFormat ?? DEFAULT_DATE_FORMAT;
  const baseTimeline = useMemo(() => buildTimeline(ir), [ir]);
  const min = viewport?.min ?? baseTimeline.min;
  const max = viewport?.max ?? baseTimeline.max;
  const chartRight = Math.max(CHART_LEFT + 240, viewBoxWidth - CHART_RIGHT_PAD);
  const chartWidth = chartRight - CHART_LEFT;
  const height = Math.max(220, CHART_TOP + Math.max(baseTimeline.tasks.length, 1) * ROW_HEIGHT + 52);

  // Recompute ticks for the (possibly zoomed) viewport.
  const ticks = useMemo(
    () => buildTicks(min, max, pickTickIntervalMs(max - min)),
    [min, max],
  );

  const xForDate = (time: number) => CHART_LEFT + ((time - min) / (max - min)) * chartWidth;
  const yForRow = (row: number) => CHART_TOP + row * ROW_HEIGHT;

  const clientToViewbox = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const scale = viewBoxWidth / rect.width;
    return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
  };

  const dateForClientX = (clientX: number) => {
    const vb = clientToViewbox(clientX, 0);
    if (!vb) return null;
    const ratio = Math.min(Math.max((vb.x - CHART_LEFT) / chartWidth, 0), 1);
    const rawTime = min + ratio * (max - min);
    // Snap to the visible tick granularity rather than a flat whole day —
    // a whole-day snap collapses to a single position on sub-day charts.
    const snap = pickTickIntervalMs(max - min);
    return Math.round(rawTime / snap) * snap;
  };

  /**
   * Continuous (unrounded) pixel-to-time delta. Unlike the old whole-day
   * rounding, this scales correctly for sub-day timelines (`dateFormat
   * HH:mm` etc.) — rounding to a sensible granularity happens downstream,
   * at the point where a value is re-serialized (day-precision for date
   * fields via `formatDateUtc`, native-unit precision for duration tokens
   * via `formatDurationToken`).
   */
  const msDeltaForClient = (clientX: number, startClientX: number) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const scaledChartWidth = (chartWidth / viewBoxWidth) * rect.width;
    return ((clientX - startClientX) / scaledChartWidth) * (max - min);
  };

  const startDrag = (
    layout: TaskLayout,
    mode: "move" | "resize-start" | "resize-end",
  ) => (event: ReactPointerEvent<SVGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    trySetPointerCapture(event.currentTarget as Element, event.pointerId);
    onSelect({ type: "task", index: layout.index });
    dragRef.current = {
      index: layout.index,
      pointerId: event.pointerId,
      mode,
      clientX: event.clientX,
      start: layout.start,
      end: layout.end,
      originalStart: layout.task.start,
      originalEnd: layout.task.end,
    };
  };

  // Dependency link drag (goal 5): grab the link handle on a bar's right edge.
  const startLinkDrag = (layout: TaskLayout) => (event: ReactPointerEvent<SVGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    trySetPointerCapture(event.currentTarget as Element, event.pointerId);
    linkDragRef.current = { sourceIndex: layout.index, pointerId: event.pointerId };
    const fromX = xForDate(layout.end);
    const fromY = yForRow(layout.row) + 4 + BAR_HEIGHT / 2;
    setLinkCursor({ x: fromX, y: fromY, fromX, fromY });
  };

  // Viewport edge zoom drag (goal 4): SESSION-ONLY.
  const startEdgeDrag = (side: "left" | "right") => (event: ReactPointerEvent<SVGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    trySetPointerCapture(event.currentTarget as Element, event.pointerId);
    edgeDragRef.current = { pointerId: event.pointerId, side, clientX: event.clientX, min, max };
  };

  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (rowDragRef.current && rowDragRef.current.pointerId === event.pointerId) {
      rowDragRef.current = null;
      setPreviewDraggingIndex(null);
    }
    if (linkDragRef.current && linkDragRef.current.pointerId === event.pointerId) {
      // Resolve drop target: a bar under the pointer.
      const vb = clientToViewbox(event.clientX, event.clientY);
      const source = linkDragRef.current.sourceIndex;
      if (vb) {
        const target = baseTimeline.tasks.find((t) => {
          const y = yForRow(t.row);
          return vb.y >= y && vb.y <= y + ROW_HEIGHT && t.index !== source;
        });
        if (target) onLinkAfter(source, target.index);
      }
      linkDragRef.current = null;
      setLinkCursor(null);
    }
    if (dragRef.current && dragRef.current.pointerId === event.pointerId) dragRef.current = null;
    if (edgeDragRef.current && edgeDragRef.current.pointerId === event.pointerId) edgeDragRef.current = null;
    try {
      (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    } catch {
      // already released
    }
  };

  const startRowDrag = (layout: TaskLayout) => (event: ReactPointerEvent<SVGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    trySetPointerCapture(event.currentTarget as Element, event.pointerId);
    rowDragRef.current = { pointerId: event.pointerId, currentIndex: layout.index };
    setPreviewDraggingIndex(layout.index);
    onSelect({ type: "task", index: layout.index });
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rowDrag = rowDragRef.current;
    if (rowDrag && rowDrag.pointerId === event.pointerId) {
      const vb = clientToViewbox(event.clientX, event.clientY);
      if (!vb) return;
      const target = baseTimeline.tasks.find((t) => {
        const y = yForRow(t.row);
        return vb.y >= y && vb.y <= y + ROW_HEIGHT;
      });
      if (target && target.index !== rowDrag.currentIndex) {
        onReorderItem(rowDrag.currentIndex, target.index);
        rowDrag.currentIndex = target.index;
        setPreviewDraggingIndex(target.index);
      }
      return;
    }

    const link = linkDragRef.current;
    if (link && link.pointerId === event.pointerId) {
      const vb = clientToViewbox(event.clientX, event.clientY);
      if (vb) setLinkCursor((prev) => (prev ? { ...prev, x: vb.x, y: vb.y } : prev));
      return;
    }

    const edge = edgeDragRef.current;
    if (edge && edge.pointerId === event.pointerId) {
      const deltaMs = msDeltaForClient(event.clientX, edge.clientX);
      if (deltaMs === 0) return;
      // Scale-aware zoom floor: roughly two ticks' worth of the current
      // span, instead of a flat 2-day minimum that made sub-day charts
      // (whose whole span may be under 2 days) impossible to zoom into.
      const minWidth = pickTickIntervalMs(Math.max(edge.max - edge.min, 1)) * 2;
      if (edge.side === "left") {
        const nextMin = Math.min(edge.min + deltaMs, edge.max - minWidth);
        setViewport({ min: nextMin, max: edge.max });
      } else {
        const nextMax = Math.max(edge.max + deltaMs, edge.min + minWidth);
        setViewport({ min: edge.min, max: nextMax });
      }
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaMs = msDeltaForClient(event.clientX, drag.clientX);
    if (deltaMs === 0) return;

    const originalEndToken = parseDurationToken(drag.originalEnd);

    if (drag.mode === "move") {
      const nextStart = drag.start + deltaMs;
      const nextEnd = drag.end + deltaMs;
      onPatchTask(drag.index, {
        start: formatDateUtc(nextStart, dateFormat),
        // Duration is relative to start and doesn't change on a plain move.
        end: originalEndToken ? drag.originalEnd : formatDateUtc(nextEnd, dateFormat),
      });
      return;
    }

    // Minimum start/end gap: one native unit of the task's own duration
    // token (e.g. 1 minute for a `9m` task) instead of a flat day, so
    // resizing a sub-day task doesn't get clamped to a day-scale minimum.
    const minGapMs = originalEndToken
      ? Math.max(oneUnitMs(originalEndToken.unit), MIN_TASK_DURATION_MS)
      : DAY_MS;

    if (drag.mode === "resize-start") {
      const nextStart = Math.min(drag.start + deltaMs, drag.end - minGapMs);
      const nextDurationDays = (drag.end - nextStart) / DAY_MS;
      const currentLayout = baseTimeline.tasks.find((task) => task.index === drag.index);
      const previousId = parseAfterReference(currentLayout?.task.start);
      const previousLayout = previousId
        ? baseTimeline.tasks.find((task) => task.task.id === previousId)
        : undefined;
      if (currentLayout && previousLayout) {
        const previousToken = parseDurationToken(previousLayout.task.end);
        onPatchTask(previousLayout.index, {
          end: previousToken
            ? formatDurationToken((nextStart - previousLayout.start) / DAY_MS, previousToken.unit)
            : formatDateUtc(nextStart, dateFormat),
        });
        onPatchTask(drag.index, {
          end: originalEndToken
            ? formatDurationToken(nextDurationDays, originalEndToken.unit)
            : drag.originalEnd,
        });
        return;
      }
      onPatchTask(drag.index, {
        start: formatDateUtc(nextStart, dateFormat),
        end: originalEndToken
          ? formatDurationToken(nextDurationDays, originalEndToken.unit)
          : formatDateUtc(drag.end, dateFormat),
      });
      return;
    }

    const nextEnd = Math.max(drag.end + deltaMs, drag.start + minGapMs);
    onPatchTask(drag.index, {
      end: originalEndToken
        ? formatDurationToken((nextEnd - drag.start) / DAY_MS, originalEndToken.unit)
        : formatDateUtc(nextEnd, dateFormat),
    });
    const currentLayout = baseTimeline.tasks.find((task) => task.index === drag.index);
    if (currentLayout?.task.id) {
      baseTimeline.tasks
        .filter((task) => parseAfterReference(task.task.start) === currentLayout.task.id)
        .forEach((successor) => {
          const successorToken = parseDurationToken(successor.task.end);
          if (!successorToken) return;
          onPatchTask(successor.index, {
            end: formatDurationToken((successor.end - nextEnd) / DAY_MS, successorToken.unit),
          });
        });
    }
  };

  const onBackgroundDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const target = event.target as Element;
    if (event.target !== event.currentTarget && !target.classList.contains("mge-gantt-bg")) return;
    const date = dateForClientX(event.clientX);
    onAddTask(date ? formatDateUtc(date, dateFormat) : undefined);
  };

  // Dependency lines (goal 5): each task whose start is `after <id>` draws a
  // connector from the source task's end to this task's start.
  const indexById = useMemo(() => {
    const m = new Map<string, TaskLayout>();
    baseTimeline.tasks.forEach((t) => {
      if (t.task.id) m.set(t.task.id, t);
    });
    return m;
  }, [baseTimeline.tasks]);

  const deps = useMemo(() => {
    const out: { fromX: number; fromY: number; toX: number; toY: number; targetIndex: number }[] = [];
    baseTimeline.tasks.forEach((t) => {
      const afterId = parseAfterReference(t.task.start);
      if (!afterId) return;
      const src = indexById.get(afterId);
      if (!src) return;
      out.push({
        fromX: xForDate(src.end),
        fromY: yForRow(src.row) + 4 + BAR_HEIGHT / 2,
        toX: xForDate(t.start),
        toY: yForRow(t.row) + 4 + BAR_HEIGHT / 2,
        targetIndex: t.index,
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseTimeline.tasks, indexById, min, max, chartWidth]);

  return (
    <div className="mge-gantt-preview" ref={wrapRef}>
      <div className="mge-gantt-preview-tools">
        <span>{ir.title || "Gantt chart"}</span>
        <div className="mge-gantt-preview-tool-group">
          <select
            className="mge-gantt-preview-field"
            value={axisPreset}
            onChange={(event) => onAxisPresetChange(event.target.value)}
            title="axis"
          >
            <option value="%m/%d">{t.gantt.axisPresetDate}</option>
            <option value="%W">{t.gantt.axisPresetWeek}</option>
            <option value="custom">{t.gantt.axisPresetCustom}</option>
          </select>
          <label className="mge-gantt-preview-check">
            <input
              type="checkbox"
              checked={axisWeekday}
              onChange={(event) => onAxisWeekdayChange(event.target.checked)}
            />
            {t.gantt.weekday}
          </label>
          <input
            className="mge-gantt-preview-field mge-gantt-preview-axis-input"
            value={ir.axisFormat ?? ""}
            onChange={(event) => onAxisFormatChange(event.target.value)}
            placeholder="%m/%d"
            title="axisFormat"
          />
          {viewport ? (
            <button className="mge-gantt-preview-btn" onClick={() => setViewport(null)}>
              {t.gantt.zoomReset}
            </button>
          ) : null}
          <button className="mge-gantt-preview-btn" onClick={() => onAddTask()}>
            + task
          </button>
        </div>
      </div>
      <svg
        ref={svgRef}
        className="mge-gantt-preview-svg"
        viewBox={`0 0 ${viewBoxWidth} ${height}`}
        preserveAspectRatio="xMinYMin meet"
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onDoubleClick={onBackgroundDoubleClick}
      >
        <rect x={0} y={0} width={viewBoxWidth} height={height} className="mge-gantt-bg" />
        <line x1={CHART_LEFT} y1={CHART_TOP - 14} x2={chartRight} y2={CHART_TOP - 14} className="mge-gantt-axis" />
        {ticks.map((tick) => {
          const x = xForDate(tick);
          return (
            <g key={tick}>
              <line x1={x} y1={CHART_TOP - 16} x2={x} y2={height - 28} className="mge-gantt-grid-line" />
              <text x={x} y={CHART_TOP - 24} className="mge-gantt-tick" textAnchor="middle">
                {formatGanttAxisTick(tick, ir.axisFormat ?? "%m/%d")}
              </text>
            </g>
          );
        })}

        {/* Section name gutter (goal 3) */}
        {baseTimeline.sectionSpans.map((span, i) => {
          if (span.toRow < span.fromRow) return null;
          const yTop = yForRow(span.fromRow);
          const yMid = yForRow(span.fromRow) + ((span.toRow - span.fromRow + 1) * ROW_HEIGHT) / 2;
          const yBot = yForRow(span.toRow) + ROW_HEIGHT;
          return (
            <g key={`sec-${i}`} className="mge-gantt-section-gutter">
              <line x1={CHART_LEFT - 4} y1={yTop} x2={CHART_LEFT - 4} y2={yBot} className="mge-gantt-section-rule" />
              <text x={16} y={yMid} className="mge-gantt-section-label" dominantBaseline="middle">
                {span.title}
              </text>
            </g>
          );
        })}

        {/* Viewport zoom edge handles (goal 4) */}
        <rect
          x={CHART_LEFT - EDGE_HANDLE_W}
          y={CHART_TOP - 16}
          width={EDGE_HANDLE_W}
          height={height - CHART_TOP - 12}
          className="mge-gantt-edge-handle"
          onPointerDown={startEdgeDrag("left")}
        />
        <rect
          x={chartRight}
          y={CHART_TOP - 16}
          width={EDGE_HANDLE_W}
          height={height - CHART_TOP - 12}
          className="mge-gantt-edge-handle"
          onPointerDown={startEdgeDrag("right")}
        />

        {/* Dependency connectors (goal 5) */}
        {deps.map((dep, i) => {
          const isSel = selection?.type === "dep" && selection.index === dep.targetIndex;
          return (
            <line
              key={`dep-${i}`}
              x1={dep.fromX}
              y1={dep.fromY}
              x2={dep.toX}
              y2={dep.toY}
              className={`mge-gantt-dep ${isSel ? "selected" : ""}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect({ type: "dep", index: dep.targetIndex });
              }}
            />
          );
        })}
        {linkCursor ? (
          <line
            x1={linkCursor.fromX}
            y1={linkCursor.fromY}
            x2={linkCursor.x}
            y2={linkCursor.y}
            className="mge-gantt-dep dragging"
          />
        ) : null}

        {baseTimeline.tasks.length === 0 ? (
          <text x={viewBoxWidth / 2} y={height / 2} className="mge-gantt-empty-preview" textAnchor="middle">
            {t.gantt.emptyPreviewHint}
          </text>
        ) : null}

        {baseTimeline.tasks.map((layout) => {
          const x = xForDate(layout.start);
          const w = Math.max(8, xForDate(layout.end) - x);
          const y = yForRow(layout.row);
          const selected = selection?.type === "task" && selection.index === layout.index;
          const editing = editingIndex === layout.index;
          const colorClass = taskColorClass(layout.task);
          const isMilestone = layout.task.modifiers.includes("milestone");

          return (
            <g
              key={layout.index}
              className={`mge-gantt-task ${selected ? "selected" : ""} ${previewDraggingIndex === layout.index ? "dragging" : ""} ${colorClass}`}
              onPointerDown={startDrag(layout, "move")}
              onDoubleClick={(event) => {
                event.stopPropagation();
                setEditingIndex(layout.index);
                onSelect({ type: "task", index: layout.index });
              }}
            >
              <g className="mge-gantt-row-handle-group" onPointerDown={startRowDrag(layout)}>
                <rect
                  x={CHART_LEFT - 44}
                  y={y + 1}
                  width={34}
                  height={BAR_HEIGHT + 8}
                  rx={6}
                  className="mge-gantt-row-handle"
                />
                {[0, 1, 2].map((dot) => (
                  <g key={dot}>
                    <circle cx={CHART_LEFT - 38} cy={y + 7 + dot * 5} r={1.1} className="mge-gantt-row-grip-dot" />
                    <circle cx={CHART_LEFT - 34} cy={y + 7 + dot * 5} r={1.1} className="mge-gantt-row-grip-dot" />
                  </g>
                ))}
                <text x={CHART_LEFT - 20} y={y + 17} className="mge-gantt-row-handle-label" textAnchor="middle">
                  {layout.task.id || "id"}
                </text>
              </g>
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
              {/* Link handle (goal 5): drag to another bar to set `after`. */}
              <circle
                cx={x + w + 6}
                cy={y + 4 + BAR_HEIGHT / 2}
                r={4}
                className="mge-gantt-link-handle"
                onPointerDown={startLinkDrag(layout)}
              />
              {editing ? (
                <foreignObject x={Math.min(x + 8, chartRight - 210)} y={y - 1} width={206} height={28}>
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
                <text x={x + w + 14} y={y + 17} className="mge-gantt-bar-label">
                  {layout.task.id ? `${layout.task.label} (${layout.task.id})` : layout.task.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mge-gantt-preview-help">{t.gantt.previewHelp}</p>
    </div>
  );
};

export const GanttEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const t = useT();
  const [ir, setIr] = useState<GanttIR>(() => seed(initialSource));
  const dateFormat = ir.dateFormat ?? DEFAULT_DATE_FORMAT;
  const [saving, setSaving] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  // Table interaction mode (goal 7): navigation vs cell-edit, Excel-like.
  const [editMode, setEditMode] = useState(false);
  const cellRefs = useRef(new Map<string, CellElement>());
  const tableDragRef = useRef<{ pointerId: number; currentIndex: number } | null>(null);
  const [tableDraggingIndex, setTableDraggingIndex] = useState<number | null>(null);
  const [schedulePicker, setSchedulePicker] = useState<{
    row: number;
    field: ScheduleField;
    mode: SchedulePickerMode;
    duration: number;
    afterIndex: number;
  } | null>(null);

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

  const deleteItem = useCallback((idx: number) => {
    setIr((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
    setSelection((prev) => {
      if (prev === null) return null;
      if (prev.index === idx) return null;
      return prev.index > idx ? { ...prev, index: prev.index - 1 } : prev;
    });
  }, []);

  const reorderItem = useCallback((from: number, to: number) => {
    setIr((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.items.length || to >= prev.items.length) return prev;
      const items = prev.items.slice();
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
      return { ...prev, items };
    });
    setSelection({ type: "task", index: to });
  }, []);

  const targetRowFromPoint = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    const row = el?.closest<HTMLElement>("[data-gantt-row]");
    const index = row ? Number(row.dataset.ganttRow) : NaN;
    return Number.isFinite(index) ? index : null;
  };

  const startTableRowDrag = (idx: number) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    trySetPointerCapture(event.currentTarget, event.pointerId);
    tableDragRef.current = { pointerId: event.pointerId, currentIndex: idx };
    setTableDraggingIndex(idx);
    setSelection({ type: "task", index: idx });
  };

  const moveTableRowDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = tableDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = targetRowFromPoint(event.clientX, event.clientY);
    if (target === null || target === drag.currentIndex) return;
    reorderItem(drag.currentIndex, target);
    drag.currentIndex = target;
    setTableDraggingIndex(target);
  };

  const endTableRowDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!tableDragRef.current || tableDragRef.current.pointerId !== event.pointerId) return;
    tableDragRef.current = null;
    setTableDraggingIndex(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // pointer capture may already be released
    }
  };

  const addSection = () =>
    setIr((prev) => ({
      ...prev,
      items: [...prev.items, { type: "section", title: "New Section" }],
    }));

  const addTask = useCallback((start?: string) => {
    setIr((prev) => {
      const nextIndex = prev.items.length;
      setSelection({ type: "task", index: nextIndex });
      return {
        ...prev,
        items: [
          ...prev.items,
          { type: "task", label: "New task", modifiers: [], start, end: "3d" },
        ],
      };
    });
  }, []);

  /** Ensure a task has an id; auto-assign t1/t2/… (goal 5). Returns the id. */
  const ensureTaskId = useCallback((items: GanttItem[], idx: number): { items: GanttItem[]; id: string } => {
    const item = items[idx];
    if (item?.type !== "task") return { items, id: "" };
    if (item.id) return { items, id: item.id };
    const used = new Set(
      items.filter((i): i is GanttTask => i.type === "task" && !!i.id).map((i) => i.id as string),
    );
    let n = 1;
    while (used.has(`t${n}`)) n++;
    const id = `t${n}`;
    const next = items.map((it, i) => (i === idx ? { ...it, id } : it));
    return { items: next, id };
  }, []);

  // Drag-link source bar onto target bar → set target.start = `after <srcId>`.
  const linkAfter = useCallback(
    (sourceIndex: number, targetIndex: number) => {
      setIr((prev) => {
        const { items: withSrcId, id } = ensureTaskId(prev.items, sourceIndex);
        if (!id) return prev;
        const items = withSrcId.map((it, i) =>
          i === targetIndex && it.type === "task"
            ? { ...it, start: `after ${id}` }
            : it,
        );
        return { ...prev, items };
      });
      setSelection({ type: "task", index: targetIndex });
    },
    [ensureTaskId],
  );

  const clearDependency = useCallback((targetIndex: number) => {
    setIr((prev) => ({
      ...prev,
      items: prev.items.map((it, i) =>
        i === targetIndex && it.type === "task" && parseAfterReference(it.start)
          ? { ...it, start: undefined }
          : it,
      ),
    }));
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
    setSelection(null);
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

  // axisFormat decomposition for the settings UI (goals 1 & 2).
  const axisFormat = ir.axisFormat ?? "%m/%d";
  const { base: axisBase, weekday: axisWeekday } = splitWeekday(axisFormat);
  const axisPreset = (AXIS_PRESET_VALUES as readonly string[]).includes(axisBase)
    ? axisBase
    : "custom";

  const setAxisFormat = useCallback((value: string) => {
    setIr((prev) => ({ ...prev, axisFormat: value.trim() ? value : undefined }));
  }, []);

  const taskIdOptions = useMemo(
    () =>
      ir.items
        .filter((item): item is GanttTask => item.type === "task" && !!item.id)
        .map((item) => item.id as string),
    [ir.items],
  );

  const openSchedulePicker = useCallback((row: number, field: ScheduleField) => {
    const item = ir.items[row];
    if (item?.type !== "task") return;
    const value = item[field];
    const mode: SchedulePickerMode =
      field === "start" ? "after" : "duration";
    const afterId = parseAfterReference(value);
    setSchedulePicker({
      row,
      field,
      mode,
      duration: parseDurationToken(value)?.amount ?? 1,
      afterIndex: Math.max(0, taskIdOptions.findIndex((id) => id === afterId)),
    });
  }, [ir.items, taskIdOptions]);

  useEffect(() => {
    if (!schedulePicker) return;
    const closePickerOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setSchedulePicker(null);
    };
    window.addEventListener("keydown", closePickerOnEscape, true);
    return () => window.removeEventListener("keydown", closePickerOnEscape, true);
  }, [schedulePicker]);

  // ---- table cell focus / navigation -----------------------------------

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

  const onCellKeyDown = (row: number, colIndex: number, item: GanttItem) => (event: KeyboardEvent<CellElement>) => {
    const move = (nextRow: number, nextCol: number) => {
      event.preventDefault();
      focusCell(nextRow, nextCol);
    };
    const column = COLUMNS[colIndex];

    if (
      schedulePicker &&
      schedulePicker.row === row &&
      (column === "start" || column === "end") &&
      schedulePicker.field === column &&
      (event.key === "Enter" || event.key === "Escape")
    ) {
      event.preventDefault();
      event.stopPropagation();
      setSchedulePicker(null);
      return;
    }

    // Plain, live-bound cell (no draft/picker to close) — blur so a second
    // Escape reaches EditorModal's close() instead of doing nothing (its
    // close() override defers to whichever field is currently focused).
    if (event.key === "Escape") {
      event.currentTarget.blur();
      return;
    }

    // F2 toggles navigation vs cell-edit mode (goal 7).
    if (event.key === "F2") {
      event.preventDefault();
      setEditMode((m) => !m);
      return;
    }

    // Alt+↑/↓ opens/selects lightweight choices. `after` cycles dependencies here;
    // duration intentionally stays edit-mode only.
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && item.type === "task") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      if (column === "modifiers") {
        const cur = primaryStatus(item.modifiers);
        const i = PRIMARY_STATUSES.indexOf(cur);
        const nextPrimary = PRIMARY_STATUSES[(i + delta + PRIMARY_STATUSES.length) % PRIMARY_STATUSES.length];
        patchTask(row, { modifiers: composeModifiers(nextPrimary, item.modifiers.includes("crit")) });
      } else if (column === "start" && scheduleValueType("start", item.start) === "after") {
        cycleAfterReference(row, delta);
      } else {
        (event.currentTarget as HTMLInputElement | HTMLSelectElement).click();
      }
      return;
    }

    if (
      editMode &&
      item.type === "task" &&
      (column === "start" || column === "end") &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      const valueType = scheduleValueType(column, item[column]);
      const delta = event.key === "ArrowUp" ? 1 : -1;
      if (valueType === "date" && event.currentTarget instanceof HTMLInputElement) {
        event.preventDefault();
        const base = parseDateUtc(item[column], dateFormat) ?? Date.now();
        const caretPos = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
        const field = fieldAtCaret(dateFormat, caretPos);
        patchTask(row, {
          [column]: formatDateUtc(addDateField(base, field, delta), dateFormat),
        } as Partial<GanttTask>);
        return;
      }
      if (column === "end" && valueType === "duration") {
        event.preventDefault();
        const token = parseDurationToken(item.end);
        const unit: GanttDurationUnit = token?.unit ?? "d";
        const next = Math.max(1, (token?.amount ?? 1) + delta);
        patchTask(row, { end: `${next}${unit}` });
        return;
      }
    }

    // In edit mode, let ←/→ move the caret inside the input (do not navigate).
    if (editMode && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return;

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

  // Delete/Backspace on a selected bar or dependency (goals 5 & 6). Bound at the
  // shell root level; skipped while focus is in a text input/select.
  const onPreviewKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target.isContentEditable) return;
      if (!selection) return;
      event.preventDefault();
      if (selection.type === "task") deleteItem(selection.index);
      else clearDependency(selection.index);
    },
    [selection, deleteItem, clearDependency],
  );

  const renderTextCell = (item: GanttItem, idx: number) => {
    if (item.type === "section") {
      return (
        <input
          ref={registerCell(idx, "label")}
          className="mge-gantt-cell-input"
          value={item.title}
          onFocus={() => setSelection({ type: "task", index: idx })}
          onKeyDown={onCellKeyDown(idx, 1, item)}
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
          onFocus={() => setSelection({ type: "task", index: idx })}
          onKeyDown={onCellKeyDown(idx, 1, item)}
          onChange={(event) => patchItem(idx, { line: event.target.value })}
        />
      );
    }
    return (
      <input
        ref={registerCell(idx, "label")}
        className="mge-gantt-cell-input"
        value={item.label}
        onFocus={() => setSelection({ type: "task", index: idx })}
        onKeyDown={onCellKeyDown(idx, 1, item)}
        onChange={(event) => patchTask(idx, { label: event.target.value })}
      />
    );
  };

  const adjustPickerValue = (delta: number) => {
    if (!schedulePicker) return;
    const item = ir.items[schedulePicker.row];
    if (item?.type !== "task") return;
    const current = item[schedulePicker.field];
    if (schedulePicker.mode === "duration") {
      const token = parseDurationToken(current);
      const unit: GanttDurationUnit = token?.unit ?? "d";
      const next = Math.max(1, (token?.amount ?? schedulePicker.duration) + delta);
      setSchedulePicker((prev) => (prev ? { ...prev, duration: next } : prev));
      patchTask(schedulePicker.row, { end: `${next}${unit}` });
      return;
    }
    if (schedulePicker.mode === "after") {
      const options = taskIdOptions.filter((id) => id !== item.id);
      if (options.length === 0) return;
      const nextIndex = (schedulePicker.afterIndex + delta + options.length) % options.length;
      setSchedulePicker((prev) => (prev ? { ...prev, afterIndex: nextIndex } : prev));
      patchTask(schedulePicker.row, { start: `after ${options[nextIndex]}` });
    }
  };

  const cycleAfterReference = (row: number, delta: number) => {
    const item = ir.items[row];
    if (item?.type !== "task") return;
    const options = taskIdOptions.filter((id) => id !== item.id);
    if (options.length === 0) return;
    const currentId = parseAfterReference(item.start);
    const currentIndex = Math.max(0, options.findIndex((id) => id === currentId));
    const nextIndex = (currentIndex + delta + options.length) % options.length;
    setSchedulePicker({
      row,
      field: "start",
      mode: "after",
      duration: parseDurationToken(item.end)?.amount ?? 1,
      afterIndex: nextIndex,
    });
    patchTask(row, { start: `after ${options[nextIndex]}` });
  };

  const renderSchedulePicker = (task: GanttTask, idx: number, field: ScheduleField) => {
    if (!schedulePicker || schedulePicker.row !== idx || schedulePicker.field !== field) return null;
    const value = task[field] ?? "";
    const afterOptions = taskIdOptions.filter((id) => id !== task.id);
    return (
      <div
        className="mge-gantt-schedule-popover"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" || event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            setSchedulePicker(null);
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            if ((field === "start" && event.altKey) || (field === "end" && editMode)) {
              adjustPickerValue(event.key === "ArrowUp" ? 1 : -1);
            }
          }
        }}
      >
        {field === "start" ? (
          <div className="mge-gantt-after-list">
            {afterOptions.length === 0 ? (
              <span className="mge-gantt-picker-empty">{t.gantt.pickerEmpty}</span>
            ) : (
              afterOptions.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={parseAfterReference(value) === id ? "active" : ""}
                  onClick={() => patchTask(idx, { start: `after ${id}` })}
                >
                  after {id}
                </button>
              ))
            )}
          </div>
        ) : (
          (() => {
            const token = parseDurationToken(value);
            const unit: GanttDurationUnit = token?.unit ?? "d";
            return (
              <label className="mge-gantt-duration-stepper">
                <input
                  className="mge-gantt-picker-field"
                  type="number"
                  min={1}
                  step={1}
                  value={token?.amount ?? schedulePicker.duration}
                  autoFocus
                  onKeyDown={(event) => {
                    if (editMode || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onChange={(event) => {
                    const next = Math.max(1, Math.round(Number(event.target.value)) || 1);
                    setSchedulePicker((prev) => (prev ? { ...prev, duration: next } : prev));
                    patchTask(idx, { end: `${next}${unit}` });
                  }}
                />
                <span>{unit}</span>
              </label>
            );
          })()
        )}
        <div className="mge-gantt-picker-hint">
          {field === "start" ? "Alt+↑↓: select / Enter: close" : "Edit mode + ↑↓: adjust / Enter: close"}
        </div>
      </div>
    );
  };

  const renderScheduleCell = (
    task: GanttTask | null,
    idx: number,
    field: "start" | "end",
    colIndex: number,
    item: GanttItem,
  ) => {
    const value = task?.[field] ?? "";
    if (!task) {
      return (
        <input
          className="mge-gantt-cell-input"
          value=""
          readOnly
          aria-disabled
          tabIndex={-1}
          placeholder={field === "start" ? `${dateFormat} / after id` : `${dateFormat} / 7d`}
        />
      );
    }

    const patch = (next: string) => patchTask(idx, { [field]: next || undefined } as Partial<GanttTask>);
    const valueType = scheduleValueType(field, value);
    const options = taskIdOptions.filter((id) => id !== task.id);
    const setType = (nextType: ScheduleValueType) => {
      setSchedulePicker(null);
      if (nextType === "after") {
        patchTask(idx, { start: options[0] ? `after ${options[0]}` : undefined });
      } else if (nextType === "duration") {
        patchTask(idx, { end: `${parseDurationDays(task.end) ?? 1}d` });
      } else {
        patchTask(idx, { [field]: isDateToken(value, dateFormat) ? value : todayDate(dateFormat) } as Partial<GanttTask>);
      }
    };
    // The native picker input's own value format is fixed by its HTML type
    // (always YYYY-MM-DD for type="date", HH:mm for type="time", ...) and is
    // independent of the chart's dateFormat — convert through it explicitly.
    const { type: nativeType, nativeFormat } = nativeDateInput(dateFormat);
    const nativeValue = (() => {
      const time = parseDateUtc(value, dateFormat);
      return time !== null ? formatDateWithFormat(time, nativeFormat) : "";
    })();

    return (
      <div className="mge-gantt-schedule-cell">
        <input
          ref={registerCell(idx, field)}
          className="mge-gantt-cell-input mge-gantt-schedule-input"
          type="text"
          value={value}
          onFocus={() => setSelection({ type: "task", index: idx })}
          onKeyDown={onCellKeyDown(idx, colIndex, item)}
          onChange={(event) => patch(event.target.value)}
          placeholder={field === "start" ? `${dateFormat} / after id` : `${dateFormat} / 7d`}
        />
        <select
          className="mge-gantt-schedule-type"
          aria-label={`${field} type`}
          value={valueType}
          onChange={(event) => setType(event.target.value as ScheduleValueType)}
          onKeyDown={blurOnEscape}
        >
          <option value="date">date</option>
          {field === "start" ? <option value="after">after</option> : <option value="duration">dur</option>}
        </select>
        {valueType === "date" ? (
          <input
            className="mge-gantt-date-trigger"
            type={nativeType}
            aria-label={`${field} date picker`}
            value={nativeValue}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.blur();
            }}
            onChange={(event) => {
              const time = parseDateWithFormat(event.target.value, nativeFormat);
              if (time !== null) patch(formatDateUtc(time, dateFormat));
            }}
          />
        ) : (
          <button
            className="mge-gantt-schedule-open"
            type="button"
            aria-label={t.gantt.openPickerFor(field)}
            onClick={() => openSchedulePicker(idx, field)}
          >
            ▾
          </button>
        )}
        {valueType !== "date" ? renderSchedulePicker(task, idx, field) : null}
      </div>
    );
  };

  return (
    <EditorShell
      diagramKind="gantt"
      currentSource={currentSource}
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      renderMermaid={renderMermaid}
      onSourceEdit={handleSourceEdit}
      layout="stacked"
      sourceToggleLabel={t.common.showSource}
      previewOverride={
        <div className="mge-gantt-preview-wrap" tabIndex={0} onKeyDown={onPreviewKeyDown}>
          <GanttInteractivePreview
            ir={ir}
            axisPreset={axisPreset}
            axisWeekday={axisWeekday}
            selection={selection}
            onSelect={setSelection}
            onPatchTask={patchTask}
            onAddTask={addTask}
            onLinkAfter={linkAfter}
            onAxisPresetChange={(value) => {
              if (value === "custom") return;
              setAxisFormat(composeAxisFormat(value, axisWeekday));
            }}
            onAxisWeekdayChange={(value) => setAxisFormat(composeAxisFormat(axisBase, value))}
            onAxisFormatChange={setAxisFormat}
            onReorderItem={reorderItem}
          />
        </div>
      }
    >
      <div className={`mge-gantt-editor ${editMode ? "mge-gantt-edit-mode" : ""}`}>
        <section className="mge-gantt-settings">
          <label>
            <span>title</span>
            <input
              className="mge-gantt-field"
              value={ir.title ?? ""}
              onChange={(event) => setIr({ ...ir, title: event.target.value || undefined })}
              onKeyDown={blurOnEscape}
              placeholder="(no title)"
            />
          </label>
          <label>
            <span>dateFormat</span>
            <input
              className="mge-gantt-field"
              value={ir.dateFormat ?? ""}
              onChange={(event) => setIr({ ...ir, dateFormat: event.target.value || undefined })}
              onKeyDown={blurOnEscape}
              placeholder="YYYY-MM-DD"
            />
          </label>
          <div className="mge-gantt-table-actions">
            <button
              className={`mge-gantt-action ${editMode ? "active" : ""}`}
              onClick={() => setEditMode((m) => !m)}
              title={t.gantt.toggleModeTitle}
            >
              {editMode ? t.gantt.editMode : t.gantt.moveMode}
            </button>
            <button className="mge-gantt-action" onClick={addSection}>+ section</button>
            <button className="mge-gantt-action" onClick={() => addTask()}>+ task</button>
          </div>
        </section>

        <section className="mge-gantt-grid-shell" aria-label="Gantt task table">
          <div className="mge-gantt-grid-header">
            <span />
            <span>type</span>
            <span>label / section / raw</span>
            <span>id</span>
            <span>status</span>
            <span>start</span>
            <span>end</span>
            <span />
          </div>
          {ir.items.length === 0 ? (
            <div className="mge-gantt-grid-empty">{t.gantt.gridEmpty}</div>
          ) : null}
          {ir.items.map((item, idx) => {
            const task = item.type === "task" ? item : null;
            const rowClass = [
              "mge-gantt-grid-row",
              item.type === "section" ? "section" : "",
              item.type === "raw" ? "raw" : "",
            ].filter(Boolean).join(" ");

            return (
              <div
                key={idx}
                className={`${rowClass} ${tableDraggingIndex === idx ? "dragging" : ""}`}
                data-gantt-row={idx}
              >
                <button
                  className="mge-gantt-table-row-handle"
                  type="button"
                  aria-label={t.gantt.reorderRow}
                  onPointerDown={startTableRowDrag(idx)}
                  onPointerMove={moveTableRowDrag}
                  onPointerUp={endTableRowDrag}
                  onPointerCancel={endTableRowDrag}
                >
                  <span className="mge-gantt-table-grip" aria-hidden="true" />
                </button>
                <select
                  ref={registerCell(idx, "kind")}
                  className="mge-gantt-cell-select"
                  value={item.type}
                  onFocus={() => setSelection({ type: "task", index: idx })}
                  onKeyDown={onCellKeyDown(idx, 0, item)}
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
                  onFocus={() => setSelection({ type: "task", index: idx })}
                  onKeyDown={onCellKeyDown(idx, 2, item)}
                  onChange={(event) => patchTask(idx, { id: event.target.value || undefined })}
                  placeholder="id"
                />
                {/* STATUS dropdown (goal 9): single primary + crit checkbox. */}
                {task ? (
                  <div className="mge-gantt-status-cell">
                    <select
                      ref={registerCell(idx, "modifiers")}
                      className="mge-gantt-cell-select"
                      value={primaryStatus(task.modifiers)}
                      onFocus={() => setSelection({ type: "task", index: idx })}
                      onKeyDown={onCellKeyDown(idx, 3, item)}
                      onChange={(event) =>
                        patchTask(idx, {
                          modifiers: composeModifiers(
                            event.target.value as PrimaryStatus,
                            task.modifiers.includes("crit"),
                          ),
                        })
                      }
                    >
                      <option value="">—</option>
                      <option value="done">done</option>
                      <option value="active">active</option>
                      <option value="milestone">milestone</option>
                    </select>
                    <label className="mge-gantt-crit-toggle" title={t.gantt.critToggleTitle}>
                      <input
                        type="checkbox"
                        checked={task.modifiers.includes("crit")}
                        onChange={(event) =>
                          patchTask(idx, {
                            modifiers: composeModifiers(primaryStatus(task.modifiers), event.target.checked),
                          })
                        }
                        onKeyDown={blurOnEscape}
                      />
                      crit
                    </label>
                  </div>
                ) : (
                  <input
                    className="mge-gantt-cell-input"
                    value=""
                    readOnly
                    aria-disabled
                    tabIndex={-1}
                  />
                )}
                {renderScheduleCell(task, idx, "start", 4, item)}
                {renderScheduleCell(task, idx, "end", 5, item)}
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
