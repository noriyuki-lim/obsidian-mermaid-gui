export interface BlockColumnsDirective {
  type: "columns";
  count: string; // numeric or "auto"
}

export interface BlockNode {
  type: "block";
  id: string;
  /** Raw label text inside the brackets, without quotes. Empty when label is missing. */
  label?: string;
  /** Bracket shape: `[`, `(`, `((`, `[(`, `>` etc. Captured to preserve shape. */
  shapeOpen?: string;
  shapeClose?: string;
  span?: number;
}

export interface BlockSpace {
  type: "space";
  span?: number;
}

export interface BlockRawItem {
  type: "raw";
  line: string;
}

export type BlockItem = BlockColumnsDirective | BlockNode | BlockSpace | BlockRawItem;

export interface BlockIR {
  kind: "block-beta";
  items: BlockItem[];
}
