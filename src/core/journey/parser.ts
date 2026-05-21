import type { ParseOutcome } from "../adapters/types";
import type { JourneyIR, JourneyItem } from "./ir-types";

// Task line: name : score : actor[, actor...]
const TASK_RE = /^(.+?)\s*:\s*(\d+)\s*:\s*(.+)$/;

export function parseJourney(source: string): ParseOutcome<JourneyIR> {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let foundHeader = false;
  let title: string | undefined;
  const items: JourneyItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith("%%")) continue;

    if (!foundHeader) {
      if (/^journey(\s|$)/.test(trimmed)) {
        foundHeader = true;
        continue;
      }
      return { ok: false, message: "Missing journey header", line: i + 1 };
    }

    const titleMatch = trimmed.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }

    const sectionMatch = trimmed.match(/^section\s+(.+)$/i);
    if (sectionMatch) {
      items.push({ type: "section", title: sectionMatch[1].trim() });
      continue;
    }

    const taskMatch = trimmed.match(TASK_RE);
    if (taskMatch) {
      const name = taskMatch[1].trim();
      const score = parseInt(taskMatch[2], 10);
      const actorsStr = taskMatch[3].trim();
      const actors = actorsStr.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
      items.push({ type: "task", name, score, actors });
      continue;
    }

    items.push({ type: "raw", line: raw });
  }

  if (!foundHeader) {
    return { ok: false, message: "Missing journey header" };
  }

  return { ok: true, ir: { kind: "journey", title, items }, warnings: [] };
}
