export type MindmapNodeShape =
  | "default"   // plain text
  | "square"    // [text]
  | "rounded"   // (text)
  | "circle"    // ((text))
  | "bang"      // ))text((
  | "cloud"     // )text(
  | "hexagon";  // {{text}}

export interface MindmapNode {
  text: string;
  shape: MindmapNodeShape;
  icon?: string;
  children: MindmapNode[];
}

export interface MindmapIR {
  kind: "mindmap";
  root: MindmapNode | null;
}
