import type { DiagramAdapter } from "./types";
import type { ArchitectureIR } from "../architecture/ir-types";
import { parseArchitecture } from "../architecture/parser";
import { generateArchitecture } from "../architecture/generator";

export const architectureAdapter: DiagramAdapter<ArchitectureIR> = {
  kind: "architecture-beta",
  supportsGui: true,
  parse: parseArchitecture,
  generate: generateArchitecture,
};
