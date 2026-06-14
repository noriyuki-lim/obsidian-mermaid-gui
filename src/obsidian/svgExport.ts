import { App, Notice, TFile, loadMermaid, normalizePath } from "obsidian";
import { stripGuiComments } from "../core";

const sanitize = (s: string): string => s.replace(/[\\/:*?"<>|]/g, "_");

/** `YYYY-MM-DDTHH-mm-ss` in Tokyo time, for filename stamps. */
const tokyoStamp = (date: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  // en-CA renders midnight as "24"; normalise to "00".
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}-${get("minute")}-${get("second")}`;
};

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
    const result = await mermaid.render(id, stripGuiComments(mermaidSource));
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
  const stamp = tokyoStamp(new Date());
  const fileName = sanitize(`${note.basename}-mermaid-${stamp}.svg`);
  const filePath = normalizePath(folder ? `${folder}/${fileName}` : fileName);
  await app.vault.adapter.write(filePath, svg);
  new Notice(`SVG saved → ${filePath}`);
};
