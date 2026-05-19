export type NotePosition = "right of" | "left of";

/**
 * An explicit state declaration.
 *   state "description" as name   → { name, description }
 *   state name <<fork>>            → { name, annotation: "fork" }
 */
export interface StateDecl {
  type: "state";
  name: string;
  description?: string;
  annotation?: string;
}

/** A text description attached to a state: `StateName : description text`. */
export interface StateDescItem {
  type: "state-desc";
  name: string;
  description: string;
}

/** A transition between two states. `from`/`to` may be "[*]". */
export interface TransitionItem {
  type: "transition";
  from: string;
  to: string;
  label?: string;
}

/** A note anchored to a state (single-line or multi-line, normalised to one string). */
export interface StateNote {
  type: "note";
  position: NotePosition;
  state: string;
  text: string;
}

/** Any line the parser could not interpret, including composite state blocks. */
export interface RawItem {
  type: "raw";
  line: string;
}

export type StateDiagramItem =
  | StateDecl
  | StateDescItem
  | TransitionItem
  | StateNote
  | RawItem;

export interface StateDiagramIR {
  kind: "stateDiagram-v2";
  items: StateDiagramItem[];
}
