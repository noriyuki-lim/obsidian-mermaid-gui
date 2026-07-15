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
import { defaultAxisFormat, formatGanttAxisTick } from "../../core/gantt/axis-format";
import {
  formatDurationToken,
  oneUnitMs,
  parseDurationDays,
  parseDurationToken,
  type GanttDurationUnit,
} from "../../core/gantt/duration";
import {
  buildAbsoluteTicks,
  buildTicks,
  paddedRange,
  parseTickInterval,
  pickTickIntervalMs,
} from "../../core/gantt/tick-scale";
import {
  DEFAULT_DATE_FORMAT,
  addDateField,
  dateFormatCapability,
  fieldAtCaret,
  formatDateWithFormat,
  isDateStringForFormat,
  nativeDateInput,
  parseDateWithFormat,
  reformatDateValue,
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

// Navigable table slots, in visual left-to-right order. Sub-controls (the crit
// checkbox, the start/end "type" selects) are first-class slots so Tab AND the
// arrow keys stop on every one of them, and empty rows register placeholders
// for the same slots so navigation never dead-ends (goal: uniform grid).
type GanttCellColumn =
  | "kind"
  | "label"
  | "id"
  | "status"
  | "crit"
  | "start"
  | "startType"
  | "end"
  | "endType";
type CellElement = HTMLInputElement | HTMLSelectElement;
type ScheduleField = "start" | "end";
type SchedulePickerMode = "duration" | "after";
type ScheduleValueType = "date" | "duration" | "after";

type PrimaryStatus = GanttTaskStatus | "";
/** Statuses selectable as the single "primary" status in the table dropdown. */
const PRIMARY_STATUSES: PrimaryStatus[] = ["", "done", "active", "milestone"];
const COLUMNS: GanttCellColumn[] = [
  "kind",
  "label",
  "id",
  "status",
  "crit",
  "start",
  "startType",
  "end",
  "endType",
];
/** Column index within COLUMNS (source of truth for both Tab and arrow nav). */
const COL = (c: GanttCellColumn) => COLUMNS.indexOf(c);
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

/**
 * Default duration for a newly-created task's `end`. A time-only chart
 * (`dateFormat HH:mm`) has no notion of days, so `3d` would be nonsense —
 * seed `1h` there instead (goal: sensible sub-day default).
 */
const defaultTaskEnd = (dateFormat: string): string =>
  dateFormatCapability(dateFormat) === "time" ? "1h" : "3d";

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

// Every axisFormat base the preset dropdown offers, in display order.
// `axisPreset` treats a base outside this set as "custom", and dateFormat
// auto-follow only rewrites an axisFormat whose base is in here (a hand-typed
// custom pattern is left be). The dropdown is NOT gated by dateFormat: the axis
// label is purely cosmetic, so any granularity is selectable regardless of the
// chart's own dateFormat. Labels omit the raw token (Date / Week / Time …) —
// the exact pattern is already visible in the adjacent custom-format input.
const AXIS_PRESET_VALUES = ["%m/%d", "%Y/%m/%d", "%W", "%H:%M", "%m/%d %H:%M"] as const;

const DEFAULT_AXIS_FORMAT = "%m/%d";

/** dateFormat presets — friendlier than typing dayjs tokens by hand. */
const DATE_FORMAT_PRESETS = [
  { key: "date", format: "YYYY-MM-DD" },
  { key: "datetime", format: "YYYY-MM-DD HH:mm" },
  { key: "time", format: "HH:mm" },
] as const;

type DateFormatPresetKey = (typeof DATE_FORMAT_PRESETS)[number]["key"] | "custom";

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

/** How many section colors cycle before repeating (mirrors Mermaid's palette). */
const SECTION_PALETTE_SIZE = 5;

interface TaskLayout {
  index: number;
  task: GanttTask;
  row: number;
  start: number;
  end: number;
  /** 0-based section ordinal for color cycling; -1 = before any section. */
  sectionIndex: number;
}

interface SectionSpan {
  title: string;
  fromRow: number;
  toRow: number;
  index: number;
}

interface GanttTimeline {
  tasks: TaskLayout[];
  sectionSpans: SectionSpan[];
  min: number;
  max: number;
  ticks: number[];
}

const buildTimeline = (ir: GanttIR): GanttTimeline => {
  const dateFormat = ir.dateFormat ?? DEFAULT_DATE_FORMAT;
  const fallbackStart = firstExplicitDate(ir.items, dateFormat);
  const endById = new Map<string, number>();
  const tasks: TaskLayout[] = [];
  const sectionSpans: SectionSpan[] = [];
  let previousEnd = fallbackStart;
  let currentSection: SectionSpan | null = null;
  let sectionIndex = -1;

  ir.items.forEach((item, index) => {
    if (item.type === "section") {
      if (currentSection) sectionSpans.push(currentSection);
      sectionIndex += 1;
      currentSection = { title: item.title, fromRow: tasks.length, toRow: tasks.length - 1, index: sectionIndex };
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
    tasks.push({ index, task: item, row, start, end, sectionIndex });
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

/**
 * Bar color class. Status modifiers (crit/done/active/milestone) win — same as
 * Mermaid, whose activeTask/doneTask/crit styles override the section color.
 * A plain task takes its section's cycling palette color so the preview reads
 * as section-coded like the render; tasks before any section fall back to the
 * default bar color.
 */
const taskColorClass = (task: GanttTask, sectionIndex: number) => {
  if (task.modifiers.includes("crit")) return "crit";
  if (task.modifiers.includes("done")) return "done";
  if (task.modifiers.includes("active")) return "active";
  if (task.modifiers.includes("milestone")) return "milestone";
  if (sectionIndex < 0) return "default";
  return `section-${sectionIndex % SECTION_PALETTE_SIZE}`;
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
  onTickIntervalChange: (value: string) => void;
  onReorderItem: (from: number, to: number) => void;
  onDeleteTask: (index: number) => void;
  onDeleteDependency: (index: number) => void;
}

// Gridline interval options offered in the preview toolbar. Values are Mermaid
// `tickInterval` tokens; "" = auto. Kept short to cover the common scales.
const TICK_INTERVAL_VALUES = ["", "15minute", "1hour", "1day", "1week", "1month"] as const;

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
  onTickIntervalChange,
  onReorderItem,
  onDeleteTask,
  onDeleteDependency,
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
    // Frozen at pointerdown (mode "move" only) — every pointermove reflects
    // the TOTAL delta since pointerdown, so the baseline it's added to must
    // stay fixed for the whole gesture. Reading the predecessor/dependents'
    // positions fresh from `baseTimeline` on each pointermove instead would
    // add that same total delta on top of an already-shifted value every
    // time, compounding into a runaway drift after just a few events.
    moveSnapshot?: {
      predecessor?: { index: number; start: number; end: number; unit: GanttDurationUnit | null };
      dependents: { index: number; originalEnd: number }[];
    };
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
  // Right-click delete menu on a bar or a dependency line. Positioned at the
  // pointer; `kind` picks the label/action.
  const [barMenu, setBarMenu] = useState<{
    x: number;
    y: number;
    kind: "task" | "dep";
    index: number;
  } | null>(null);
  // Background pan (goal: navigate by dragging empty space). Also distinguishes
  // a plain click (deselect) from a drag (pan) via `moved`.
  const bgPanRef = useRef<{
    pointerId: number;
    startClientX: number;
    startMin: number;
    startMax: number;
    moved: boolean;
  } | null>(null);
  const [panning, setPanning] = useState(false);

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
  const axisPresetLabel = (value: string): string => {
    switch (value) {
      case "%m/%d":
        return t.gantt.axisPresetDate;
      case "%Y/%m/%d":
        return t.gantt.axisPresetYearDate;
      case "%W":
        return t.gantt.axisPresetWeek;
      case "%H:%M":
        return t.gantt.axisPresetTime;
      case "%m/%d %H:%M":
        return t.gantt.axisPresetDateTime;
      default:
        return value;
    }
  };
  const tickIntervalValue = ir.tickInterval ?? "";
  const tickLabelFor = (value: string): string => {
    switch (value) {
      case "":
        return t.gantt.tickAuto;
      case "15minute":
        return t.gantt.tick15min;
      case "1hour":
        return t.gantt.tickHour;
      case "1day":
        return t.gantt.tickDay;
      case "1week":
        return t.gantt.tickWeek;
      case "1month":
        return t.gantt.tickMonth;
      default:
        return value;
    }
  };
  // Keep an out-of-preset explicit tickInterval (e.g. hand-written `6hour`)
  // visible so the controlled <select> never points at a missing option.
  const tickOptionValues = (TICK_INTERVAL_VALUES as readonly string[]).includes(tickIntervalValue)
    ? [...TICK_INTERVAL_VALUES]
    : [...TICK_INTERVAL_VALUES, tickIntervalValue];
  const baseTimeline = useMemo(() => buildTimeline(ir), [ir]);
  const min = viewport?.min ?? baseTimeline.min;
  const max = viewport?.max ?? baseTimeline.max;
  const chartRight = Math.max(CHART_LEFT + 240, viewBoxWidth - CHART_RIGHT_PAD);
  const chartWidth = chartRight - CHART_LEFT;
  const height = Math.max(220, CHART_TOP + Math.max(baseTimeline.tasks.length, 1) * ROW_HEIGHT + 52);

  // Absolute-time center of the selected bar (if a task is selected) — the
  // zoom anchor. Independent of the viewport so it stays stable across zooms.
  const selectedTaskCenter = useMemo(() => {
    if (selection?.type !== "task") return null;
    const layout = baseTimeline.tasks.find((task) => task.index === selection.index);
    return layout ? (layout.start + layout.end) / 2 : null;
  }, [selection, baseTimeline.tasks]);

  // Gridline interval for the (possibly zoomed) viewport. An explicit Mermaid
  // `tickInterval` is honored verbatim so the preview grid matches the render
  // (guarded against absurd tick counts on huge spans). Otherwise auto-pick a
  // width-aware density — denser than the old fixed 8 ticks, which read
  // coarser than Mermaid's own rendered gridlines.
  const tickIntervalMs = useMemo(() => {
    const explicit = parseTickInterval(ir.tickInterval);
    if (explicit && (max - min) / explicit <= 600) return explicit;
    const target = Math.max(6, Math.round(chartWidth / 78));
    return pickTickIntervalMs(max - min, target);
  }, [ir.tickInterval, chartWidth, min, max]);
  // Absolute-position ticks: gridlines phase-locked to real time so a given
  // tick stays at the same instant while zooming/panning (per request).
  const ticks = useMemo(() => buildAbsoluteTicks(min, max, tickIntervalMs), [min, max, tickIntervalMs]);

  // Wheel-scroll zoom (session-only, sharing the same `viewport` state as the
  // edge handles): scrolling over the plotting area zooms about the cursor —
  // up/away zooms in, down/toward zooms out. Attached as a native non-passive
  // listener so preventDefault() can stop the page from scrolling; React's
  // synthetic onWheel is passive and cannot. Latest layout values are read
  // from a ref so the once-attached listener never goes stale.
  const wheelRef = useRef({ min, max, chartWidth, viewBoxWidth, height, selectedCenter: selectedTaskCenter });
  wheelRef.current = { min, max, chartWidth, viewBoxWidth, height, selectedCenter: selectedTaskCenter };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      const cur = wheelRef.current;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return;
      const scale = cur.viewBoxWidth / rect.width;
      const vbX = (event.clientX - rect.left) * scale;
      const vbY = (event.clientY - rect.top) * scale;
      // Only while the cursor is within the bar plotting area.
      if (vbX < CHART_LEFT || vbX > CHART_LEFT + cur.chartWidth) return;
      if (vbY < CHART_TOP - 16 || vbY > cur.height - 28) return;
      const span = cur.max - cur.min;
      if (span <= 0) return;
      const chartPx = (cur.chartWidth / cur.viewBoxWidth) * rect.width;
      if (chartPx <= 0) return;

      // Horizontal intent (trackpad deltaX, or Shift+wheel) pans; plain
      // vertical wheel zooms. Both stay session-only via `viewport`.
      const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (horizontal) {
        // Take whichever axis carries the delta — some browsers route
        // Shift+wheel into deltaX, others leave it in deltaY.
        const raw = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        if (raw === 0) return;
        event.preventDefault();
        const deltaPx = event.deltaMode === 1 ? raw * 16 : raw;
        const timeDelta = (deltaPx / chartPx) * span;
        setViewport({ min: cur.min + timeDelta, max: cur.max + timeDelta });
        return;
      }

      if (event.deltaY === 0) return;
      event.preventDefault();
      // Anchor: the selected bar's center if a bar is selected, otherwise the
      // current view center — never the cursor position (per request).
      const anchor = cur.selectedCenter ?? (cur.min + cur.max) / 2;
      // Gentle, device-normalized zoom: express the wheel delta in ~pixels
      // (line-mode ≈ 16px/line), cap one event's contribution, and map it to a
      // small exponential step, so a notch nudges rather than lurches.
      const deltaPx = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const intensity = Math.max(-1, Math.min(1, deltaPx / 180));
      const factor = Math.exp(intensity * 0.16);
      const minWidth = pickTickIntervalMs(Math.max(span, 1)) * 2;
      const nextSpan = Math.max(span * factor, minWidth);
      const nextMin = anchor - (anchor - cur.min) * (nextSpan / span);
      setViewport({ min: nextMin, max: nextMin + nextSpan });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // Dismiss the right-click bar menu on any outside pointerdown or Escape.
  useEffect(() => {
    if (!barMenu) return;
    const onDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest(".mge-gantt-bar-menu")) return;
      setBarMenu(null);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setBarMenu(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [barMenu]);

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

  // Move keyboard focus to the focusable preview wrapper so the Delete/Backspace
  // handler bound there fires after a bar/dependency is selected on the canvas
  // (SVG shapes aren't focusable, so a click otherwise leaves focus elsewhere).
  const focusPreviewWrap = () => {
    (svgRef.current?.closest(".mge-gantt-preview-wrap") as HTMLElement | null)?.focus();
  };
  const selectOnCanvas = (sel: Selection) => {
    onSelect(sel);
    if (sel) focusPreviewWrap();
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

  /**
   * Transitive `after`-dependents of `rootId`, snapshotted once (not
   * re-walked live) — only entries whose `end` is an explicit date are
   * collected, since a duration-token end auto-follows via the `after`
   * chain and never needs patching. Traversal continues past duration-token
   * nodes regardless, since their own dependents still need collecting.
   */
  const collectDependentEnds = (rootId: string): { index: number; originalEnd: number }[] => {
    const out: { index: number; originalEnd: number }[] = [];
    const visited = new Set<string>([rootId]);
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      baseTimeline.tasks
        .filter((task) => parseAfterReference(task.task.start) === id)
        .forEach((dependent) => {
          if (!parseDurationToken(dependent.task.end) && dependent.task.end !== undefined) {
            out.push({ index: dependent.index, originalEnd: dependent.end });
          }
          const depId = dependent.task.id;
          if (depId && !visited.has(depId)) {
            visited.add(depId);
            queue.push(depId);
          }
        });
    }
    return out;
  };

  const startDrag = (
    layout: TaskLayout,
    mode: "move" | "resize-start" | "resize-end",
  ) => (event: ReactPointerEvent<SVGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    trySetPointerCapture(event.currentTarget as Element, event.pointerId);
    selectOnCanvas({ type: "task", index: layout.index });

    let moveSnapshot: NonNullable<typeof dragRef.current>["moveSnapshot"];
    if (mode === "move") {
      const predecessorId = parseAfterReference(layout.task.start);
      const predecessorLayout = predecessorId
        ? baseTimeline.tasks.find((task) => task.task.id === predecessorId)
        : undefined;
      moveSnapshot = {
        predecessor: predecessorLayout
          ? {
              index: predecessorLayout.index,
              start: predecessorLayout.start,
              end: predecessorLayout.end,
              unit: parseDurationToken(predecessorLayout.task.end)?.unit ?? null,
            }
          : undefined,
        dependents: layout.task.id ? collectDependentEnds(layout.task.id) : [],
      };
    }

    dragRef.current = {
      index: layout.index,
      pointerId: event.pointerId,
      mode,
      clientX: event.clientX,
      start: layout.start,
      end: layout.end,
      originalStart: layout.task.start,
      originalEnd: layout.task.end,
      moveSnapshot,
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

  // Background pan / deselect (goals #1, #3): drag empty space to pan; a plain
  // click that never moves deselects the current selection.
  const startBgPan = (event: ReactPointerEvent<SVGElement>) => {
    if (event.button !== 0) return;
    trySetPointerCapture(event.currentTarget as Element, event.pointerId);
    bgPanRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startMin: min,
      startMax: max,
      moved: false,
    };
  };

  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bgPan = bgPanRef.current;
    if (bgPan && bgPan.pointerId === event.pointerId) {
      bgPanRef.current = null;
      setPanning(false);
      if (!bgPan.moved) onSelect(null);
    }
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
    selectOnCanvas({ type: "task", index: layout.index });
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bgPan = bgPanRef.current;
    if (bgPan && bgPan.pointerId === event.pointerId) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return;
      const chartPx = (chartWidth / viewBoxWidth) * rect.width;
      if (chartPx <= 0) return;
      const dx = event.clientX - bgPan.startClientX;
      if (!bgPan.moved && Math.abs(dx) > 3) {
        bgPan.moved = true;
        setPanning(true);
      }
      // dx measured from pointerdown; timeDelta uses the frozen start span so
      // the pan never compounds. Grab semantics: drag right → earlier times.
      const timeDelta = (dx / chartPx) * (bgPan.startMax - bgPan.startMin);
      setViewport({ min: bgPan.startMin - timeDelta, max: bgPan.startMax - timeDelta });
      return;
    }

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
      // Preserve an `after` link on either side of this task instead of
      // clobbering it with a literal date: if this task IS a dependent,
      // redirect the shift onto its predecessor's end (same idea as
      // resize-start already uses); if other tasks depend on THIS one,
      // cascade the shift forward to them. Every baseline here (`predecessor`/
      // `dependents`) comes from `drag.moveSnapshot`, frozen once at
      // pointerdown — `deltaMs` is the TOTAL delta since pointerdown, so
      // adding it to a live (already-shifted-by-a-previous-pointermove)
      // value instead would compound into a runaway drift within a few
      // events.
      const snapshot = drag.moveSnapshot;
      const predecessor = snapshot?.predecessor;

      if (predecessor) {
        const nextPredecessorEnd = Math.max(
          predecessor.end + deltaMs,
          predecessor.start + MIN_TASK_DURATION_MS,
        );
        onPatchTask(predecessor.index, {
          end: predecessor.unit
            ? formatDurationToken((nextPredecessorEnd - predecessor.start) / DAY_MS, predecessor.unit)
            : formatDateUtc(nextPredecessorEnd, dateFormat),
        });
        // `start` (the `after <id>` reference) is left untouched. Our own
        // `end`: a duration token auto-follows via the shifted predecessor;
        // an explicit date needs the same delta applied directly.
        if (!originalEndToken && drag.originalEnd !== undefined) {
          onPatchTask(drag.index, { end: formatDateUtc(drag.end + deltaMs, dateFormat) });
        }
      } else {
        const nextStart = drag.start + deltaMs;
        const nextEnd = drag.end + deltaMs;
        onPatchTask(drag.index, {
          start: formatDateUtc(nextStart, dateFormat),
          end: originalEndToken ? drag.originalEnd : formatDateUtc(nextEnd, dateFormat),
        });
      }

      snapshot?.dependents.forEach((dependent) => {
        onPatchTask(dependent.index, { end: formatDateUtc(dependent.originalEnd + deltaMs, dateFormat) });
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
          <span className="mge-gantt-preview-tool-label">{t.gantt.axisLabel}</span>
          <select
            className="mge-gantt-preview-field"
            value={axisPreset}
            onChange={(event) => onAxisPresetChange(event.target.value)}
            aria-label={t.gantt.axisRoleHint}
          >
            {AXIS_PRESET_VALUES.map((value) => (
              <option key={value} value={value}>
                {axisPresetLabel(value)}
              </option>
            ))}
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
            aria-label={t.gantt.axisFormatRoleHint}
          />
          <span className="mge-gantt-preview-tool-label">{t.gantt.tickLabel}</span>
          <select
            className="mge-gantt-preview-field"
            value={tickIntervalValue}
            onChange={(event) => onTickIntervalChange(event.target.value)}
            aria-label={t.gantt.tickRoleHint}
          >
            {tickOptionValues.map((value) => (
              <option key={value || "auto"} value={value}>
                {tickLabelFor(value)}
              </option>
            ))}
          </select>
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
        <rect
          x={0}
          y={0}
          width={viewBoxWidth}
          height={height}
          className={`mge-gantt-bg ${panning ? "panning" : ""}`}
          onPointerDown={startBgPan}
        />
        {/* Section background bands — faint per-section tint mirroring the
            rendered chart's section coloring. Drawn under grid/bars. */}
        {baseTimeline.sectionSpans.map((span, i) => {
          if (span.toRow < span.fromRow) return null;
          return (
            <rect
              key={`band-${i}`}
              x={CHART_LEFT}
              y={yForRow(span.fromRow)}
              width={chartRight - CHART_LEFT}
              height={(span.toRow - span.fromRow + 1) * ROW_HEIGHT}
              className={`mge-gantt-section-band section-${span.index % SECTION_PALETTE_SIZE}`}
            />
          );
        })}
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
              <line
                x1={CHART_LEFT - 4}
                y1={yTop}
                x2={CHART_LEFT - 4}
                y2={yBot}
                className={`mge-gantt-section-rule section-${span.index % SECTION_PALETTE_SIZE}`}
              />
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

        {/* Dependency connectors (goal 5). A wide transparent hit line makes the
            thin connector easy to click / right-click (select + delete). */}
        {deps.map((dep, i) => {
          const isSel = selection?.type === "dep" && selection.index === dep.targetIndex;
          const selectDep = (e: ReactPointerEvent<SVGLineElement>) => {
            e.stopPropagation();
            selectOnCanvas({ type: "dep", index: dep.targetIndex });
          };
          return (
            <g key={`dep-${i}`}>
              <line
                x1={dep.fromX}
                y1={dep.fromY}
                x2={dep.toX}
                y2={dep.toY}
                className="mge-gantt-dep-hit"
                onPointerDown={selectDep}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  selectOnCanvas({ type: "dep", index: dep.targetIndex });
                  setBarMenu({ x: e.clientX, y: e.clientY, kind: "dep", index: dep.targetIndex });
                }}
              />
              <line
                x1={dep.fromX}
                y1={dep.fromY}
                x2={dep.toX}
                y2={dep.toY}
                className={`mge-gantt-dep ${isSel ? "selected" : ""}`}
              />
            </g>
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
          const colorClass = taskColorClass(layout.task, layout.sectionIndex);
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
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                selectOnCanvas({ type: "task", index: layout.index });
                setBarMenu({ x: event.clientX, y: event.clientY, kind: "task", index: layout.index });
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
      {barMenu ? (
        <div className="mge-gantt-bar-menu" style={{ left: barMenu.x, top: barMenu.y }}>
          <button
            type="button"
            className="mge-gantt-bar-menu-item"
            onClick={() => {
              if (barMenu.kind === "task") onDeleteTask(barMenu.index);
              else onDeleteDependency(barMenu.index);
              setBarMenu(null);
            }}
          >
            {barMenu.kind === "task" ? t.gantt.deleteTask : t.gantt.deleteDependency}
          </button>
        </div>
      ) : null}
      <p className="mge-gantt-preview-help">{t.gantt.previewHelp}</p>
    </div>
  );
};

export const GanttEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const t = useT();
  const [ir, setIr] = useState<GanttIR>(() => seed(initialSource));
  const dateFormat = ir.dateFormat ?? DEFAULT_DATE_FORMAT;
  const [saving, setSaving] = useState(false);
  // dateFormat control: a preset dropdown, with "custom" a sticky UI mode
  // (the stored format may still match a preset while the user edits freely).
  const [dateFormatCustom, setDateFormatCustom] = useState(false);
  const [dateFormatDraft, setDateFormatDraft] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  // Table interaction mode (goal 7): navigation vs cell-edit, Excel-like.
  const [editMode, setEditMode] = useState(false);
  const cellRefs = useRef(new Map<string, CellElement>());
  const gridShellRef = useRef<HTMLElement>(null);
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
          {
            type: "task",
            label: "New task",
            modifiers: [],
            start,
            end: defaultTaskEnd(prev.dateFormat ?? DEFAULT_DATE_FORMAT),
          },
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
          return { type: "task", label, modifiers: [], end: defaultTaskEnd(prev.dateFormat ?? DEFAULT_DATE_FORMAT) };
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

  // Resolved (rendered) start/end per row, from the same timeline the preview
  // draws. Switching a field to an explicit "date" seeds the value it CURRENTLY
  // resolves to (e.g. the date an `after` chain lands on) rather than today —
  // otherwise the bar snaps to now and the whole chart reflows (goal #4).
  const resolvedByIndex = useMemo(() => {
    const map = new Map<number, { start: number; end: number }>();
    buildTimeline(ir).tasks.forEach((task) => map.set(task.index, { start: task.start, end: task.end }));
    return map;
  }, [ir]);

  // Keep the selected task's table row visible (e.g. after selecting its bar on
  // the canvas). `block: "nearest"` no-ops when the row is already on screen, so
  // clicking a cell doesn't cause a jump.
  useEffect(() => {
    if (selection?.type !== "task") return;
    gridShellRef.current
      ?.querySelector<HTMLElement>(`[data-gantt-row="${selection.index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selection]);

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

  const setTickInterval = useCallback((value: string) => {
    setIr((prev) => ({ ...prev, tickInterval: value.trim() ? value : undefined }));
  }, []);

  // dateFormat preset detection + change handling (goals: intuitive date⇄time
  // switching, and the table following the change).
  const dateFormatPreset: DateFormatPresetKey =
    DATE_FORMAT_PRESETS.find((preset) => preset.format === dateFormat)?.key ?? "custom";
  const showCustomDateFormat = dateFormatCustom || dateFormatPreset === "custom";

  const changeDateFormat = useCallback((nextRaw: string) => {
    setIr((prev) => {
      const from = prev.dateFormat ?? DEFAULT_DATE_FORMAT;
      const to = nextRaw.trim() ? nextRaw.trim() : DEFAULT_DATE_FORMAT;
      if (to === from) return prev;
      // Re-express every explicit date value so the table follows the new
      // format; duration tokens (`3d`) and `after <id>` refs pass through.
      const items = prev.items.map((item) =>
        item.type === "task"
          ? {
              ...item,
              start: item.start ? reformatDateValue(item.start, from, to) : item.start,
              end: item.end ? reformatDateValue(item.end, from, to) : item.end,
            }
          : item,
      );
      // Auto-follow the axis to the new granularity — but only when it still
      // sits on a recognized preset; a hand-typed custom pattern is left be.
      let axisFormat = prev.axisFormat;
      const { base, weekday } = splitWeekday(axisFormat ?? DEFAULT_AXIS_FORMAT);
      if ((AXIS_PRESET_VALUES as readonly string[]).includes(base)) {
        const composed = composeAxisFormat(defaultAxisFormat(dateFormatCapability(to)), weekday);
        axisFormat = composed === DEFAULT_AXIS_FORMAT ? undefined : composed;
      }
      return { ...prev, items, dateFormat: to === DEFAULT_DATE_FORMAT ? undefined : to, axisFormat };
    });
  }, []);

  const onDateFormatPresetChange = useCallback(
    (value: string) => {
      setDateFormatDraft(null);
      if (value === "custom") {
        setDateFormatCustom(true);
        return;
      }
      setDateFormatCustom(false);
      const preset = DATE_FORMAT_PRESETS.find((entry) => entry.key === value);
      if (preset) changeDateFormat(preset.format);
    },
    [changeDateFormat],
  );

  const taskIdOptions = useMemo(
    () =>
      ir.items
        .filter((item): item is GanttTask => item.type === "task" && !!item.id)
        .map((item) => item.id as string),
    [ir.items],
  );

  // Change a schedule field's value TYPE (date ⇄ after / duration). Extracted to
  // component scope so both the type <select> and keyboard cycling share it.
  const setScheduleType = useCallback(
    (idx: number, field: ScheduleField, nextType: ScheduleValueType) => {
      const item = ir.items[idx];
      if (item?.type !== "task") return;
      const value = item[field] ?? "";
      const options = taskIdOptions.filter((id) => id !== item.id);
      setSchedulePicker(null);
      if (nextType === "after") {
        patchTask(idx, { start: options[0] ? `after ${options[0]}` : undefined });
      } else if (nextType === "duration") {
        patchTask(idx, { end: `${parseDurationDays(item.end) ?? 1}d` });
      } else if (isDateToken(value, dateFormat)) {
        patchTask(idx, { [field]: value } as Partial<GanttTask>);
      } else {
        // Seed from the currently-resolved date (e.g. what `after` points to),
        // falling back to today only if the row has no resolved time.
        const resolved = resolvedByIndex.get(idx);
        const seededTime = resolved ? resolved[field] : Date.now();
        patchTask(idx, { [field]: formatDateUtc(seededTime, dateFormat) } as Partial<GanttTask>);
      }
    },
    [ir.items, taskIdOptions, dateFormat, resolvedByIndex, patchTask],
  );

  /** Toggle a schedule field between date and its alternate type (keyboard). */
  const toggleScheduleType = (idx: number, field: ScheduleField) => {
    const item = ir.items[idx];
    if (item?.type !== "task") return;
    const vt = scheduleValueType(field, item[field]);
    const other: ScheduleValueType =
      field === "start" ? (vt === "after" ? "date" : "after") : vt === "duration" ? "date" : "duration";
    setScheduleType(idx, field, other);
  };

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
    const { row, field } = schedulePicker;
    const closePickerOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setSchedulePicker(null);
      // Land focus back on the (editable) schedule input so Obsidian's close()
      // guard keeps deferring — the modal must not close on this Escape (#4).
      focusScheduleInput(row, field);
    };
    // Click-away: any pointerdown outside the popover and its trigger dismisses
    // the picker (#4). The trigger is excluded so its own onClick can toggle.
    const closePickerOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".mge-gantt-schedule-popover") || target?.closest(".mge-gantt-schedule-open")) return;
      setSchedulePicker(null);
    };
    window.addEventListener("keydown", closePickerOnEscape, true);
    document.addEventListener("pointerdown", closePickerOnOutsideClick, true);
    return () => {
      window.removeEventListener("keydown", closePickerOnEscape, true);
      document.removeEventListener("pointerdown", closePickerOnOutsideClick, true);
    };
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
      if (el instanceof HTMLInputElement && el.type !== "checkbox") el.select();
    }, 0);
  };

  /**
   * Return focus to a schedule cell's text input. The picker keeps focus here
   * (not in the popover) so ↑/↓ cycling and Escape route through
   * `onCellKeyDown`, and — since the input is editable *within the modal* —
   * Obsidian's `close()` guard defers on Escape instead of closing the modal
   * (goal #4). `setTimeout` lets the click that opened the picker settle first.
   */
  const focusScheduleInput = (idx: number, field: ScheduleField) => {
    window.setTimeout(() => cellRefs.current.get(cellKey(idx, field))?.focus(), 0);
  };

  // ↑/↓ "adjust intent": in Edit mode a plain ↑/↓ adjusts; in Move mode it
  // navigates, and Alt+↑/↓ adjusts instead (goal #5 — one rule for every
  // schedule/status control).
  const isAdjustKey = (event: { key: string }) =>
    event.key === "ArrowUp" || event.key === "ArrowDown";
  const adjustEnabled = (event: { altKey: boolean }) => (editMode ? true : event.altKey);

  const onCellKeyDown = (row: number, colIndex: number, item: GanttItem) => (event: KeyboardEvent<CellElement>) => {
    const move = (nextRow: number, nextCol: number) => {
      event.preventDefault();
      if (schedulePicker) setSchedulePicker(null);
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

    // Unified ↑/↓ adjust (goal #5): cycles status / crit / `after` dependency /
    // date-field / duration / value-type on the relevant slot. Gated by
    // `adjustEnabled` (Edit: plain ↑/↓; Move: Alt+↑/↓). Task rows only; empty
    // placeholder cells fall through to navigation.
    if (isAdjustKey(event) && adjustEnabled(event) && item.type === "task") {
      const delta = event.key === "ArrowUp" ? 1 : -1;
      if (column === "status") {
        event.preventDefault();
        const cur = primaryStatus(item.modifiers);
        const i = PRIMARY_STATUSES.indexOf(cur);
        const nextPrimary = PRIMARY_STATUSES[(i + delta + PRIMARY_STATUSES.length) % PRIMARY_STATUSES.length];
        patchTask(row, { modifiers: composeModifiers(nextPrimary, item.modifiers.includes("crit")) });
        return;
      }
      if (column === "crit") {
        event.preventDefault();
        patchTask(row, {
          modifiers: composeModifiers(primaryStatus(item.modifiers), !item.modifiers.includes("crit")),
        });
        return;
      }
      if (column === "startType" || column === "endType") {
        event.preventDefault();
        toggleScheduleType(row, column === "startType" ? "start" : "end");
        return;
      }
      if (column === "start" || column === "end") {
        const field = column;
        const valueType = scheduleValueType(field, item[field]);
        if (field === "start" && valueType === "after") {
          event.preventDefault();
          // The `after` picker is a top-to-bottom list, so ↓ moves DOWN the list
          // (later index) — opposite sign from the numeric "↑ = increase".
          cycleAfterReference(row, -delta);
          return;
        }
        if (valueType === "date" && event.currentTarget instanceof HTMLInputElement) {
          event.preventDefault();
          const base = parseDateUtc(item[field], dateFormat) ?? Date.now();
          const caretPos = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
          const f = fieldAtCaret(dateFormat, caretPos);
          patchTask(row, {
            [field]: formatDateUtc(addDateField(base, f, delta), dateFormat),
          } as Partial<GanttTask>);
          return;
        }
        if (field === "end" && valueType === "duration") {
          event.preventDefault();
          const token = parseDurationToken(item.end);
          const unit: GanttDurationUnit = token?.unit ?? "d";
          const next = Math.max(1, (token?.amount ?? 1) + delta);
          patchTask(row, { end: `${next}${unit}` });
          return;
        }
        event.preventDefault();
        return;
      }
      // kind/label/id: nothing to adjust — fall through to row navigation.
    }

    // In edit mode ←/→ moves the caret inside an editable text input; selects,
    // the crit checkbox, and empty readonly placeholders still navigate so you
    // can pass through them (goal: ←/→ stops match Tab stops).
    if (
      editMode &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      event.currentTarget instanceof HTMLInputElement &&
      !event.currentTarget.readOnly &&
      event.currentTarget.type !== "checkbox"
    ) {
      return;
    }

    // Tab and arrows share one flat COLUMNS grid — every slot (incl. the type
    // selects and crit) is a stop, and empty rows register placeholders so
    // nothing dead-ends (goal #4).
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

  // Focusable readonly placeholder occupying a nav slot on rows that have no
  // real control there (section/raw). Registered so Tab/arrows pass through it.
  const renderEmptyCell = (idx: number, column: GanttCellColumn, item: GanttItem) => (
    <input
      ref={registerCell(idx, column)}
      className="mge-gantt-cell-input mge-gantt-cell-empty"
      value=""
      readOnly
      aria-hidden
      onFocus={() => setSelection({ type: "task", index: idx })}
      onKeyDown={onCellKeyDown(idx, COL(column), item)}
    />
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
      // Reversed vs numeric adjust: ↓ (delta -1) moves DOWN the list.
      const nextIndex = (schedulePicker.afterIndex - delta + options.length) % options.length;
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
            focusScheduleInput(idx, field);
          } else if (isAdjustKey(event)) {
            event.preventDefault();
            event.stopPropagation();
            if (adjustEnabled(event)) adjustPickerValue(event.key === "ArrowUp" ? 1 : -1);
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
                  onClick={() => {
                    patchTask(idx, { start: `after ${id}` });
                    focusScheduleInput(idx, field);
                  }}
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
        <div className="mge-gantt-picker-hint">{t.gantt.pickerHint}</div>
      </div>
    );
  };

  const renderScheduleCell = (task: GanttTask | null, idx: number, field: ScheduleField, item: GanttItem) => {
    const typeColumn: GanttCellColumn = field === "start" ? "startType" : "endType";
    const value = task?.[field] ?? "";
    if (!task) {
      // Empty schedule cell for a section/raw row: focusable placeholders for
      // both the value and type slots so Tab/arrows pass straight through.
      return (
        <div className="mge-gantt-schedule-cell">
          {renderEmptyCell(idx, field, item)}
          {renderEmptyCell(idx, typeColumn, item)}
        </div>
      );
    }

    const patch = (next: string) => patchTask(idx, { [field]: next || undefined } as Partial<GanttTask>);
    const valueType = scheduleValueType(field, value);
    const setType = (nextType: ScheduleValueType) => setScheduleType(idx, field, nextType);
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
          onKeyDown={onCellKeyDown(idx, COL(field), item)}
          onChange={(event) => patch(event.target.value)}
          placeholder={field === "start" ? `${dateFormat} / after id` : `${dateFormat} / 7d`}
        />
        <select
          ref={registerCell(idx, typeColumn)}
          className="mge-gantt-schedule-type"
          aria-label={`${field} type`}
          value={valueType}
          onFocus={() => setSelection({ type: "task", index: idx })}
          onChange={(event) => setType(event.target.value as ScheduleValueType)}
          onKeyDown={onCellKeyDown(idx, COL(typeColumn), item)}
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
            onFocus={() => setSelection({ type: "task", index: idx })}
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
            onFocus={() => setSelection({ type: "task", index: idx })}
            onClick={() => {
              const open =
                schedulePicker?.row === idx && schedulePicker?.field === field;
              if (open) {
                setSchedulePicker(null);
                return;
              }
              openSchedulePicker(idx, field);
              focusScheduleInput(idx, field);
            }}
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
            onTickIntervalChange={setTickInterval}
            onReorderItem={reorderItem}
            onDeleteTask={deleteItem}
            onDeleteDependency={clearDependency}
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
            <span>{t.gantt.dateFormatCaption}</span>
            <select
              className="mge-gantt-field"
              value={showCustomDateFormat ? "custom" : dateFormatPreset}
              onChange={(event) => onDateFormatPresetChange(event.target.value)}
              onKeyDown={blurOnEscape}
              aria-label={t.gantt.dateFormatRoleHint}
            >
              <option value="date">{t.gantt.dateFormatPresetDate}</option>
              <option value="datetime">{t.gantt.dateFormatPresetDateTime}</option>
              <option value="time">{t.gantt.dateFormatPresetTime}</option>
              <option value="custom">{t.gantt.dateFormatPresetCustom}</option>
            </select>
            {showCustomDateFormat ? (
              <input
                className="mge-gantt-field mge-gantt-dateformat-custom"
                value={dateFormatDraft ?? dateFormat}
                onChange={(event) => setDateFormatDraft(event.target.value)}
                onBlur={() => {
                  if (dateFormatDraft !== null) changeDateFormat(dateFormatDraft);
                  setDateFormatDraft(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    setDateFormatDraft(null);
                    event.currentTarget.blur();
                  }
                }}
                placeholder="YYYY-MM-DD"
                aria-label={t.gantt.dateFormatCustomLabel}
              />
            ) : null}
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

        <section className="mge-gantt-grid-shell" aria-label="Gantt task table" ref={gridShellRef}>
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
                className={`${rowClass} ${tableDraggingIndex === idx ? "dragging" : ""} ${
                  selection?.type === "task" && selection.index === idx ? "selected" : ""
                }`}
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
                      ref={registerCell(idx, "status")}
                      className="mge-gantt-cell-select"
                      value={primaryStatus(task.modifiers)}
                      onFocus={() => setSelection({ type: "task", index: idx })}
                      onKeyDown={onCellKeyDown(idx, COL("status"), item)}
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
                        ref={registerCell(idx, "crit")}
                        type="checkbox"
                        checked={task.modifiers.includes("crit")}
                        onFocus={() => setSelection({ type: "task", index: idx })}
                        onChange={(event) =>
                          patchTask(idx, {
                            modifiers: composeModifiers(primaryStatus(task.modifiers), event.target.checked),
                          })
                        }
                        onKeyDown={onCellKeyDown(idx, COL("crit"), item)}
                      />
                      crit
                    </label>
                  </div>
                ) : (
                  <div className="mge-gantt-status-cell">
                    {renderEmptyCell(idx, "status", item)}
                    {renderEmptyCell(idx, "crit", item)}
                  </div>
                )}
                {renderScheduleCell(task, idx, "start", item)}
                {renderScheduleCell(task, idx, "end", item)}
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
