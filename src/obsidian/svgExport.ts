import { App, Notice, TFile, loadMermaid, normalizePath } from "obsidian";

const sanitize = (s: string): string => s.replace(/[\\/:*?"<>|]/g, "_");

/**
 * Render the given Mermaid source to SVG using Obsidian's bundled mermaid
 * runtime, then write the file next to the source note as a vault attachment.
 *
 * MVP keeps the destination predictable (sibling of the note); honouring
 * Obsidian's per-vault attachment settings can come later without breaking
 * existing exports.
 */
export const exportSvgToVault = async (
  app: App,
  sourceNotePath: string,
  mermaidSource: string,
): Promise<void> => {
  let svg: string;
  try {
    const mermaid = await loadMermaid();
    const id = `mge-export-${Date.now().toString(36)}`;
    const result = await mermaid.render(id, mermaidSource);
    svg = result.svg;
  } catch (err) {
    new Notice(`SVG export failed: ${(err as Error).message}`);
    return;
  }

  const note = app.vault.getAbstractFileByPath(sourceNotePath);
  if (!(note instanceof TFile)) {
    new Notice("Cannot determine source note for SVG export.");
    return;
  }
  const folder = note.parent?.path ?? "";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = sanitize(`${note.basename}-mermaid-${stamp}.svg`);
  const filePath = normalizePath(folder ? `${folder}/${fileName}` : fileName);
  await app.vault.adapter.write(filePath, svg);
  new Notice(`SVG saved → ${filePath}`);
};
