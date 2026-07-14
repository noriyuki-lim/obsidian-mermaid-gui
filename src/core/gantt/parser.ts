import type { ParseOutcome } from "../adapters/types";
import { DEFAULT_DATE_FORMAT, isDateStringForFormat } from "./date-format";
import type { GanttIR, GanttItem, GanttTask, GanttTaskStatus } from "./ir-types";

const MODIFIERS = new Set<GanttTaskStatus>(["done", "active", "crit", "milestone"]);

/**
 * Structural "is this token a date" check, used only to decide which comma-
 * separated field a token fills (id vs start vs end) — so it must honor the
 * chart's own `dateFormat` (e.g. `HH:mm`). A hardcoded `YYYY-MM-DD`-only
 * check here would misclassify a bare time-only start token (no id given)
 * as an id and silently drop the actual start time.
 */
function isDateLike(s: string, dateFormat: string): boolean {
  return isDateStringForFormat(s, dateFormat);
}

function isDuration(s: string): boolean {
  return /^\d+\s*[dhwMs]$/i.test(s);
}

function isAfterOrUntil(s: string): boolean {
  return /^(after|until)\s+\S+$/i.test(s);
}

function isDateOrDuration(s: string, dateFormat: string): boolean {
  return isDateLike(s, dateFormat) || isDuration(s) || isAfterOrUntil(s);
}

function parseTaskSpec(
  spec: string,
  dateFormat: string,
): Pick<GanttTask, "modifiers" | "id" | "start" | "end"> {
  const parts = spec
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const modifiers: GanttTaskStatus[] = [];
  let i = 0;

  while (i < parts.length && MODIFIERS.has(parts[i] as GanttTaskStatus)) {
    modifiers.push(parts[i] as GanttTaskStatus);
    i++;
  }

  const rest = parts.slice(i);
  let id: string | undefined;
  let start: string | undefined;
  let end: string | undefined;

  if (rest.length === 0) {
    return { modifiers };
  } else if (rest.length === 1) {
    end = rest[0];
  } else if (rest.length === 2) {
    if (!isDateOrDuration(rest[0], dateFormat)) {
      id = rest[0];
      end = rest[1];
    } else {
      start = rest[0];
      end = rest[1];
    }
  } else {
    if (!isDateOrDuration(rest[0], dateFormat)) {
      id = rest[0];
      start = rest[1];
      end = rest.slice(2).join(", ");
    } else {
      start = rest[0];
      end = rest.slice(1).join(", ");
    }
  }

  return { modifiers, id, start, end };
}

export function parseGantt(source: string): ParseOutcome<GanttIR> {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let foundHeader = false;
  let title: string | undefined;
  let dateFormat: string | undefined;
  let axisFormat: string | undefined;
  const items: GanttItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (line === "" || line.startsWith("%%")) continue;

    if (!foundHeader) {
      if (line.startsWith("```")) continue;
      if (/^gantt(\s|$)/i.test(line)) {
        foundHeader = true;
        continue;
      }
      return { ok: false, message: "Missing gantt header", line: i + 1 };
    }

    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }

    const dfMatch = line.match(/^dateFormat\s+(\S+)$/i);
    if (dfMatch) {
      dateFormat = dfMatch[1];
      continue;
    }

    const afMatch = line.match(/^axisFormat\s+(\S+)$/i);
    if (afMatch) {
      axisFormat = afMatch[1];
      continue;
    }

    const sectionMatch = line.match(/^section\s+(.+)$/i);
    if (sectionMatch) {
      items.push({ type: "section", title: sectionMatch[1].trim() });
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const label = line.slice(0, colonIdx).trim();
      const spec = line.slice(colonIdx + 1).trim();
      items.push({ type: "task", label, ...parseTaskSpec(spec, dateFormat ?? DEFAULT_DATE_FORMAT) });
      continue;
    }

    items.push({ type: "raw", line: raw });
  }

  if (!foundHeader) {
    return { ok: false, message: "Missing gantt header" };
  }

  return { ok: true, ir: { kind: "gantt", title, dateFormat, axisFormat, items }, warnings: [] };
}
