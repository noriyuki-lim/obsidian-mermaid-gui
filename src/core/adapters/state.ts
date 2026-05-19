import { parseStateDiagram } from "../state/parser";
import { generateStateDiagram } from "../state/generator";
import type { StateDiagramIR } from "../state/ir-types";
import type { DiagramAdapter } from "./types";

export const stateAdapter: DiagramAdapter<StateDiagramIR> = {
  kind: "stateDiagram-v2",
  supportsGui: true,
  parse: parseStateDiagram,
  generate: generateStateDiagram,
};
