import { parseRadar } from "../radar/parser";
import { generateRadar } from "../radar/generator";
import type { RadarIR } from "../radar/ir-types";
import type { DiagramAdapter } from "./types";

export const radarAdapter: DiagramAdapter<RadarIR> = {
  kind: "radar-beta",
  supportsGui: true,
  parse: parseRadar,
  generate: generateRadar,
};
