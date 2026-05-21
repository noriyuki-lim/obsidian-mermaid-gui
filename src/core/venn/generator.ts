import type { VennIR } from "./ir-types";

export function generateVenn(ir: VennIR): string {
  return ir.rawLines.join("\n");
}
