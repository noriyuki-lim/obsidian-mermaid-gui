import { App, Modal, Notice } from "obsidian";
import { createElement } from "react";
import { ReactHost } from "./ReactHost";
import { MermaidEditor } from "../ui/MermaidEditor";
import { renderMermaidThemed } from "./mermaidRender";

export interface EditorModalHandlers {
  onSave: (newSource: string) => Promise<void> | void;
  onExportSvg?: (mermaidSource: string) => Promise<void> | void;
}

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
    this.contentEl.empty();
    this.contentEl.addClass("mge-modal-content");
    const mount = this.contentEl.createDiv({ cls: "mge-react-root" });
    this.host = new ReactHost(mount);
    this.host.render(
      createElement(MermaidEditor, {
        initialSource: this.initialSource,
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

const restoreModal = (modalEl: HTMLElement, state: ModalPlacementState): ModalRect | null => {
  if (!state.restore) return null;
  const restore = state.restore;
  applyModalRect(modalEl, restore.rect);
  state.placement = restore.placement;
  state.maximized = false;
  state.restore = null;
  return restore.rect;
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
      restoreModal(modalEl, state);
      return;
    }

    state.restore = { rect: modalRect(modalEl), placement: state.placement };
    applyModalRect(modalEl, maximizedRect());
    state.maximized = true;
  };

  const onMove = (e: MouseEvent) => {
    if (!drag) return;
    if (!drag.initialized) {
      const rect = state.maximized ? restoreModal(modalEl, state) ?? modalRect(modalEl) : modalRect(modalEl);
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
    const margin = 32;
    const w = modalEl.offsetWidth;
    const h = modalEl.offsetHeight;
    const maxLeft = window.innerWidth - margin;
    const maxTop = window.innerHeight - margin;
    const minLeft = margin - w;
    const minTop = 0;
    const left = Math.min(Math.max(drag.startLeft + dx, minLeft), maxLeft);
    const top = Math.min(Math.max(drag.startTop + dy, minTop), maxTop);
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
