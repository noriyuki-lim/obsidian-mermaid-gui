import type { DiagramAdapter } from "./types";
import type { TimelineIR } from "../timeline/ir-types";
import { parseTimeline } from "../timeline/parser";
import { generateTimeline } from "../timeline/generator";

export const timelineAdapter: DiagramAdapter<TimelineIR> = {
  kind: "timeline",
  supportsGui: true,
  parse: parseTimeline,
  generate: generateTimeline,
};
