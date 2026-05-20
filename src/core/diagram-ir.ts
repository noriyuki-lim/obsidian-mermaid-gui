import type { MermaidIR } from "./ir-types";
import type { SequenceIR } from "./sequence/ir-types";
import type { ClassDiagramIR } from "./class/ir-types";
import type { StateDiagramIR } from "./state/ir-types";
import type { PieIR } from "./pie/ir-types";
import type { SankeyIR } from "./sankey/ir-types";
import type { QuadrantIR } from "./quadrant/ir-types";
import type { XYChartIR } from "./xychart/ir-types";
import type { RadarIR } from "./radar/ir-types";

/**
 * Discriminated union of all per-kind intermediate representations.
 * Each kind owns its own IR shape; the `nodes`/`edges` model of MermaidIR
 * is never reused for sequence, class, state, or mindmap diagrams.
 *
 * When a new adapter is added, append its variant here and implement
 * the `parse`/`generate` pair in `src/core/adapters/<kind>.ts`.
 */
export type DiagramIR =
  | { kind: "flowchart"; ir: MermaidIR }
  | { kind: "sequenceDiagram"; ir: SequenceIR }
  | { kind: "classDiagram"; ir: ClassDiagramIR }
  | { kind: "stateDiagram-v2"; ir: StateDiagramIR }
  | { kind: "pie"; ir: PieIR }
  | { kind: "sankey-beta"; ir: SankeyIR }
  | { kind: "quadrantChart"; ir: QuadrantIR }
  | { kind: "xychart-beta"; ir: XYChartIR }
  | { kind: "radar-beta"; ir: RadarIR }
  | { kind: "unknown"; source: string };
