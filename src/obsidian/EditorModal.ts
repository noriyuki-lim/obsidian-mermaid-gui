import { App, Modal, Notice } from "obsidian";
import { createElement } from "react";
import { ReactHost } from "./ReactHost";
import { MermaidEditor } from "../ui/MermaidEditor";
import { renderMermaidThemed } from "./mermaidRender";
import { detectLocale } from "./locale";
import { isEditableShortcutTarget } from "../ui/keyboard";

export interface EditorModalHandlers {
  onSave: (newSource: string) => Promise<void> | void;
  onExportSvg?: (mermaidSource: string) => Promise<void> | void;
}

/**
 * `app.customCss.theme` is undocumented but widely relied upon by the
 * community-theme ecosystem (e.g. Style Settings) as the only way to read the
 * active community theme's name from a plugin. Used only to scope the Kanban
 * board's Transparent-theme border fix (see `.mge-theme-transparent` in
 * `styles.src.css`) — never throws, degrades to "no match" if the shape ever
 * changes.
 */
const isTransparentThemeActive = (app: App): boolean => {
  const theme = (app as unknown as { customCss?: { theme?: string } }).customCss?.theme;
  return typeof theme === "string" && theme.trim().toLowerCase() === "transparent";
};

/**
 * `isEditableShortcutTarget` only checks the element itself (tag name /
 * contentEditable) — it has no idea whether that element lives inside this
 * modal. `document.activeElement` is a *global*, page-wide property: opening
 * this Modal does not blur whatever had focus in the background (Obsidian
 * doesn't steal focus into the modal unless something inside it explicitly
 * calls `.focus()`), so the background note's CodeMirror content div
 * (`.cm-content`, always `contentEditable="true"`) commonly stays
 * `document.activeElement` for the modal's entire lifetime whenever the user
 * hasn't yet clicked into a text field inside our own React tree. Checking
 * `isEditableShortcutTarget(document.activeElement)` alone therefore matched
 * that unrelated background element and permanently blocked `close()` —
 * Save and Cancel both did nothing, with no error, because `document
 * .activeElement` never was and never became something outside the modal.
 * Reproduced via `obsidian eval` clicking Save/Cancel with dev tooling: both
 * left `.mge-modal` in the DOM every time, confirming this is unconditional,
 * not a rare focus race. The guard must only fire for editable elements that
 * are actually *inside* this modal.
 */
const isEditableWithinModal = (modalEl: HTMLElement): boolean => {
  const active = document.activeElement;
  return !!active && modalEl.contains(active) && isEditableShortcutTarget(active);
};

/**
 * Opens the React-based GUI editor inside an Obsidian Modal. The modal owns a
 * single ReactHost so React + the editor store live for the modal's lifetime;
 * `onClose` always tears them down.
 *
 * The modal is also draggable: grabbing the toolbar bar (anywhere except the
 * interactive controls inside it) lets the user move it around like a regular
 * floating window. The toolbar also toggles maximize/restore on double-click.
 */
export class EditorModal extends Modal {
  private host: ReactHost | null = null;
  private dragCleanup: (() => void) | null = null;
  private resizeCleanup: (() => void) | null = null;

