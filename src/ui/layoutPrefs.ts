import type { DiagramKind } from "../core/diagram-kind";

// Panel size/position preferences are per-device UI convenience, not document
// content, so they persist in localStorage rather than through the Obsidian
// vault/plugin-data layer (same rationale as DiagramKindPicker's tile order).
// Keyed per diagram kind: widening the preview for one kind (e.g. gantt) must
// not affect another kind's (e.g. pie) saved layout.

export const loadNumber = (key: string, fallback: number): number => {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export const saveNumber = (key: string, value: number): void => {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignore quota / privacy-mode failures — persistence is non-essential.
  }
};

export const sideRatioKey = (diagramKind: DiagramKind): string =>
  `mge-editor-side-ratio:${diagramKind}`;

export const previewRatioKey = (diagramKind: DiagramKind): string =>
  `mge-editor-preview-ratio:${diagramKind}`;

export const FLOWCHART_TEXT_PANE_HEIGHT_KEY = "mge-flowchart-textpane-height";
