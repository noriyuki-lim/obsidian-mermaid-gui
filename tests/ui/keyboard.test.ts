import { describe, expect, it, vi } from "vitest";
import {
  blurFocusedEditableOnEscape,
  blurOnEscape,
  isEditableShortcutTarget,
  shouldRemoveSelectionFromKey,
} from "../../src/ui/keyboard";

const target = (props: { tagName?: string; isContentEditable?: boolean }): EventTarget =>
  props as unknown as EventTarget;

const keyEvent = (
  patch: Partial<Parameters<typeof shouldRemoveSelectionFromKey>[0]>,
): Parameters<typeof shouldRemoveSelectionFromKey>[0] => ({
  altKey: false,
  ctrlKey: false,
  key: "Delete",
  metaKey: false,
  target: target({ tagName: "DIV" }),
  ...patch,
});

describe("keyboard shortcuts", () => {
  it("allows Delete and Backspace outside editable fields", () => {
    expect(shouldRemoveSelectionFromKey(keyEvent({ key: "Delete" }))).toBe(true);
    expect(shouldRemoveSelectionFromKey(keyEvent({ key: "Backspace" }))).toBe(true);
  });

  it("ignores deletion shortcuts in editable fields", () => {
    expect(shouldRemoveSelectionFromKey(keyEvent({ target: target({ tagName: "INPUT" }) }))).toBe(
      false,
    );
    expect(
      shouldRemoveSelectionFromKey(keyEvent({ target: target({ tagName: "TEXTAREA" }) })),
    ).toBe(false);
    expect(shouldRemoveSelectionFromKey(keyEvent({ target: target({ tagName: "SELECT" }) }))).toBe(
      false,
    );
    expect(
      shouldRemoveSelectionFromKey(
        keyEvent({ target: target({ tagName: "DIV", isContentEditable: true }) }),
      ),
    ).toBe(false);
  });

  it("ignores modified deletion shortcuts", () => {
    expect(shouldRemoveSelectionFromKey(keyEvent({ ctrlKey: true }))).toBe(false);
    expect(shouldRemoveSelectionFromKey(keyEvent({ metaKey: true }))).toBe(false);
    expect(shouldRemoveSelectionFromKey(keyEvent({ altKey: true }))).toBe(false);
  });

  it("detects editable shortcut targets directly", () => {
    expect(isEditableShortcutTarget(target({ tagName: "textarea" }))).toBe(true);
    expect(isEditableShortcutTarget(target({ tagName: "DIV" }))).toBe(false);
  });

  describe("blurOnEscape", () => {
    it("blurs the field on Escape", () => {
      const blur = vi.fn();
      blurOnEscape({ key: "Escape", currentTarget: { blur } } as never);
      expect(blur).toHaveBeenCalledOnce();
    });

    it("does nothing for other keys", () => {
      const blur = vi.fn();
      blurOnEscape({ key: "Enter", currentTarget: { blur } } as never);
      expect(blur).not.toHaveBeenCalled();
    });
  });

  describe("blurFocusedEditableOnEscape", () => {
    it("blurs an editable event.target on Escape", () => {
      const blur = vi.fn();
      blurFocusedEditableOnEscape({
        key: "Escape",
        target: { tagName: "INPUT", blur },
      } as never);
      expect(blur).toHaveBeenCalledOnce();
    });

    it("does not blur a non-editable target", () => {
      const blur = vi.fn();
      blurFocusedEditableOnEscape({
        key: "Escape",
        target: { tagName: "BUTTON", blur },
      } as never);
      expect(blur).not.toHaveBeenCalled();
    });

    it("does nothing for other keys", () => {
      const blur = vi.fn();
      blurFocusedEditableOnEscape({
        key: "Enter",
        target: { tagName: "INPUT", blur },
      } as never);
      expect(blur).not.toHaveBeenCalled();
    });
  });
});
