export type GanttDurationUnit = "s" | "m" | "h" | "d" | "w";

const UNIT_DAYS: Record<GanttDurationUnit, number> = {
  s: 1 / 86400,
  m: 1 / 1440,
  h: 1 / 24,
  d: 1,
  w: 7,
};

export interface GanttDurationToken {
  amount: number;
  unit: GanttDurationUnit;
  /** The token's value expressed as a fractional number of days. */
  days: number;
}

/**
 * Parses a Mermaid gantt duration token (e.g. `9m`, `3h`, `2w`, `7d`, `30s`),
 * preserving its original unit alongside the day-equivalent value. Units
 * follow real Mermaid gantt syntax exactly (lowercase only — Mermaid has no
 * month unit and is case-sensitive): s = seconds, m = minutes, h = hours,
 * d = days, w = weeks. `0d`/`0h`/etc are accepted — real Mermaid syntax for a
 * milestone's zero-length duration (`milestone, id, after x, 0d`) — so the
 * gantt editor's `originalEndToken` checks recognize a milestone's "0d" as a
 * real duration token to preserve, instead of falling through to writing an
 * absolute date on the next drag.
 */
export const parseDurationToken = (value: string | undefined): GanttDurationToken | null => {
  if (!value) return null;
  const match = value.trim().match(/^(\d+)\s*([dhwms])$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2] as GanttDurationUnit;
  if (!Number.isFinite(amount) || amount < 0) return null;
  return { amount, unit, days: amount * UNIT_DAYS[unit] };
};

/**
 * Re-serializes a fractional day value as a Mermaid duration token in the
 * given unit, rounding to the nearest integer amount (Mermaid duration
 * tokens only accept whole numbers) and clamping to a minimum of 1.
 */
export const formatDurationToken = (days: number, unit: GanttDurationUnit): string => {
  const amount = Math.max(1, Math.round(days / UNIT_DAYS[unit]));
  return `${amount}${unit}`;
};

/**
 * Milliseconds represented by a single unit of `unit` (e.g. one `m` = 60s).
 * Used as an interaction floor — e.g. "don't let a resize collapse a
 * duration to less than one unit of its own scale" — as opposed to `days`
 * on a parsed token, which is the *whole* amount (e.g. 9 minutes), not one
 * unit of it.
 */
export const oneUnitMs = (unit: GanttDurationUnit): number => UNIT_DAYS[unit] * 86_400_000;

/**
 * Parses a Mermaid gantt duration token into a fractional number of days.
 * Thin wrapper over {@link parseDurationToken} for call sites that only
 * need the day-equivalent value and don't need to preserve the unit.
 */
export const parseDurationDays = (value: string | undefined): number | null =>
  parseDurationToken(value)?.days ?? null;
