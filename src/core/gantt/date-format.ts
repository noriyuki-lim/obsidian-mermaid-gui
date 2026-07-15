/**
 * Parses and formats date/time tokens according to a Mermaid gantt
 * `dateFormat` directive (dayjs-style tokens: YYYY, MM, DD, HH, mm, ss —
 * distinct from `axisFormat`'s strftime-style `%Y`/`%m`/`%d` tokens in
 * axis-format.ts). Mermaid's own default when no `dateFormat` is given.
 */
export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

export type DateFieldKey = "year" | "month" | "day" | "hour" | "minute" | "second";

interface FieldToken {
  token: string;
  field: DateFieldKey;
  digits: number;
}

const RAW_TOKENS: FieldToken[] = [
  { token: "YYYY", field: "year", digits: 4 },
  { token: "YY", field: "year", digits: 2 },
  { token: "MM", field: "month", digits: 2 },
  { token: "M", field: "month", digits: 1 },
  { token: "DD", field: "day", digits: 2 },
  { token: "D", field: "day", digits: 1 },
  { token: "HH", field: "hour", digits: 2 },
  { token: "H", field: "hour", digits: 1 },
  { token: "mm", field: "minute", digits: 2 },
  { token: "m", field: "minute", digits: 1 },
  { token: "ss", field: "second", digits: 2 },
  { token: "s", field: "second", digits: 1 },
];

// Longest-first within an equal-length group doesn't matter; what matters is
// that multi-char tokens (YYYY, MM, DD, HH, mm, ss) are tried before their
// single-char counterparts (M, D, H, m, s) so tokenizing doesn't stop short.
const TOKENS: FieldToken[] = [...RAW_TOKENS].sort((a, b) => b.token.length - a.token.length);

type FormatPart = { literal: string } | { field: DateFieldKey; digits: number };

/** Splits a dateFormat string into literal runs and recognized field tokens. */
export function tokenizeDateFormat(format: string): FormatPart[] {
  const parts: FormatPart[] = [];
  let i = 0;
  outer: while (i < format.length) {
    for (const t of TOKENS) {
      if (format.startsWith(t.token, i)) {
        parts.push({ field: t.field, digits: t.digits });
        i += t.token.length;
        continue outer;
      }
    }
    const last = parts[parts.length - 1];
    if (last && "literal" in last) last.literal += format[i];
    else parts.push({ literal: format[i] });
    i += 1;
  }
  return parts;
}

const pad = (value: number, digits: number) => String(Math.max(0, value)).padStart(digits, "0");

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface FormatMatcher {
  regex: RegExp;
  fieldOrder: DateFieldKey[];
}

const matcherCache = new Map<string, FormatMatcher>();

function buildMatcher(format: string): FormatMatcher {
  const cached = matcherCache.get(format);
  if (cached) return cached;
  const parts = tokenizeDateFormat(format);
  const fieldOrder: DateFieldKey[] = [];
  const pattern = parts
    .map((part) => {
      if ("literal" in part) return escapeRegex(part.literal);
      fieldOrder.push(part.field);
      // Single-letter tokens (M, D, H, m, s) accept 1-2 digits, matching
      // dayjs's own leniency; double-letter tokens are fixed-width.
      return part.digits === 1 ? "(\\d{1,2})" : `(\\d{${part.digits}})`;
    })
    .join("");
  const matcher: FormatMatcher = { regex: new RegExp(`^${pattern}$`), fieldOrder };
  matcherCache.set(format, matcher);
  return matcher;
}

/** True if `value` matches the shape of `format` (e.g. "06:30" under "HH:mm"). */
export function isDateStringForFormat(value: string, format: string): boolean {
  return buildMatcher(format).regex.test(value.trim());
}

/**
 * Parses `value` according to `format`, returning a UTC timestamp. Date
 * components absent from the format (e.g. a pure `HH:mm` chart) default to
 * the Unix epoch day (1970-01-01) — an arbitrary but *consistent* anchor, so
 * relative comparisons (ordering, durations) between date-less timestamps
 * still work correctly even though the calendar date itself is meaningless.
 */
export function parseDateWithFormat(value: string, format: string): number | null {
  const { regex, fieldOrder } = buildMatcher(format);
  const match = value.trim().match(regex);
  if (!match) return null;
  const fields: Partial<Record<DateFieldKey, number>> = {};
  fieldOrder.forEach((field, idx) => {
    fields[field] = Number(match[idx + 1]);
  });
  const year = fields.year === undefined ? 1970 : fields.year < 100 ? 2000 + fields.year : fields.year;
  const month = (fields.month ?? 1) - 1;
  const day = fields.day ?? 1;
  const hour = fields.hour ?? 0;
  const minute = fields.minute ?? 0;
  const second = fields.second ?? 0;
  const time = Date.UTC(year, month, day, hour, minute, second);
  return Number.isFinite(time) ? time : null;
}

/** Formats a UTC timestamp according to `format`. */
export function formatDateWithFormat(time: number, format: string): string {
  const date = new Date(time);
  const raw: Record<DateFieldKey, number> = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
  return tokenizeDateFormat(format)
    .map((part) => {
      if ("literal" in part) return part.literal;
      const value = raw[part.field];
      return part.field === "year" && part.digits === 2 ? pad(value % 100, 2) : pad(value, part.digits);
    })
    .join("");
}

