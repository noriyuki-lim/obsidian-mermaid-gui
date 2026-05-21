import type { TreemapIR } from "./ir-types";

export function generateTreemap(ir: TreemapIR): string {
  return ir.rawLines.join("\n");
}