  constructor(
    app: App,
    private readonly initialSource: string,
    private readonly handlers: EditorModalHandlers,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("mge-modal");
    if (isTransparentThemeActive(this.app)) {
      this.modalEl.addClass("mge-theme-transparent");
    }
    // The `close()` override below defers to whichever element currently has
    // focus, so Escape can hand off to that field's own cancel logic instead
    // of the modal swallowing it. That's fine for Escape specifically — the
    // keypress itself never moves focus — but it's wrong for clicks on
    // anything that ISN'T a text field, most importantly Obsidian's own
    // close ("X") button: unlike our own <button>s, it doesn't necessarily
    // shift focus away from a previously-focused input on click, so
    // `document.activeElement` can still point at that input at the moment
    // the X button's handler calls `this.close()`, and our guard would then
    // incorrectly block a completely unambiguous "please close" click. Blur
    // proactively on mousedown for anything that isn't itself an editable
    // field, so focus is already cleared before any such click's own handler
    // (including Obsidian's internal one) runs.
    this.modalEl.addEventListener(
      "mousedown",
      (evt) => {
        const target = evt.target as HTMLElement | null;
        if (target && !isEditableShortcutTarget(target) && isEditableWithinModal(this.modalEl)) {
          (document.activeElement as HTMLElement | null)?.blur();
        }
      },
      true,
    );
    // Obsidian's default Modal behaviour is to close unconditionally on
    // Escape. Every inline text field inside the editors (category/series
    // rename, xychart value edit, gantt task edit, table cells, ...) also
    // treats Escape as "cancel this edit", but the two aren't in conflict by
    // default — Obsidian's Escape-to-close still fires regardless, closing
    // the whole modal instead of just cancelling the inline edit. Registering
    // our own handler for the same key takes Escape over entirely for this
    // modal, so while an editable field is focused we return `false` (per
    // `KeymapEventListener`'s docs, this means "not handled by me" — let the
    // native keydown continue to that field's own onKeyDown, which does the
    // actual cancelling) instead of closing.
    this.scope.register([], "Escape", () => {
      if (isEditableWithinModal(this.modalEl)) return false;
      this.close();
    });
    this.contentEl.empty();
    this.contentEl.addClass("mge-modal-content");
    const mount = this.contentEl.createDiv({ cls: "mge-react-root" });
    this.host = new ReactHost(mount);
    this.host.render(
      createElement(MermaidEditor, {
        initialSource: this.initialSource,
        locale: detectLocale(),
        onSave: async (s: string) => {
          try {
            await this.handlers.onSave(s);
            this.close();
          } catch (err) {
            new Notice(`Save failed: ${(err as Error).message}`);
          }
        },
        onExportSvg: this.handlers.onExportSvg,
        onCancel: () => this.close(),
        onParseError: (msg: string) => {
          new Notice(`Parse error: ${msg}`);
        },
        renderMermaid: renderMermaidThemed,
      }),
    );
    const modalState = createModalPlacementState();
    this.dragCleanup = installToolbarDrag(this.modalEl, this.contentEl, modalState);
    this.resizeCleanup = installCornerResize(this.modalEl, modalState);
  }

  /**
   * Last-resort guard against Obsidian's Escape-to-close, layered on top of
   * the `scope.register` override in `onOpen()` above. Whatever internal
   * mechanism Obsidian actually uses to wire Escape to closing a Modal, it
   * has to end up calling this public `close()` method — so intercepting
   * *here* doesn't depend on guessing that mechanism's dispatch order the
   * way the `scope.register` attempt does. If Escape reaches here while an
   * inline edit field *inside this modal* still has focus (its own
   * onKeyDown hasn't blurred it yet — this runs synchronously in the same
   * keydown, before React gets a turn, when Obsidian's handler is registered
   * higher up in capture phase), swallow the close instead of tearing down
   * the whole editor. Save/Cancel always reach here via a button click
   * inside the modal, which browsers already move focus to before this
   * runs — so `isEditableWithinModal` sees the button (not editable), or
   * whatever unrelated element the *background* note editor still has
   * focused (not *within* this modal either) — neither blocks a real
   * save/cancel. (`isEditableWithinModal` scoping to `modalEl` matters here:
   * checking `document.activeElement` alone, with no containment check, used
   * to match the background note's always-`contentEditable` CodeMirror div
   * whenever the modal never stole focus into itself, permanently blocking
   * Save *and* Cancel with no error shown — see `isEditableWithinModal`'s
   * doc comment above.)
   */
  close(): void {
    if (isEditableWithinModal(this.modalEl)) return;
    super.close();
  }

  onClose(): void {
    this.dragCleanup?.();
    this.dragCleanup = null;
    this.resizeCleanup?.();
    this.resizeCleanup = null;
    this.host?.unmount();
    this.host = null;
    this.contentEl.empty();
  }
}

/**
 * Wire up "grab the toolbar to move the modal" behaviour. The mousedown
 * listener lives on the modal's contentEl rather than the toolbar itself
 * because React renders the toolbar asynchronously — delegating to a stable
 * parent avoids a race where we attach before the toolbar exists.
 */
type ModalPlacement = "centered" | "free";

interface ModalRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ModalPlacementState {
  placement: ModalPlacement;
  maximized: boolean;
  restore: { rect: ModalRect; placement: ModalPlacement } | null;
}

const createModalPlacementState = (): ModalPlacementState => ({
  placement: "centered",
  maximized: false,
  restore: null,
});

const modalRect = (modalEl: HTMLElement): ModalRect => {
  const rect = modalEl.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};

const applyModalRect = (modalEl: HTMLElement, rect: ModalRect): void => {
  modalEl.style.position = "fixed";
  modalEl.style.margin = "0";
  modalEl.style.left = `${rect.left}px`;
  modalEl.style.top = `${rect.top}px`;
  modalEl.style.width = `${rect.width}px`;
  modalEl.style.height = `${rect.height}px`;
};

