import type { DiagramAdapter } from "./types";
import type { VennIR } from "../venn/ir-types";
import { parseVenn } from "../venn/parser";
import { generateVenn } from "../venn/generator";

export const vennAdapter: DiagramAdapter<VennIR> = {
  kind: "venn-beta",
  supportsGui: false,
  parse: parseVenn,
  generate: generateVenn,
};
