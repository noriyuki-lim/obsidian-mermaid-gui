export interface JourneyTask {
  type: "task";
  name: string;
  score: number;
  actors: string[];
}

export interface JourneySection {
  type: "section";
  title: string;
}

export interface JourneyRawItem {
  type: "raw";
  line: string;
}

export type JourneyItem = JourneyTask | JourneySection | JourneyRawItem;

export interface JourneyIR {
  kind: "journey";
  title?: string;
  items: JourneyItem[];
}
