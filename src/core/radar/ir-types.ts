export interface RadarAxis {
  id: string;
  label?: string;
}

export interface RadarCurve {
  id: string;
  label?: string;
  values: number[];
}

export interface RadarOptions {
  showLegend?: boolean;
  max?: number;
  min?: number;
  graticule?: "circle" | "polygon";
  ticks?: number;
}

export interface RadarRawItem {
  type: "raw";
  line: string;
}

export interface RadarIR {
  kind: "radar-beta";
  title?: string;
  axes: RadarAxis[];
  curves: RadarCurve[];
  options: RadarOptions;
  /** Lines that were not understood (e.g. axis with key:value curve form). */
  rawLines: RadarRawItem[];
}
