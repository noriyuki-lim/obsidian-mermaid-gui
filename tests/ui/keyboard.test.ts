import { describe, expect, it } from "vitest";
import { isEditableShortcutTarget, shouldRemoveSelectionFromKey } from "../../src/ui/keyboard";

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
});
