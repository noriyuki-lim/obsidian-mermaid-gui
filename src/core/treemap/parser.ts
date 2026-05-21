import type { ParseOutcome } from "../adapters/types";
import type { TreemapIR } from "./ir-types";

export function parseTreemap(source: string): ParseOutcome<TreemapIR> {
  return {
    ok: true,
    ir: { kind: "treemap-beta", rawLines: source.split(/\r?\n/) },
    warnings: [],
  };
}
