import type { DiagramAdapter } from "./types";
import type { ErDiagramIR } from "../er/ir-types";
import { parseErDiagram } from "../er/parser";
import { generateErDiagram } from "../er/generator";

export const erAdapter: DiagramAdapter<ErDiagramIR> = {
  kind: "erDiagram",
  supportsGui: true,
  parse: parseErDiagram,
  generate: generateErDiagram,
};
