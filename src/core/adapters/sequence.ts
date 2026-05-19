import { parseSequence } from "../sequence/parser";
import { generateSequence } from "../sequence/generator";
import type { SequenceIR } from "../sequence/ir-types";
import type { DiagramAdapter } from "./types";

export const sequenceAdapter: DiagramAdapter<SequenceIR> = {
  kind: "sequenceDiagram",
  supportsGui: true,
  parse: parseSequence,
  generate: generateSequence,
};
