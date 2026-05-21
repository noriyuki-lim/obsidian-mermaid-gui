import type { DiagramAdapter } from "./types";
import type { TreemapIR } from "../treemap/ir-types";
import { parseTreemap } from "../treemap/parser";
import { generateTreemap } from "../treemap/generator";

export const treemapAdapter: DiagramAdapter<TreemapIR> = {
  kind: "treemap-beta",
  supportsGui: false,
  parse: parseTreemap,
  generate: generateTreemap,
};
