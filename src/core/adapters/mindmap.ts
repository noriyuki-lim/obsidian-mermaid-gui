import type { DiagramAdapter } from "./types";
import type { MindmapIR } from "../mindmap/ir-types";
import { parseMindmap } from "../mindmap/parser";
import { generateMindmap } from "../mindmap/generator";

export const mindmapAdapter: DiagramAdapter<MindmapIR> = {
  kind: "mindmap",
  supportsGui: true,
  parse: parseMindmap,
  generate: generateMindmap,
};
