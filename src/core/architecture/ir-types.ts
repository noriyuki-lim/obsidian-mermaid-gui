export type ArchEdgeDirection = "T" | "B" | "L" | "R";
export type ArchArrow = "--" | "-->" | "<--" | "<-->";

export interface ArchGroup {
  type: "group";
  id: string;
  icon?: string;
  label?: string;
  parentGroup?: string;
}

export interface ArchService {
  type: "service";
  id: string;
  icon?: string;
  label?: string;
  group?: string;
}

export interface ArchJunction {
  type: "junction";
  id: string;
  group?: string;
}

export interface ArchEdge {
  type: "edge";
  fromId: string;
  fromDir: ArchEdgeDirection;
  arrow: ArchArrow;
  toDir: ArchEdgeDirection;
  toId: string;
}

export interface ArchRawItem {
  type: "raw";
  line: string;
}

export type ArchItem = ArchGroup | ArchService | ArchJunction | ArchEdge | ArchRawItem;

export interface ArchitectureIR {
  kind: "architecture-beta";
  items: ArchItem[];
}
