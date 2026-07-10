import { App, TFile } from "obsidian";
import { findMatchingMermaidBlock, findNextClosingFence } from "../core/fenceMatch";

/** Subset of `MarkdownPostProcessorContext.getSectionInfo` we rely on. */
export interface SectionInfo {
  text: string;
  lineStart: number;
  lineEnd: number;
}

const FENCE_OPEN = /^\s*```\s*mermaid\b/i;
const FENCE_CLOSE = /^\s*```\s*$/;

/**
 * Replace exactly the lines between the opening and closing ```mermaid fences
 * with `newSource`, leaving every other line of the note untouched.
 *
 * Validates that the fence signatures still match before writing, with two
 * recovery attempts if they don't (both only engage when validation fails —
 * they never change where a block that already validates is written):
 *
 * 1. Opening fence still valid, only the closing line drifted — this is the
 *    only shape actually observed in practice (Obsidian's Reading-view
 *    `ctx.getSectionInfo(el)` has been seen returning a stale `lineEnd` on
 *    large notes with many similar fenced blocks, while `lineStart` stayed
 *    correct). Since Mermaid/code fences don't nest, the next closing-fence
 *    line after a *confirmed-correct* opening line must be this block's own
 *    closing fence — so just scan forward for it. No content comparison
 *    involved, so it can't be foiled by whitespace/newline mismatches.
 * 2. Opening fence itself is wrong too, and `originalSource` (the exact body
 *    the editor was opened with) was supplied — full-file relocation by
 *    exact content match (`findMatchingMermaidBlock`). More fragile (any
 *    difference in the reconstructed body fails the match) but the only
 *    option left when we can't anchor on a known-good opening line.
 *
 * Only throws (aborting the save to avoid corrupting the file) if neither
 * recovery applies or succeeds.
 */
export const writeBlockBack = async (
  app: App,
  sourcePath: string,
  info: SectionInfo,
  newSource: string,
  originalSource?: string,
): Promise<void> => {
  const file = app.vault.getAbstractFileByPath(sourcePath);
  if (!(file instanceof TFile)) {
    throw new Error(`File not found in vault: ${sourcePath}`);
  }
  const cur = await app.vault.read(file);
  const lines = cur.split("\n");

  let { lineStart, lineEnd } = info;
  const openValid = () => !!lines[lineStart] && FENCE_OPEN.test(lines[lineStart]);
  const closeValid = () => !!lines[lineEnd] && FENCE_CLOSE.test(lines[lineEnd]);

  if (!openValid() && originalSource !== undefined) {
    const relocated = findMatchingMermaidBlock(lines, originalSource);
    if (relocated) {
      lineStart = relocated.lineStart;
      lineEnd = relocated.lineEnd;
    }
  } else if (openValid() && !closeValid()) {
    const nextClose = findNextClosingFence(lines, lineStart);
    if (nextClose !== null) lineEnd = nextClose;
  }

  if (!openValid()) {
    throw new Error(
      "Opening fence has moved since the editor opened — aborting save to avoid corrupting the note.",
    );
  }
  if (!closeValid()) {
    throw new Error(
      "Closing fence has moved since the editor opened — aborting save to avoid corrupting the note.",
    );
  }
  const body = newSource.replace(/\n+$/, "").split("\n");
  const out = [
    ...lines.slice(0, lineStart + 1),
    ...body,
    ...lines.slice(lineEnd),
  ].join("\n");
  await app.vault.modify(file, out);
};