const animateModalRect = (modalEl: HTMLElement, rect: ModalRect): void => {
  const from = modalRect(modalEl);
  modalEl.removeClass("mge-modal-animating");
  applyModalRect(modalEl, from);
  modalEl.getBoundingClientRect();

  requestAnimationFrame(() => {
    modalEl.addClass("mge-modal-animating");
    applyModalRect(modalEl, rect);
  });

  const clearAnimation = () => {
    modalEl.removeClass("mge-modal-animating");
    modalEl.removeEventListener("transitionend", clearAnimation);
  };
  modalEl.addEventListener("transitionend", clearAnimation);
  window.setTimeout(clearAnimation, 220);
};

const maximizedRect = (): ModalRect => {
  const width = Math.floor(window.innerWidth * 0.98);
  const height = Math.floor(window.innerHeight * 0.96);
  return {
    left: Math.floor((window.innerWidth - width) / 2),
    top: Math.floor((window.innerHeight - height) / 2),
    width,
    height,
  };
};

const isToolbarInteractiveTarget = (target: HTMLElement): boolean =>
  !!target.closest("button, input, select, textarea, label, a");

const restoreModal = (
  modalEl: HTMLElement,
  state: ModalPlacementState,
  opts?: { animate?: boolean },
): ModalRect | null => {
  if (!state.restore) return null;
  const restore = state.restore;
  if (opts?.animate) animateModalRect(modalEl, restore.rect);
  else applyModalRect(modalEl, restore.rect);
  state.placement = restore.placement;
  state.maximized = false;
  state.restore = null;
  return restore.rect;
};

const clampModalPosition = (left: number, top: number, width: number, height: number): { left: number; top: number } => {
  const margin = 32;
  return {
    left: Math.min(Math.max(left, margin - width), window.innerWidth - margin),
    top: Math.min(Math.max(top, 0), window.innerHeight - margin),
  };
};

const installToolbarDrag = (
  modalEl: HTMLElement,
  contentEl: HTMLElement,
  state: ModalPlacementState,
): (() => void) => {
  let drag:
    | {
        startX: number;
        startY: number;
        startLeft: number;
        startTop: number;
        initialized: boolean;
        maximizedGrab?: { xRatio: number; yOffset: number };
      }
    | null = null;

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const toolbar = target.closest(".mge-toolbar");
    if (!toolbar) return;
    // Don't start a drag when the user clicked an interactive control.
    if (isToolbarInteractiveTarget(target)) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = modalRect(modalEl);

    drag = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      initialized: false,
      maximizedGrab: state.maximized
        ? {
            xRatio: rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5,
            yOffset: e.clientY - rect.top,
          }
        : undefined,
    };
    document.body.classList.add("mge-dragging");
  };

  const onDoubleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const toolbar = target.closest(".mge-toolbar");
    if (!toolbar) return;
    if (isToolbarInteractiveTarget(target)) return;
    e.preventDefault();
    e.stopPropagation();

    if (state.maximized) {
      restoreModal(modalEl, state, { animate: true });
      return;
    }

    state.restore = { rect: modalRect(modalEl), placement: state.placement };
    animateModalRect(modalEl, maximizedRect());
    state.maximized = true;
  };

  const onMove = (e: MouseEvent) => {
    if (!drag) return;
    if (!drag.initialized) {
      let rect = state.maximized ? restoreModal(modalEl, state) ?? modalRect(modalEl) : modalRect(modalEl);
      if (drag.maximizedGrab) {
        const next = clampModalPosition(
          e.clientX - rect.width * drag.maximizedGrab.xRatio,
          e.clientY - drag.maximizedGrab.yOffset,
          rect.width,
          rect.height,
        );
        rect = { ...rect, ...next };
      }
      applyModalRect(modalEl, rect);
      state.placement = "free";
      drag.startX = e.clientX;
      drag.startY = e.clientY;
      drag.startLeft = rect.left;
      drag.startTop = rect.top;
      drag.initialized = true;
      return;
    }
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    // Keep the modal mostly on-screen — leave at least 32px peeking out so the
    // user can never lose it off the edge.
    const w = modalEl.offsetWidth;
    const h = modalEl.offsetHeight;
    const { left, top } = clampModalPosition(drag.startLeft + dx, drag.startTop + dy, w, h);
    modalEl.style.left = `${left}px`;
    modalEl.style.top = `${top}px`;
  };

  const onUp = () => {
    if (!drag) return;
    drag = null;
    document.body.classList.remove("mge-dragging");
  };

  contentEl.addEventListener("mousedown", onDown);
  contentEl.addEventListener("dblclick", onDoubleClick);
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);

  return () => {
    contentEl.removeEventListener("mousedown", onDown);
    contentEl.removeEventListener("dblclick", onDoubleClick);
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    document.body.classList.remove("mge-dragging");
  };
};

