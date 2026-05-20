import type { DiagramKind } from "../diagram-kind";
import type { DiagramAdapter } from "./types";
import { flowchartAdapter } from "./flowchart";
import { sequenceAdapter } from "./sequence";
import { classAdapter } from "./class";
import { stateAdapter } from "./state";
import { pieAdapter } from "./pie";
import { sankeyAdapter } from "./sankey";
import { quadrantAdapter } from "./quadrant";
import { xychartAdapter } from "./xychart";
import { radarAdapter } from "./radar";

export type { DiagramAdapter, ParseOutcome, ParseSuccess, ParseFailure } from "./types";

// Each adapter is parameterised by its own IR type. The registry erases that
// parameter to `unknown` so consumers go through `parse → generate` round-trip
// without leaking per-kind types. Casts are safe because the adapter contract
// itself guarantees the parse/generate pair operates on its own IR shape.
const registry = new Map<DiagramKind, DiagramAdapter>([
  ["flowchart", flowchartAdapter as DiagramAdapter],
  ["sequenceDiagram", sequenceAdapter as DiagramAdapter],
  ["classDiagram", classAdapter as DiagramAdapter],
  ["stateDiagram-v2", stateAdapter as DiagramAdapter],
  ["stateDiagram", stateAdapter as DiagramAdapter],
  ["pie", pieAdapter as DiagramAdapter],
  ["sankey-beta", sankeyAdapter as DiagramAdapter],
  ["quadrantChart", quadrantAdapter as DiagramAdapter],
  ["xychart-beta", xychartAdapter as DiagramAdapter],
  ["radar-beta", radarAdapter as DiagramAdapter],
]);

/** Returns the adapter for `kind`, or `null` if no adapter is registered. */
export const getAdapter = (kind: DiagramKind): DiagramAdapter | null =>
  registry.get(kind) ?? null;
