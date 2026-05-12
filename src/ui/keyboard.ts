type KeyboardShortcutTarget = EventTarget & {
  tagName?: string;
  isContentEditable?: boolean;
};

type KeyboardShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "target"
>;

export const isEditableShortcutTarget = (target: EventTarget | null): boolean => {
  const element = target as KeyboardShortcutTarget | null;
  const tag = element?.tagName?.toUpperCase();
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    element?.isContentEditable === true
  );
};

export const shouldRemoveSelectionFromKey = (event: KeyboardShortcutEvent): boolean => {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key !== "Delete" && event.key !== "Backspace") return false;
  return !isEditableShortcutTarget(event.target);
};
