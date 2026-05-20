import { loadMermaid } from "obsidian";
import { stripGuiComments } from "../core";

/**
 * Centralised Mermaid renderer used by the modal preview, the
 * `DiagramKindPicker` and the Reading-view post processor. Keeping a single
 * entry-point means theme detection stays consistent everywhere — backlog #37.
 *
 * Strategy:
 *   - Detect Obsidian's active theme via `document.body.classList`.
 *   - Re-initialise Mermaid with `theme: 'dark' | 'default'` whenever the
 *     active theme flips, so SVG text colours follow Obsidian's light/dark
 *     setting instead of staying stuck on Mermaid's hard-coded defaults.
 *   - Strip the `%% gui:*` comments that the GUI persists so Mermaid only
 *     sees standards-compliant source.
 *
 * If a chart still leaves text unreadable on top of a custom-coloured node,
 * the next step would be a per-text luminance fix-up. Deferred until we see
 * a concrete failure.
 */

type MermaidTheme = "default" | "dark";

type MermaidLike = Awaited<ReturnType<typeof loadMermaid>>;

let appliedTheme: MermaidTheme | null = null;

const detectTheme = (): MermaidTheme => {
  if (typeof document === "undefined") return "default";
  return document.body.classList.contains("theme-dark") ? "dark" : "default";
};

const ensureTheme = (mermaid: MermaidLike): void => {
  const next = detectTheme();
  if (next === appliedTheme) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: next,
    securityLevel: "loose",
  });
  appliedTheme = next;
};

export const renderMermaidThemed = async (source: string): Promise<string> => {
  const mermaid = await loadMermaid();
  ensureTheme(mermaid);
  const id = `mge-${Math.random().toString(36).slice(2, 9)}`;
  const result = await mermaid.render(id, stripGuiComments(source));
  return result.svg;
};

/** Force the next render to re-`initialize`. Safe to call optimistically. */
export const resetMermaidTheme = (): void => {
  appliedTheme = null;
};
