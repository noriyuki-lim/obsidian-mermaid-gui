import { parseXYChart } from "../xychart/parser";
import { generateXYChart } from "../xychart/generator";
import type { XYChartIR } from "../xychart/ir-types";
import type { DiagramAdapter } from "./types";

export const xychartAdapter: DiagramAdapter<XYChartIR> = {
  kind: "xychart-beta",
  supportsGui: true,
  parse: parseXYChart,
  generate: generateXYChart,
};
