import type { DiagramAdapter } from "./types";
import type { GanttIR } from "../gantt/ir-types";
import { parseGantt } from "../gantt/parser";
import { generateGantt } from "../gantt/generator";

export const ganttAdapter: DiagramAdapter<GanttIR> = {
  kind: "gantt",
  supportsGui: true,
  parse: parseGantt,
  generate: generateGantt,
};
