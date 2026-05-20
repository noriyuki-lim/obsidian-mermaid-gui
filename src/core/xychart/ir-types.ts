export type XYOrientation = "vertical" | "horizontal";
export type XYSeriesKind = "bar" | "line";

export type XYAxis =
  | { kind: "numeric"; title?: string; min: number; max: number }
  | { kind: "categorical"; title?: string; categories: string[] }
  | { kind: "label-only"; title: string };

export interface XYSeriesItem {
  type: "series";
  series: XYSeriesKind;
  values: number[];
}

export interface XYRawItem {
  type: "raw";
  line: string;
}

export type XYItem = XYSeriesItem | XYRawItem;

export interface XYChartIR {
  kind: "xychart-beta";
  orientation: XYOrientation;
  title?: string;
  xAxis?: XYAxis;
  yAxis?: XYAxis;
  items: XYItem[];
}
