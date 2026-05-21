import { loadMermaid } from "obsidian";
import { stripGuiComments } from "../core";

/**
 * Centralised Mermaid renderer used by the modal preview, the
 * `DiagramKindPicker` and the Reading-view post processor. Keeping a single
 * entry-point means theme detection stays consistent everywhere — backlog #37.
 *
 * Obsidian's `loadMermaid()` returns a shared singleton whose global config is
 * touched by Obsidian's own post-processing pipeline. Calling
 * `mermaid.initialize({ theme })` ourselves turned out to be unreliable — the
 * modal preview picked it up but the Reading-view render kept falling back to
 * `default`. We sidestep the global by **injecting a per-diagram `%%{init}%%`
 * directive into the source**, which Mermaid evaluates as the highest-priority
 * config for that single render regardless of the singleton's current state.
 */

type MermaidTheme = "default" | "dark";

const detectTheme = (): MermaidTheme => {
  if (typeof document === "undefined") return "default";
  return document.body.classList.contains("theme-dark") ? "dark" : "default";
};

/**
 * Prepend a `%%{init: ... }%%` directive so Mermaid applies the theme to this
 * one render only. The directive must come before any diagram syntax; existing
 * sources never start with their own `%%{init}%%` in our pipeline (the GUI
 * generators don't emit one), so blind prepend is safe.
 */
const withThemeDirective = (source: string, theme: MermaidTheme): string => {
  const directive = `%%{init: {"theme":"${theme}"}}%%`;
  return `${directive}\n${source}`;
};

export const renderMermaidThemed = async (source: string): Promise<string> => {
  const mermaid = await loadMermaid();
  const id = `mge-${Math.random().toString(36).slice(2, 9)}`;
  const themedSource = withThemeDirective(stripGuiComments(source), detectTheme());
  const result = await mermaid.render(id, themedSource);
  return result.svg;
};
