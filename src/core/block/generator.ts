import type { BlockIR } from "./ir-types";

export function generateBlock(ir: BlockIR): string {
  const lines: string[] = ["block-beta"];
  for (const item of ir.items) {
    switch (item.type) {
      case "columns":
        lines.push(`    columns ${item.count}`);
        break;
      case "space":
        lines.push(item.span ? `    space:${item.span}` : `    space`);
        break;
      case "block": {
        let body = item.id;
        if (item.shapeOpen || item.label !== undefined) {
          const open = item.shapeOpen ?? "[";
          const close = item.shapeClose ?? "]";
          const label = item.label !== undefined ? `"${item.label}"` : "";
          body += `${open}${label}${close}`;
        }
        if (item.span !== undefined) body += `:${item.span}`;
        lines.push(`    ${body}`);
        break;
      }
      case "raw":
        lines.push(item.line);
        break;
    }
  }
  return lines.join("\n");
}
