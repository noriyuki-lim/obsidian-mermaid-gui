export interface PieSliceItem {
  type: "slice";
  label: string;
  value: number;
}

export interface PieRawItem {
  type: "raw";
  line: string;
}

export type PieItem = PieSliceItem | PieRawItem;

export interface PieIR {
  kind: "pie";
  showData: boolean;
  title?: string;
  items: PieItem[];
}
