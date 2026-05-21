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
import { ganttAdapter } from "./gantt";
import { timelineAdapter } from "./timeline";
import { erAdapter } from "./er";
import { mindmapAdapter } from "./mindmap";
import { treemapAdapter } from "./treemap";
import { vennAdapter } from "./venn";
import { journeyAdapter } from "./journey";
import { architectureAdapter } from "./architecture";
import { blockAdapter } from "./block";

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
  ["gantt", ganttAdapter as DiagramAdapter],
  ["timeline", timelineAdapter as DiagramAdapter],
  ["erDiagram", erAdapter as DiagramAdapter],
  ["mindmap", mindmapAdapter as DiagramAdapter],
  ["treemap-beta", treemapAdapter as DiagramAdapter],
  ["venn-beta", vennAdapter as DiagramAdapter],
  ["journey", journeyAdapter as DiagramAdapter],
  ["architecture-beta", architectureAdapter as DiagramAdapter],
  ["block-beta", blockAdapter as DiagramAdapter],
]);

/** Returns the adapter for `kind`, or `null` if no adapter is registered. */
export const getAdapter = (kind: DiagramKind): DiagramAdapter | null =>
  registry.get(kind) ?? null;
