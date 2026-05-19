export type ArrowType = "solid-arrow" | "dotted-arrow";
export type NotePosition = "over" | "right of" | "left of";

export interface ParticipantItem {
  type: "participant";
  alias: string;
  label?: string;
}

export interface ActorItem {
  type: "actor";
  alias: string;
  label?: string;
}

export interface MessageItem {
  type: "message";
  from: string;
  to: string;
  arrow: ArrowType;
  text: string;
}

export interface NoteItem {
  type: "note";
  position: NotePosition;
  /** One participant (right of / left of) or two participants (over). */
  targets: string[];
  text: string;
}

export interface ActivationItem {
  type: "activation";
  participant: string;
  active: boolean;
}

export interface RawItem {
  type: "raw";
  line: string;
}

export type SequenceItem =
  | ParticipantItem
  | ActorItem
  | MessageItem
  | NoteItem
  | ActivationItem
  | RawItem;

export interface SequenceIR {
  kind: "sequenceDiagram";
  items: SequenceItem[];
}
