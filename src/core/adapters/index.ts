import type { DiagramKind } from "../diagram-kind";
import type { DiagramAdapter } from "./types";
import { flowchartAdapter } from "./flowchart";

export type { DiagramAdapter, ParseOutcome, ParseSuccess, ParseFailure } from "./types";

const registry = new Map<DiagramKind, DiagramAdapter>([
  ["flowchart", flowchartAdapter],
]);

/** Returns the adapter for `kind`, or `null` if no adapter is registered. */
export const getAdapter = (kind: DiagramKind): DiagramAdapter | null =>
  registry.get(kind) ?? null;
