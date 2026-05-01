import { App, TFile } from "obsidian";

/** Subset of `MarkdownPostProcessorContext.getSectionInfo` we rely on. */
export interface SectionInfo {
  text: string;
  lineStart: number;
  lineEnd: number;
}

const FENCE_OPEN = /^\s*```\s*mermaid\b/;
const FENCE_CLOSE = /^\s*```\s*$/;

/**
 * Replace exactly the lines between the opening and closing ```mermaid fences
 * with `newSource`, leaving every other line of the note untouched.
 *
 * Validates that the fence signatures still match before writing — if the user
 * edited the note since the modal opened and the fence has moved, we abort
 * rather than risk corrupting the file.
 */
export const writeBlockBack = async (
  app: App,
  sourcePath: string,
  info: SectionInfo,
  newSource: string,
): Promise<void> => {
  const file = app.vault.getAbstractFileByPath(sourcePath);
  if (!(file instanceof TFile)) {
    throw new Error(`File not found in vault: ${sourcePath}`);
  }
  const cur = await app.vault.read(file);
  const lines = cur.split("\n");
  const fenceLine = lines[info.lineStart];
  const closeLine = lines[info.lineEnd];
  if (!fenceLine || !FENCE_OPEN.test(fenceLine)) {
    throw new Error(
      "Opening fence has moved since the editor opened — aborting save to avoid corrupting the note.",
    );
  }
  if (!closeLine || !FENCE_CLOSE.test(closeLine)) {
    throw new Error(
      "Closing fence has moved since the editor opened — aborting save to avoid corrupting the note.",
    );
  }
  const body = newSource.replace(/\n+$/, "").split("\n");
  const out = [
    ...lines.slice(0, info.lineStart + 1),
    ...body,
    ...lines.slice(info.lineEnd),
  ].join("\n");
  await app.vault.modify(file, out);
};
