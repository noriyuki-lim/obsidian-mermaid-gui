import type { GanttIR, GanttTask } from "./ir-types";

function renderTaskSpec(task: GanttTask): string {
  const parts: string[] = [...task.modifiers];
  if (task.id) parts.push(task.id);
  if (task.start) parts.push(task.start);
  if (task.end) parts.push(task.end);
  return parts.join(", ");
}

export function generateGantt(ir: GanttIR): string {
  const lines: string[] = ["gantt"];
  if (ir.title) lines.push(`    title ${ir.title}`);
  if (ir.dateFormat) lines.push(`    dateFormat ${ir.dateFormat}`);
  if (ir.axisFormat) lines.push(`    axisFormat ${ir.axisFormat}`);
  if (ir.tickInterval) lines.push(`    tickInterval ${ir.tickInterval}`);

  for (const item of ir.items) {
    if (item.type === "raw") {
      lines.push(item.line);
    } else if (item.type === "section") {
      lines.push(`    section ${item.title}`);
    } else {
      const spec = renderTaskSpec(item);
      lines.push(spec ? `    ${item.label} :${spec}` : `    ${item.label} :`);
    }
  }

  return lines.join("\n") + "\n";
}
