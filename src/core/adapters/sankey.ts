import { parseSankey } from "../sankey/parser";
import { generateSankey } from "../sankey/generator";
import type { SankeyIR } from "../sankey/ir-types";
import type { DiagramAdapter } from "./types";

export const sankeyAdapter: DiagramAdapter<SankeyIR> = {
  kind: "sankey-beta",
  supportsGui: true,
  parse: parseSankey,
  generate: generateSankey,
};
