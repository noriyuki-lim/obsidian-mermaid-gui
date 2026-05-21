import type { ParseOutcome } from "../adapters/types";
import type { VennIR } from "./ir-types";

export function parseVenn(source: string): ParseOutcome<VennIR> {
  return {
    ok: true,
    ir: { kind: "venn-beta", rawLines: source.split(/\r?\n/) },
    warnings: [],
  };
}
