import type { MindmapIR, MindmapNode, MindmapNodeShape } from "./ir-types";

function shapeWrap(text: string, shape: MindmapNodeShape): string {
  switch (shape) {
    case "square": return `[${text}]`;
    case "rounded": return `(${text})`;
    case "circle": return `((${text}))`;
    case "bang": return `))${text}((`;
    case "cloud": return `)${text}(`;
    case "hexagon": return `{{${text}}}`;
    default: return text;
  }
}

function renderNode(node: MindmapNode, indent: number, lines: string[]): void {
  const pad = " ".repeat(indent);
  lines.push(pad + shapeWrap(node.text, node.shape));
  if (node.icon) {
    lines.push(pad + `::icon(${node.icon})`);
  }
  for (const child of node.children) {
    renderNode(child, indent + 2, lines);
  }
}

export function generateMindmap(ir: MindmapIR): string {
  const lines = ["mindmap"];
  if (ir.root) {
    renderNode(ir.root, 2, lines);
  }
  return lines.join("\n");
}
