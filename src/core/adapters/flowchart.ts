import { parseMermaid } from "../parser";
import { generateMermaid } from "../generator";
import type { MermaidIR } from "../ir-types";
import type { DiagramAdapter } from "./types";

export const flowchartAdapter: DiagramAdapter<MermaidIR> = {
  kind: "flowchart",
  supportsGui: true,
  parse: parseMermaid,
  generate: generateMermaid,
};
