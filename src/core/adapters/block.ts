import type { DiagramAdapter } from "./types";
import type { BlockIR } from "../block/ir-types";
import { parseBlock } from "../block/parser";
import { generateBlock } from "../block/generator";

export const blockAdapter: DiagramAdapter<BlockIR> = {
  kind: "block-beta",
  supportsGui: true,
  parse: parseBlock,
  generate: generateBlock,
};
