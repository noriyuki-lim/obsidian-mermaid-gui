import type { TimelineIR } from "./ir-types";

export function generateTimeline(ir: TimelineIR): string {
  const lines: string[] = ["timeline"];
  if (ir.title) lines.push(`    title ${ir.title}`);

  for (const item of ir.items) {
    if (item.type === "raw") {
      lines.push(item.line);
    } else if (item.type === "section") {
      lines.push(`    section ${item.title}`);
    } else {
      const [first, ...rest] = item.events;
      if (first !== undefined) {
        lines.push(`    ${item.label} : ${first}`);
        for (const evt of rest) {
          lines.push(`        : ${evt}`);
        }
      } else {
        lines.push(`    ${item.label} :`);
      }
    }
  }

  return lines.join("\n") + "\n";
}
