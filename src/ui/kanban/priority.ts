import { KANBAN_PRIORITIES, type KanbanPriority } from "../../core/kanban/meta";

/** Shared between `KanbanOptionsPanel` (the select) and `KanbanInteractivePreview`
 *  (the on-card badge) so the two never drift out of sync. */
export const PRIORITY_LABEL_KEY: Record<
  KanbanPriority,
  "priorityVeryHigh" | "priorityHigh" | "priorityLow" | "priorityVeryLow"
> = {
  "Very High": "priorityVeryHigh",
  High: "priorityHigh",
  Low: "priorityLow",
  "Very Low": "priorityVeryLow",
};

/** CSS class suffix for the priority-driven accent color — the card's left
 *  border is the only visual cue for priority (no separate badge/glyph). */
export const priorityColorSlug = (p: KanbanPriority): string => p.toLowerCase().replace(/\s+/g, "");

export { KANBAN_PRIORITIES };
export type { KanbanPriority };
