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
  /** GUI-only convenience label (e.g. "Revenue" instead of "Series 1"),
   *  persisted as a trailing `%% gui:seriesTitle ...` comment on the same
   *  line since real xychart-beta syntax has no per-series name field. */
  title?: string;
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
  /** `%%{init}%%`/comment lines found before the header line that the parser
   *  doesn't understand (i.e. not the single-purpose orientation directive it
   *  recognizes) — kept verbatim and re-emitted immediately before the header. */
  leadingRawLines: string[];
  /** Per-series color override, positional by declaration order across
   *  bar+line (index i = the i-th `bar`/`line` item, same order as
   *  `colorClassFor` in the editor). Mirrors real xychart-beta's
   *  `plotColorPalette` theme variable — undefined/omitted means every
   *  series uses the editor's own theme-adaptive default colors, and nothing
   *  is written to the Mermaid source. */
  plotColorPalette?: string[];
}
