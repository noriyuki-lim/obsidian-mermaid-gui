import type { DiagramKind } from "../diagram-kind";

export interface ParseSuccess<T> {
  ok: true;
  ir: T;
  warnings: string[];
}

export interface ParseFailure {
  ok: false;
  message: string;
  line?: number;
}

export type ParseOutcome<T> = ParseSuccess<T> | ParseFailure;

/**
 * Per-diagram-kind adapter. Encapsulates parse/generate for a single kind
 * so the core orchestration layer stays kind-agnostic.
 *
 * `supportsGui` signals whether a dedicated GUI panel exists for this kind.
 * When false, MermaidEditor falls back to SourceOnlyEditor automatically.
 */
export interface DiagramAdapter<TIR = unknown> {
  kind: DiagramKind;
  supportsGui: boolean;
  parse: (source: string) => ParseOutcome<TIR>;
  generate: (ir: TIR) => string;
}
