export type GanttTaskStatus = "done" | "active" | "crit" | "milestone";

export interface GanttTask {
  type: "task";
  label: string;
  modifiers: GanttTaskStatus[];
  id?: string;
  start?: string;
  end?: string;
}

export interface GanttSection {
  type: "section";
  title: string;
}

export interface GanttRawItem {
  type: "raw";
  line: string;
}

export type GanttItem = GanttTask | GanttSection | GanttRawItem;

export interface GanttIR {
  kind: "gantt";
  title?: string;
  dateFormat?: string;
  axisFormat?: string;
  items: GanttItem[];
}
