import { Editor, Notice, Plugin, TFile } from "obsidian";
import { EditorModal } from "./EditorModal";
import { writeBlockBack, type SectionInfo } from "./io";
import { exportSvgToVault } from "./svgExport";

// Allow `\b` rather than `\s*$` so we tolerate trailing tokens like
// `\`\`\`mermaid {init: {...}}` that some flavours of Mermaid permit.
const FENCE_OPEN = /^\s*```\s*mermaid\b/i;
const FENCE_CLOSE = /^\s*```\s*$/;

export interface MermaidBlock extends SectionInfo {
  source: string;
}

interface BlockRange {
  open: number;
  close: number;
}

const collectBlocks = (editor: Editor): BlockRange[] => {
  const out: BlockRange[] = [];
  const total = editor.lineCount();
  let openIdx = -1;
  for (let i = 0; i < total; i++) {
    const l = editor.getLine(i);
    if (openIdx === -1) {
      if (FENCE_OPEN.test(l)) openIdx = i;
    } else if (FENCE_CLOSE.test(l)) {
      out.push({ open: openIdx, close: i });
      openIdx = -1;
    }
  }
  return out;
};

const readBlock = (editor: Editor, range: BlockRange): MermaidBlock => {
  const body: string[] = [];
  for (let i = range.open + 1; i < range.close; i++) body.push(editor.getLine(i));
  return {
    source: body.join("\n"),
    text: editor.getValue(),
    lineStart: range.open,
    lineEnd: range.close,
  };
};

/**
 * Locate the ```mermaid block surrounding the editor cursor.
 *
 * In Live Preview the rendered widget can leave the editor's logical cursor
 * just outside the fences when the user "clicks the diagram", so in addition
 * to a strict containment check we fall back to the nearest block within a
 * small distance — clicking the rendered diagram should still pick the right
 * block. Used by the "Edit current Mermaid block" command.
 */
export const findMermaidBlockAtCursor = (editor: Editor): MermaidBlock | null => {
  const cursor = editor.getCursor();
  const blocks = collectBlocks(editor);
  if (blocks.length === 0) return null;

  // 1) Cursor is on a line within (or on) the fences.
  for (const b of blocks) {
    if (cursor.line >= b.open && cursor.line <= b.close) return readBlock(editor, b);
  }
  // 2) Live-Preview-friendly fallback: nearest block within 2 lines.
  let best: BlockRange | null = null;
  let bestDist = Infinity;
  for (const b of blocks) {
    const dist = Math.min(
      Math.abs(cursor.line - b.open),
      Math.abs(cursor.line - b.close),
    );
    if (dist < bestDist) {
      bestDist = dist;
      best = b;
    }
  }
  if (best && bestDist <= 2) return readBlock(editor, best);
  return null;
};

export const openModalForBlock = (
  plugin: Plugin,
  file: TFile | null,
  block: MermaidBlock,
): void => {
  if (!file) {
    new Notice("Cannot edit Mermaid block — no active file.");
    return;
  }
  new EditorModal(plugin.app, block.source, {
    onSave: async (newSource) => {
      await writeBlockBack(plugin.app, file.path, block, newSource);
    },
    onExportSvg: async (src) => {
      await exportSvgToVault(plugin.app, file.path, src);
    },
  }).open();
};
