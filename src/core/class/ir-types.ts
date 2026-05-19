export type Visibility = "+" | "-" | "#" | "~" | "";

/** Explicit class declaration (with optional annotation like <<interface>>). */
export interface ClassDef {
  type: "class";
  name: string;
  annotation?: string;
}

/**
 * A member (attribute or method) attached to a class.
 * `text` holds everything after the visibility prefix,
 * e.g. "int age", "swim()", "quack() String".
 */
export interface ClassMember {
  type: "member";
  className: string;
  visibility: Visibility;
  text: string;
  isMethod: boolean;
}

/** A directed (or undirected) relationship between two classes. */
export interface ClassRelation {
  type: "relation";
  from: string;
  to: string;
  /** Raw relation symbol, e.g. "<|--", "*--", "--". */
  relation: string;
  fromCardinality?: string;
  toCardinality?: string;
  label?: string;
}

/** A diagram-level or class-level note. */
export interface ClassNote {
  type: "note";
  text: string;
  forClass?: string;
}

/** Any line the parser could not interpret — preserved verbatim. */
export interface RawItem {
  type: "raw";
  line: string;
}

export type ClassDiagramItem =
  | ClassDef
  | ClassMember
  | ClassRelation
  | ClassNote
  | RawItem;

export interface ClassDiagramIR {
  kind: "classDiagram";
  items: ClassDiagramItem[];
}
