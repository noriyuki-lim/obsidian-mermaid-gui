import type { ArchitectureIR, ArchGroup, ArchService } from "./ir-types";

function renderDecl(item: ArchGroup | ArchService, keyword: string): string {
  const icon = item.icon ? `(${item.icon})` : "";
  const label = item.label ? `[${item.label}]` : "";
  const groupRef = (item.type === "service" ? item.group : item.parentGroup);
  const inPart = groupRef ? ` in ${groupRef}` : "";
  return `    ${keyword} ${item.id}${icon}${label}${inPart}`;
}

export function generateArchitecture(ir: ArchitectureIR): string {
  const lines: string[] = ["architecture-beta"];
  for (const item of ir.items) {
    switch (item.type) {
      case "group":
        lines.push(renderDecl(item, "group"));
        break;
      case "service":
        lines.push(renderDecl(item, "service"));
        break;
      case "junction": {
        const inPart = item.group ? ` in ${item.group}` : "";
        lines.push(`    junction ${item.id}${inPart}`);
        break;
      }
      case "edge":
        lines.push(`    ${item.fromId}:${item.fromDir} ${item.arrow} ${item.toDir}:${item.toId}`);
        break;
      case "raw":
        lines.push(item.line);
        break;
    }
  }
  return lines.join("\n");
}
