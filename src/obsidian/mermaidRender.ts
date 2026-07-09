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

// Matches only our own canonical curve directive (src/core/generator.ts),
// emitted as the source's first line whenever `ir.curve !== "basis"`.
const CURVE_DIRECTIVE_RE =
  /^%%\{init: \{"flowchart": \{"curve": "([a-z]+)"\}\}\}%%\r?\n/;

/**
 * Prepend a `%%{init: ... }%%` directive so Mermaid applies the theme to this
 * one render only. The directive must come before any diagram syntax, and
 * Mermaid only reliably honors a single `%%{init}%%` per diagram — a second,
 * separately stacked directive is silently ignored rather than merged. A
 * flowchart with a non-default `curve` already emits its own leading
 * `%%{init: {"flowchart": {"curve": ...}}}%%` line, so instead of stacking a
 * second directive on top (which would make the curve setting disappear from
 * the actual render — the theme directive was overwriting the curve one),
 * fold the curve into the same directive object.
 */
const withThemeDirective = (source: string, theme: MermaidTheme): string => {
  const curveMatch = CURVE_DIRECTIVE_RE.exec(source);
  if (curveMatch) {
    const rest = source.slice(curveMatch[0].length);
    const merged = `%%{init: {"theme":"${theme}","flowchart":{"curve":"${curveMatch[1]}"}}}%%`;
    return `${merged}\n${rest}`;
  }
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
