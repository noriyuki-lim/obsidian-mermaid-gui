export interface TimelinePeriod {
  type: "period";
  label: string;
  events: string[];
}

export interface TimelineSection {
  type: "section";
  title: string;
}

export interface TimelineRawItem {
  type: "raw";
  line: string;
}

export type TimelineItem = TimelinePeriod | TimelineSection | TimelineRawItem;

export interface TimelineIR {
  kind: "timeline";
  title?: string;
  items: TimelineItem[];
}
