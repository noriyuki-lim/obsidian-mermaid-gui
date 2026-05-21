import type { JourneyIR } from "./ir-types";

export function generateJourney(ir: JourneyIR): string {
  const lines: string[] = ["journey"];
  if (ir.title) {
    lines.push(`    title ${ir.title}`);
  }
  for (const item of ir.items) {
    if (item.type === "raw") {
      lines.push(item.line);
    } else if (item.type === "section") {
      lines.push(`    section ${item.title}`);
    } else {
      const actors = item.actors.join(", ");
      lines.push(`      ${item.name}: ${item.score}: ${actors}`);
    }
  }
  return lines.join("\n");
}