/** Which field a caret position within a `format`-shaped string falls on. */
export function fieldAtCaret(format: string, caretPos: number): DateFieldKey {
  let offset = 0;
  let lastField: DateFieldKey = "day";
  for (const part of tokenizeDateFormat(format)) {
    if ("literal" in part) {
      offset += part.literal.length;
      continue;
    }
    offset += part.digits;
    lastField = part.field;
    if (caretPos <= offset) return part.field;
  }
  return lastField;
}

/** Adds `delta` to a single UTC date/time field of `time`. */
export function addDateField(time: number, field: DateFieldKey, delta: number): number {
  const date = new Date(time);
  return Date.UTC(
    date.getUTCFullYear() + (field === "year" ? delta : 0),
    date.getUTCMonth() + (field === "month" ? delta : 0),
    date.getUTCDate() + (field === "day" ? delta : 0),
    date.getUTCHours() + (field === "hour" ? delta : 0),
    date.getUTCMinutes() + (field === "minute" ? delta : 0),
    date.getUTCSeconds() + (field === "second" ? delta : 0),
  );
}

/** Parses only the fields `format` actually specifies — no epoch defaulting. */
function parsePresentFields(value: string, format: string): Partial<Record<DateFieldKey, number>> | null {
  const { regex, fieldOrder } = buildMatcher(format);
  const match = value.trim().match(regex);
  if (!match) return null;
  const fields: Partial<Record<DateFieldKey, number>> = {};
  fieldOrder.forEach((field, idx) => {
    const raw = Number(match[idx + 1]);
    fields[field] = field === "year" && raw < 100 ? 2000 + raw : raw;
  });
  return fields;
}

/**
 * Re-expresses a date value written under `fromFormat` into `toFormat`.
 * Values that aren't a date token under `fromFormat` (duration tokens like
 * `3d`, `after <id>` references, or anything unparseable) are returned
 * untouched — so callers can map this over every start/end field blindly.
 *
 * When the target format needs components the source omits, missing *date*
 * parts (year/month/day) inherit from `now` and missing *time* parts default
 * to midnight. So a time-only → dated switch lands in the current year (not
 * 1970, the epoch anchor `parseDateWithFormat` uses for pure ordering math),
 * while a dated → time switch reads a clean `00:00`. That partial loss is the
 * intended meaning of "change the notation", not a bug.
 */
export function reformatDateValue(
  value: string,
  fromFormat: string,
  toFormat: string,
  now: number = Date.now(),
): string {
  if (fromFormat === toFormat) return value;
  const fields = parsePresentFields(value, fromFormat);
  if (!fields) return value;
  const base = new Date(now);
  const time = Date.UTC(
    fields.year ?? base.getUTCFullYear(),
    (fields.month ?? base.getUTCMonth() + 1) - 1,
    fields.day ?? base.getUTCDate(),
    fields.hour ?? 0,
    fields.minute ?? 0,
    fields.second ?? 0,
  );
  return Number.isFinite(time) ? formatDateWithFormat(time, toFormat) : value;
}

export type DateFormatCapability = "date" | "time" | "datetime";

/** Whether `format` carries a calendar date, a time-of-day, or both. */
export function dateFormatCapability(format: string): DateFormatCapability {
  let hasDate = false;
  let hasTime = false;
  for (const part of tokenizeDateFormat(format)) {
    if ("literal" in part) continue;
    if (part.field === "year" || part.field === "month" || part.field === "day") hasDate = true;
    else hasTime = true;
  }
  if (hasDate && hasTime) return "datetime";
  return hasTime ? "time" : "date";
}

/** Whether `format` includes a seconds component (`ss`/`s`). */
export function dateFormatHasSeconds(format: string): boolean {
  return tokenizeDateFormat(format).some((part) => "field" in part && part.field === "second");
}

/**
 * The native HTML input best suited to `format`, and the fixed format string
 * that input's *own* value string always uses (independent of the chart's
 * dateFormat) — `<input type="date">` is always `YYYY-MM-DD`, `type="time"`
 * is always `HH:mm`(`:ss`), `type="datetime-local"` is always
 * `YYYY-MM-DDTHH:mm`(`:ss`), regardless of how the chart itself formats
 * dates. Converting through this fixed format is how we bridge the native
 * picker and the chart's own dateFormat-shaped stored value.
 */
export function nativeDateInput(format: string): { type: "date" | "time" | "datetime-local"; nativeFormat: string } {
  const capability = dateFormatCapability(format);
  const withSeconds = dateFormatHasSeconds(format);
  if (capability === "date") return { type: "date", nativeFormat: "YYYY-MM-DD" };
  if (capability === "time") return { type: "time", nativeFormat: withSeconds ? "HH:mm:ss" : "HH:mm" };
  return { type: "datetime-local", nativeFormat: withSeconds ? "YYYY-MM-DDTHH:mm:ss" : "YYYY-MM-DDTHH:mm" };
}
