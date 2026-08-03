import { sanitizeHTMLToDom } from "obsidian";

declare global {
  interface Window {
    // Undocumented global Obsidian happens to expose (verified at runtime via
    // `typeof window.DOMPurify === "function"`). Not part of the public
    // Obsidian API — guard every use and fall back if it's ever absent.
    DOMPurify?: {
      sanitize(dirty: string, config?: Record<string, unknown>): unknown;
    };
  }
}

/**
 * Obsidian's `sanitizeHTMLToDom` is a generic sanitizer tuned for arbitrary
 * plugin-built HTML — it doesn't know Mermaid's SVG shape, so it strips
 * constructs Mermaid actually needs: the `<style>` block that carries all
 * theme coloring, and `<foreignObject>` (DOMPurify forbids its *contents* by
 * default, even when the tag itself is allowed) which Mermaid uses to render
 * node/edge labels as HTML. Losing either is exactly the "diagrams turn
 * black in Reading View" / "labels vanish" bug (GitHub #1, #2).
 *
 * Fix: sanitize with the same DOMPurify instance Obsidian already loads
 * (`window.DOMPurify`), but with a config scoped to what Mermaid actually
 * emits — the `svg`/`svgFilters` profiles plus the `html` profile (for the
 * div/span markup inside `<foreignObject>` labels) — instead of Obsidian's
 * generic HTML allowlist. `<script>` tags, event-handler attributes, and
 * `javascript:` URLs are still stripped by DOMPurify itself; this only
 * widens which *safe* SVG/HTML constructs survive. The one part of this SVG
 * that is genuinely user-authored — label text inside `<foreignObject>` —
 * still goes through DOMPurify's own sanitization, so this doesn't reopen
 * the raw-HTML-injection risk `sanitizeHTMLToDom` was added for (backlog:
 * "Address Obsidian plugin review findings").
 *
 * Falls back to `sanitizeHTMLToDom` if `window.DOMPurify` is ever
 * unavailable (e.g. a future Obsidian version stops exposing it) — same
 * degraded-but-safe behaviour as before this fix.
 */
const MERMAID_SVG_PURIFY_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true, html: true },
  ADD_TAGS: ["foreignobject"],
  // DOMPurify's svg profile doesn't allowlist `dominant-baseline`. Mermaid's
  // quadrantChart (and others) position every <text> at (0,0) and rely on
  // dominant-baseline="hanging" + a transform to place it — drop the
  // attribute and every label shifts by a line-height, colliding with
  // points/dividers/other labels.
  ADD_ATTR: ["dominant-baseline"],
  FORBID_CONTENTS: [],
  RETURN_DOM_FRAGMENT: true,
};

export const sanitizeMermaidSvg = (svg: string): DocumentFragment => {
  const purify = window.DOMPurify;
  if (!purify) return sanitizeHTMLToDom(svg);
  const clean = purify.sanitize(svg, MERMAID_SVG_PURIFY_CONFIG);
  return clean instanceof DocumentFragment ? clean : sanitizeHTMLToDom(svg);
};
