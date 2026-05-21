export interface ErAttribute {
  type: string;
  name: string;
  keys: string[];    // "PK" | "FK" | "UK"
  comment?: string;
}

export interface ErEntity {
  name: string;
  attributes: ErAttribute[];
}

export type ErLineStyle = "--" | "..";

export interface ErRelationship {
  type: "relationship";
  leftEntity: string;
  leftCard: string;
  lineStyle: ErLineStyle;
  rightCard: string;
  rightEntity: string;
  label: string;
}

export interface ErRawItem {
  type: "raw";
  line: string;
}

export type ErItem = ErRelationship | ErRawItem;

export interface ErDiagramIR {
  kind: "erDiagram";
  entities: ErEntity[];
  items: ErItem[];
}
