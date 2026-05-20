import { parsePie } from "../pie/parser";
import { generatePie } from "../pie/generator";
import type { PieIR } from "../pie/ir-types";
import type { DiagramAdapter } from "./types";

export const pieAdapter: DiagramAdapter<PieIR> = {
  kind: "pie",
  supportsGui: true,
  parse: parsePie,
  generate: generatePie,
};
