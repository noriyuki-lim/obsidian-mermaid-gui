import {
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  Notice,
  Plugin,
} from "obsidian";
import { EditorModal } from "./EditorModal";
import { writeBlockBack } from "./io";
import { exportSvgToVault } from "./svgExport";
import { renderMermaidThemed } from "./mermaidRender";

/**
 * Decorate a single ```mermaid code block: render the diagram via Obsidian's
 * bundled mermaid runtime and overlay an Edit button that opens the GUI modal.
 *
 * Each block gets its own MarkdownRenderChild so unmounting on note close /
 * scroll-out happens through the Obsidian-managed lifecycle (plugin spec §6.3).
 */
export const mountMermaidBlock = (
  plugin: Plugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
): void => {
  const child = new MarkdownRenderChild(el);
  ctx.addChild(child);

  el.empty();
  el.addClass("mge-block");

  const preview = el.createDiv({ cls: "mge-preview" });
  void renderPreview(source, preview);

  const editBtn = el.createEl("button", { cls: "mge-edit-btn", text: "Edit" });
  editBtn.setAttribute("aria-label", "Edit Mermaid block in GUI");
  editBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    openEditor(plugin, source, ctx, el);
  });
};

const renderPreview = async (source: string, target: HTMLElement): Promise<void> => {
  try {
    target.innerHTML = await renderMermaidThemed(source);
  } catch (err) {
    target.empty();
    target.createDiv({
      cls: "mge-preview-error",
      text: `Mermaid render error: ${(err as Error).message}`,
    });
    target.createEl("pre", { text: source });
  }
};

const openEditor = (
  plugin: Plugin,
  source: string,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
): void => {
  const info = ctx.getSectionInfo(el);
  if (!info) {
    new Notice(
      "Could not locate this Mermaid block in the file. Try saving the note and reopening it.",
    );
    return;
  }
  new EditorModal(plugin.app, source, {
    onSave: async (newSource) => {
      await writeBlockBack(plugin.app, ctx.sourcePath, info, newSource);
    },
    onExportSvg: async (src) => {
      await exportSvgToVault(plugin.app, ctx.sourcePath, src);
    },
  }).open();
};
