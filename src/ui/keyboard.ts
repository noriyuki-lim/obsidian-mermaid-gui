import type { KeyboardEvent as ReactKeyboardEvent } from "react";

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

/**
 * Attach as `onKeyDown` on a plain, live-bound form field — one with no
 * separate draft/editing state to revert (value flows straight to IR via
 * onChange). `EditorModal`'s `close()` override refuses to close the modal
 * while an editable element has focus, so it can hand Escape to that
 * field's own cancel logic instead of the modal swallowing it. A field with
 * no cancel logic of its own would otherwise leave Escape doing *nothing at
 * all* — this makes it blur instead, so the field gives up focus and the
 * next Escape reaches the modal normally.
 */
export const blurOnEscape = (event: ReactKeyboardEvent<HTMLElement>): void => {
  if (event.key === "Escape") event.currentTarget.blur();
};

/**
 * Capture-phase Escape handler meant for a whole editor's root/shell
 * element. Most editors' form fields are plain and live-bound (value flows
 * straight to IR via onChange) with no draft/editing state of their own to
 * cancel — so with nothing to cancel, and `EditorModal`'s `close()`
 * override deferring to whichever field is focused, Escape would otherwise
 * do *nothing at all* while one of them has focus. Blurring here (capture
 * phase, so it always runs before the target's own bubble-phase onKeyDown,
 * if any) hands focus back so the next Escape reaches the modal normally.
 * Draft-gated inputs that already implement their own Escape-cancel logic
 * still run their own handler right after this — blurring first doesn't
 * interfere, since they're about to unmount anyway.
 */
export const blurFocusedEditableOnEscape = (event: ReactKeyboardEvent<HTMLElement>): void => {
  if (event.key !== "Escape") return;
  const target = event.target as HTMLElement | null;
  if (target && isEditableShortcutTarget(target)) target.blur();
};

export const shouldRemoveSelectionFromKey = (event: KeyboardShortcutEvent): boolean => {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key !== "Delete" && event.key !== "Backspace") return false;
  return !isEditableShortcutTarget(event.target);
};
