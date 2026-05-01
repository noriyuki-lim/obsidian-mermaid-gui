import { App, Modal, Notice } from "obsidian";
import { createElement } from "react";
import { ReactHost } from "./ReactHost";
import { MermaidEditor } from "../ui/MermaidEditor";

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
 * floating window. Resizing is handled by the `resize: both` CSS rule.
 */
export class EditorModal extends Modal {
  private host: ReactHost | null = null;
  private dragCleanup: (() => void) | null = null;

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
      }),
    );
    this.dragCleanup = installToolbarDrag(this.modalEl, this.contentEl);
  }

  onClose(): void {
    this.dragCleanup?.();
    this.dragCleanup = null;
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
const installToolbarDrag = (modalEl: HTMLElement, contentEl: HTMLElement): (() => void) => {
  let drag:
    | {
        startX: number;
        startY: number;
        startLeft: number;
        startTop: number;
      }
    | null = null;

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const toolbar = target.closest(".mge-toolbar");
    if (!toolbar) return;
    // Don't start a drag when the user clicked an interactive control.
    if (target.closest("button, input, select, textarea, label, a")) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = modalEl.getBoundingClientRect();
    // Switch to fixed positioning anchored at the current visual location so
    // the modal stays put when we leave Obsidian's flex-centering behind.
    modalEl.style.position = "fixed";
    modalEl.style.margin = "0";
    modalEl.style.left = `${rect.left}px`;
    modalEl.style.top = `${rect.top}px`;

    drag = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };
    document.body.classList.add("mge-dragging");
  };

  const onMove = (e: MouseEvent) => {
    if (!drag) return;
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
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);

  return () => {
    contentEl.removeEventListener("mousedown", onDown);
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    document.body.classList.remove("mge-dragging");
  };
};
