import { parseClassDiagram } from "../class/parser";
import { generateClassDiagram } from "../class/generator";
import type { ClassDiagramIR } from "../class/ir-types";
import type { DiagramAdapter } from "./types";

export const classAdapter: DiagramAdapter<ClassDiagramIR> = {
  kind: "classDiagram",
  supportsGui: true,
  parse: parseClassDiagram,
  generate: generateClassDiagram,
};
