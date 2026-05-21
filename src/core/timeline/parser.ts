import type { ParseOutcome } from "../adapters/types";
import type { TimelineIR, TimelineItem, TimelinePeriod } from "./ir-types";

export function parseTimeline(source: string): ParseOutcome<TimelineIR> {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let foundHeader = false;
  let title: string | undefined;
  const items: TimelineItem[] = [];
  let currentPeriod: TimelinePeriod | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (line === "" || line.startsWith("%%")) continue;

    if (!foundHeader) {
      if (line.startsWith("```")) continue;
      if (/^timeline(\s|$)/i.test(line)) {
        foundHeader = true;
        continue;
      }
      return { ok: false, message: "Missing timeline header", line: i + 1 };
    }

    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }

    const sectionMatch = line.match(/^section\s+(.+)$/i);
    if (sectionMatch) {
      if (currentPeriod) {
        items.push(currentPeriod);
        currentPeriod = null;
      }
      items.push({ type: "section", title: sectionMatch[1].trim() });
      continue;
    }

    // continuation: starts with ":"
    const contMatch = line.match(/^:\s*(.*)$/);
    if (contMatch) {
      if (currentPeriod) {
        currentPeriod.events.push(contMatch[1].trim());
      } else {
        items.push({ type: "raw", line: raw });
      }
      continue;
    }

    // period: "label : event"
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const periodLabel = line.slice(0, colonIdx).trim();
      const event = line.slice(colonIdx + 1).trim();
      if (currentPeriod) items.push(currentPeriod);
      currentPeriod = {
        type: "period",
        label: periodLabel,
        events: event ? [event] : [],
      };
      continue;
    }

    if (currentPeriod) {
      items.push(currentPeriod);
      currentPeriod = null;
    }
    items.push({ type: "raw", line: raw });
  }

  if (currentPeriod) items.push(currentPeriod);

  if (!foundHeader) {
    return { ok: false, message: "Missing timeline header" };
  }

  return { ok: true, ir: { kind: "timeline", title, items }, warnings: [] };
}
