import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

/**
 * Owns a single React 18 root tied to a host DOM node and ensures it is
 * unmounted when the host is torn down. Each Obsidian Modal / view / inline
 * widget creates its own ReactHost so that several editors can coexist on a
 * single note without leaking state between them (plugin spec §6.3).
 */
export class ReactHost {
  private root: Root | null = null;

  constructor(private readonly container: HTMLElement) {}

  render(node: ReactNode): void {
    if (!this.root) this.root = createRoot(this.container);
    this.root.render(node);
  }

  unmount(): void {
    if (!this.root) return;
    const r = this.root;
    this.root = null;
    // Defer to avoid the React 18 warning about unmounting from inside another
    // commit phase (e.g., Modal.onClose can fire while React is still flushing).
    queueMicrotask(() => r.unmount());
  }
}
