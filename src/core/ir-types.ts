// Intermediate Representation for Mermaid flowchart graphs.
// Designed so that any subset that the parser cannot understand
// is preserved verbatim in `rawLines`, keeping round-trips loss-free.

export type Direction = "TD" | "TB" | "LR" | "RL" | "BT";

/** Mermaid's `flowchart.curve` render setting (d3-shape curve interpolator name). */
export type FlowchartCurve = "basis" | "linear" | "step" | "natural";

export type NodeShape =
  | "rect"
  | "round"
  | "stadium"
  | "subroutine"
  | "cylinder"
  | "circle"
  | "asymmetric"
  | "rhombus"
  | "hexagon"
  | "parallelogram"
  | "parallelogram_alt"
  | "trapezoid"
  | "trapezoid_alt";

export type EdgeStyle = "solid" | "dotted" | "thick";
export type EdgeHead = "none" | "arrow" | "circle" | "cross";
export type EdgeHandleId =
  | "s-top"
  | "s-right"
  | "s-bottom"
  | "s-left"
  | "t-top"
  | "t-right"
  | "t-bottom"
  | "t-left";

export interface IRNode {
  id: string;
  shape: NodeShape;
  label: string;
  /** id of the parent subgraph, if any */
  subgraph?: string | null;
  /** Background fill color (CSS hex like `#ff9999`). Emitted as Mermaid `style id fill:...`. */
  color?: string;
  /** Border / stroke color. Emitted as Mermaid `style id stroke:...`. */
  borderColor?: string;
}

export interface IREdge {
  /** stable id like `e_<source>_<target>_<index>` */
  id: string;
  source: string;
  target: string;
  style: EdgeStyle;
  head: EdgeHead;
  label?: string;
  /** Number of dashes/equals in the connector — preserved for round-trip stability */
  length: number;
  /** GUI-only anchor handles; Mermaid itself has no edge-side syntax. */
  sourceHandle?: EdgeHandleId;
  targetHandle?: EdgeHandleId;
}

export interface IRSubgraph {
  id: string;
  label?: string;
  /** id of containing subgraph, if any */
  parent?: string | null;
  /** optional direction declared inside the subgraph */
  direction?: Direction;
  /** Background fill color (CSS hex). Emitted as Mermaid `style id fill:...`. */
  color?: string;
  /** Border / stroke color. */
  borderColor?: string;
}

/** Per-node 2-D coordinates persisted to a sidecar JSON */
export type Positions = Record<string, { x: number; y: number }>;
export type SubgraphFrames = Record<string, { x: number; y: number; width: number; height: number }>;

export interface MermaidIR {
  direction: Direction;
  /** `flowchart.curve` render setting. Defaults to `"basis"` (Mermaid's own default). */
  curve: FlowchartCurve;
  nodes: IRNode[];
  edges: IREdge[];
  subgraphs: IRSubgraph[];
  /** Raw lines that the parser could not understand — kept verbatim and re-emitted */
  rawLines: string[];
  /** `%%{init}%%`/comment lines found before the header line that the parser
   *  doesn't understand (i.e. not the single-purpose curve directive it
   *  recognizes) — kept verbatim and re-emitted immediately before the header. */
  leadingRawLines: string[];
  positions: Positions;
  /** GUI-only subgraph bounds; Mermaid itself derives subgraph boxes from contents. */
  subgraphFrames: SubgraphFrames;
}

export const emptyIR = (direction: Direction = "TD", curve: FlowchartCurve = "basis"): MermaidIR => ({
  direction,
  curve,
  nodes: [],
  edges: [],
  subgraphs: [],
  rawLines: [],
  leadingRawLines: [],
  positions: {},
  subgraphFrames: {},
});
