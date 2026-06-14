import type { DiagramAdapter } from "./types";
import type { KanbanIR } from "../kanban/ir-types";
import { parseKanban } from "../kanban/parser";
import { generateKanban } from "../kanban/generator";

export const kanbanAdapter: DiagramAdapter<KanbanIR> = {
  kind: "kanban",
  supportsGui: true,
  parse: parseKanban,
  generate: generateKanban,
};
