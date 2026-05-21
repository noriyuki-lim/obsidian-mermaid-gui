import type { ErDiagramIR } from "./ir-types";

export function generateErDiagram(ir: ErDiagramIR): string {
  const lines: string[] = ["erDiagram"];

  for (const entity of ir.entities) {
    lines.push(`    ${entity.name} {`);
    for (const attr of entity.attributes) {
      const keys = attr.keys.length > 0 ? " " + attr.keys.join(" ") : "";
      const comment = attr.comment ? ` "${attr.comment}"` : "";
      lines.push(`        ${attr.type} ${attr.name}${keys}${comment}`);
    }
    lines.push("    }");
  }

  for (const item of ir.items) {
    if (item.type === "raw") {
      lines.push(item.line);
    } else {
      lines.push(
        `    ${item.leftEntity} ${item.leftCard}${item.lineStyle}${item.rightCard} ${item.rightEntity} : "${item.label}"`
      );
    }
  }

  return lines.join("\n");
}
