import type { DiagramKind } from "../diagram-kind";
import type { DiagramAdapter } from "./types";
import { flowchartAdapter } from "./flowchart";
import { sequenceAdapter } from "./sequence";
import { classAdapter } from "./class";
import { stateAdapter } from "./state";

export type { DiagramAdapter, ParseOutcome, ParseSuccess, ParseFailure } from "./types";

const registry = new Map<DiagramKind, DiagramAdapter>([
  ["flowchart", flowchartAdapter],
  ["sequenceDiagram", sequenceAdapter],
  ["classDiagram", classAdapter],
  ["stateDiagram-v2", stateAdapter],
  ["stateDiagram", stateAdapter],
]);

/** Returns the adapter for `kind`, or `null` if no adapter is registered. */
export const getAdapter = (kind: DiagramKind): DiagramAdapter | null =>
  registry.get(kind) ?? null;
