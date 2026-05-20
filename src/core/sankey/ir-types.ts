export interface SankeyLinkItem {
  type: "link";
  source: string;
  target: string;
  value: number;
}

export interface SankeyRawItem {
  type: "raw";
  line: string;
}

export type SankeyItem = SankeyLinkItem | SankeyRawItem;

export interface SankeyIR {
  kind: "sankey-beta";
  /** Whether the original source had a literal `source,target,value` header row. */
  hasHeaderRow: boolean;
  items: SankeyItem[];
}
