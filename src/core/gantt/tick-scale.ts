const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY; // approximate — Mermaid uses calendar months; fine for preview spacing

const TICK_UNIT_MS: Record<string, number> = {
  millisecond: 1,
  second: SECOND,
  minute: MINUTE,
  hour: HOUR,
  day: DAY,
  week: WEEK,
  month: MONTH,
};

/**
 * Parses a Mermaid gantt `tickInterval` token (e.g. `1day`, `1week`, `6hour`)
 * to milliseconds; null if unrecognized. Mermaid's own grammar is
 * `<n><unit>` with singular units (millisecond/second/minute/hour/day/week/
 * month); a trailing plural `s` is tolerated on read for leniency.
 */
export function parseTickInterval(token: string | undefined): number | null {
  if (!token) return null;
  const match = token.trim().match(/^([1-9]\d*)\s*(millisecond|second|minute|hour|day|week|month)s?$/i);
  if (!match) return null;
  const unit = TICK_UNIT_MS[match[2].toLowerCase()];
  return unit ? Number(match[1]) * unit : null;
}

/** Ascending ladder of "nice" tick intervals, 1 second through ~1 year. */
const NICE_INTERVALS_MS: number[] = [
  1 * SECOND, 5 * SECOND, 15 * SECOND, 30 * SECOND,
  1 * MINUTE, 5 * MINUTE, 15 * MINUTE, 30 * MINUTE,
  1 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
  1 * DAY, 3 * DAY, 1 * WEEK, 2 * WEEK,
  30 * DAY, 90 * DAY, 180 * DAY, 365 * DAY,
];

const TARGET_TICK_COUNT = 8;

/** Smallest "nice" interval (ms) yielding roughly `targetTicks` ticks over `spanMs`. */
export function pickTickIntervalMs(spanMs: number, targetTicks = TARGET_TICK_COUNT): number {
  const rough = Math.max(spanMs, 1) / Math.max(targetTicks, 1);
  for (const interval of NICE_INTERVALS_MS) {
    if (interval >= rough) return interval;
  }
  const largest = NICE_INTERVALS_MS[NICE_INTERVALS_MS.length - 1];
  return largest * Math.max(1, Math.ceil(rough / largest));
}

/** Inclusive tick times from `min` to `max` at `intervalMs`, always including `max`. */
export function buildTicks(min: number, max: number, intervalMs: number): number[] {
  if (max <= min) return [min];
  const ticks: number[] = [];
  for (let t = min; t <= max; t += intervalMs) ticks.push(t);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}

/**
 * Ticks phase-locked to *absolute* time — multiples of `intervalMs` measured
 * from the Unix epoch — rather than anchored at `min` like `buildTicks`. A
 * given instant's gridline therefore sits at the same time no matter how the
 * viewport is zoomed or panned (only which ticks fall in range changes), which
 * is what makes a fixed `tickInterval` grid stay put during zoom.
 */
export function buildAbsoluteTicks(min: number, max: number, intervalMs: number): number[] {
  if (intervalMs <= 0 || max <= min) return [min];
  const first = Math.ceil(min / intervalMs) * intervalMs;
  const ticks: number[] = [];
  for (let t = first; t <= max; t += intervalMs) ticks.push(t);
  return ticks.length ? ticks : [min];
}

/**
 * Proportional timeline padding: one tick-unit before the earliest task,
 * two units after — same 1:2 asymmetry as the old fixed 1-day/2-day
 * padding, scaled to the chart's own span instead of always being whole days.
 */
export function paddedRange(rawMin: number, rawMax: number): { min: number; max: number } {
  const unit = pickTickIntervalMs(Math.max(rawMax - rawMin, 0));
  return { min: rawMin - unit, max: rawMax + unit * 2 };
}