type Corner = "nw" | "ne" | "sw" | "se";

const MIN_W = 540;
const MIN_H = 360;

/**
 * Backlog #38 — add bespoke resize grippers at all four corners of the modal.
 *
 * The native `resize: both` only exposes the SE corner. Before the user moves
 * the modal, corner resize keeps the window center fixed. After toolbar drag,
 * the modal becomes a free-floating window and the dragged corner moves while
 * the opposite edge stays pinned.
 *
 * The four handles are appended directly to `modalEl` (above the React root)
 * and rely on event delegation: a single `pointerdown` listener inspects
 * `target.dataset.corner` to decide which edges move. Switching to
 * `position: fixed` mid-drag mirrors the toolbar drag flow so the modal
 * leaves Obsidian's flex-centering cleanly.
 */
const installCornerResize = (modalEl: HTMLElement, state: ModalPlacementState): (() => void) => {
  const corners: Corner[] = ["nw", "ne", "sw", "se"];
  const handles: HTMLElement[] = corners.map((corner) => {
    const el = modalEl.createDiv({ cls: `mge-resize-handle mge-resize-handle-${corner}` });
    el.dataset.corner = corner;
    return el;
  });

  type Drag = {
    corner: Corner;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startWidth: number;
    startHeight: number;
    centered: boolean;
  };
  let drag: Drag | null = null;

  const maxWidth = (): number => Math.floor(window.innerWidth * 0.98);
  const maxHeight = (): number => Math.floor(window.innerHeight * 0.96);

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    const corner = (target?.dataset.corner ?? null) as Corner | null;
    if (!corner) return;
    e.preventDefault();
    e.stopPropagation();

    const centered = state.placement === "centered" && !state.maximized;
    if (state.maximized) {
      state.maximized = false;
      state.restore = null;
      state.placement = "free";
    }
    const rect = modalEl.getBoundingClientRect();
    // Pin the modal at its current visual location before we start mutating
    // width/height — without this we'd fight Obsidian's flex centering.
    applyModalRect(modalEl, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });

    drag = {
      corner,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      startWidth: rect.width,
      startHeight: rect.height,
      centered,
    };
    document.body.classList.add("mge-resizing");
    target?.setPointerCapture?.(e.pointerId);
  };

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const maxW = maxWidth();
    const maxH = maxHeight();

    let { startLeft, startTop, startWidth, startHeight } = drag;
    let left = startLeft;
    let top = startTop;
    let width = startWidth;
    let height = startHeight;

    const movesLeft = drag.corner === "nw" || drag.corner === "sw";
    const movesTop = drag.corner === "nw" || drag.corner === "ne";

    if (drag.centered) {
      const centerX = startLeft + startWidth / 2;
      const centerY = startTop + startHeight / 2;
      width = clamp(startWidth + (movesLeft ? -2 * dx : 2 * dx), MIN_W, maxW);
      height = clamp(startHeight + (movesTop ? -2 * dy : 2 * dy), MIN_H, maxH);
      left = centerX - width / 2;
      top = centerY - height / 2;
    } else {
      if (movesLeft) {
        // Dragging the left edge: width shrinks/grows opposite to dx, and left
        // moves with the cursor. Clamp width first so left tracks the clamp.
        width = clamp(startWidth - dx, MIN_W, maxW);
        left = startLeft + (startWidth - width);
      } else {
        width = clamp(startWidth + dx, MIN_W, maxW);
      }
      if (movesTop) {
        height = clamp(startHeight - dy, MIN_H, maxH);
        top = startTop + (startHeight - height);
      } else {
        height = clamp(startHeight + dy, MIN_H, maxH);
      }
    }

    modalEl.style.left = `${left}px`;
    modalEl.style.top = `${top}px`;
    modalEl.style.width = `${width}px`;
    modalEl.style.height = `${height}px`;
  };

  const onUp = (e: PointerEvent) => {
    if (!drag) return;
    if (!drag.centered) state.placement = "free";
    drag = null;
    document.body.classList.remove("mge-resizing");
    const target = e.target as HTMLElement | null;
    target?.releasePointerCapture?.(e.pointerId);
  };

  // Use `pointerdown` on each handle so the toolbar's `mousedown` delegate on
  // contentEl never sees the event (the resize grippers live outside contentEl).
  handles.forEach((el) => el.addEventListener("pointerdown", onDown));
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);

  return () => {
    handles.forEach((el) => {
      el.removeEventListener("pointerdown", onDown);
      el.remove();
    });
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    document.body.classList.remove("mge-resizing");
  };
};
