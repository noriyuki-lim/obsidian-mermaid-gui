import { parseQuadrant } from "../quadrant/parser";
import { generateQuadrant } from "../quadrant/generator";
import type { QuadrantIR } from "../quadrant/ir-types";
import type { DiagramAdapter } from "./types";

export const quadrantAdapter: DiagramAdapter<QuadrantIR> = {
  kind: "quadrantChart",
  supportsGui: true,
  parse: parseQuadrant,
  generate: generateQuadrant,
};
