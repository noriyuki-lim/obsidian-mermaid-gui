const FENCE_OPEN = /^\s*```\s*mermaid\b/i;
const FENCE_CLOSE = /^\s*```\s*$/;

export interface FenceRange {
  lineStart: number;
  lineEnd: number;
}

/**
 * Scan `lines` for every fenced ```mermaid block and return the one whose
 * body (the lines strictly between the fences) matches `body` exactly, once
 * trailing blank lines are ignored. Returns null if zero or more-than-one
 * blocks match — an ambiguous match is exactly as useless as no match, since
 * we can't tell which one is "the" block without risking picking the wrong
 * one.
 *
 * Used by `src/obsidian/io.ts`'s `writeBlockBack` as a fallback when the
 * recorded line numbers no longer point at a valid fence pair: Obsidian's
 * Reading-view `ctx.getSectionInfo(el)` has been observed to return
 * stale/incorrect line numbers on large notes with many similar fenced
 * blocks (confirmed: the same save that fails via the Reading-view "Edit"
 * button succeeds via the "Edit current Mermaid block" command, which
 * re-scans the live editor directly instead of trusting cached section
 * info). Re-locating by content recovers from that instead of just
 * refusing to save.
 */
export const findMatchingMermaidBlock = (lines: string[], body: string): FenceRange | null => {
  const target = body.replace(/\n+$/, "");
  const matches: FenceRange[] = [];
  let openIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (openIdx === -1) {
      if (FENCE_OPEN.test(lines[i])) openIdx = i;
    } else if (FENCE_CLOSE.test(lines[i])) {
      const inner = lines.slice(openIdx + 1, i).join("\n");
      if (inner === target) matches.push({ lineStart: openIdx, lineEnd: i });
      openIdx = -1;
    }
  }
  return matches.length === 1 ? matches[0] : null;
};

/**
 * Given a *known-correct* opening fence at `openLineIdx`, find the next
 * closing-fence line after it. Mermaid/code fences don't nest, so the next
 * "```" line after a confirmed-correct opening one must be this block's own
 * closing fence — no content comparison needed, unlike
 * `findMatchingMermaidBlock`, so it can't be foiled by whitespace/newline
 * differences between the recorded body and the file's current bytes.
 *
 * This is the recovery that actually matters in practice: the observed
 * failure mode is specifically `lineStart` staying correct while `lineEnd`
 * (from Obsidian's `ctx.getSectionInfo(el)`) drifts — never the reverse.
 * Returns null if no closing fence follows (a genuinely unterminated block).
 */
export const findNextClosingFence = (lines: string[], openLineIdx: number): number | null => {
  for (let i = openLineIdx + 1; i < lines.length; i++) {
    if (FENCE_CLOSE.test(lines[i])) return i;
  }
  return null;
};
