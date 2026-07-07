import type { KanbanCard, KanbanColumn } from "../../core/kanban/ir-types";

let nextId = 0;
const registry = new WeakMap<object, string>();

/**
 * Stable per-object UI identity for kanban cards/columns, used as React keys
 * and for FLIP-animated drag reordering. Kanban IR objects don't carry a
 * guaranteed-unique id (`id` is optional and mirrors Mermaid's own
 * `id[Text]` syntax, often absent), so we mint one lazily keyed off object
 * identity instead. `KanbanEditor`'s mutators (`withColumn` / `moveCard` /
 * `moveColumn`) preserve untouched card/column object references across
 * edits, so a card keeps the same identity as it moves — it only gets a new
 * one if it's the object being directly edited (text/title change) or the
 * whole IR is replaced by a source re-parse, neither of which is a drag.
 */
export const identityKey = (obj: KanbanCard | KanbanColumn): string => {
  let key = registry.get(obj);
  if (!key) {
    key = `mge-kb-${nextId++}`;
    registry.set(obj, key);
  }
  return key;
};
