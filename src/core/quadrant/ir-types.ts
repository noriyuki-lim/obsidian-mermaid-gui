export interface QuadrantAxis {
  left: string;
  right?: string;
}

export interface QuadrantYAxis {
  bottom: string;
  top?: string;
}

export interface QuadrantPointItem {
  type: "point";
  name: string;
  x: number;
  y: number;
}

export interface QuadrantRawItem {
  type: "raw";
  line: string;
}

export type QuadrantItem = QuadrantPointItem | QuadrantRawItem;

export interface QuadrantIR {
  kind: "quadrantChart";
  title?: string;
  xAxis?: QuadrantAxis;
  yAxis?: QuadrantYAxis;
  /** Quadrant labels keyed by 1..4 (1=top right, 2=top left, 3=bottom left, 4=bottom right). */
  quadrants: { q1?: string; q2?: string; q3?: string; q4?: string };
  items: QuadrantItem[];
}
