import { Editor, MarkdownFileInfo, MarkdownView, Notice, Plugin } from "obsidian";
import { mountMermaidBlock } from "./src/obsidian/postProcessor";
import { createMermaidEditorExtension } from "./src/obsidian/editorExtension";
import {
  findMermaidBlockAtCursor,
  openModalForBlock,
} from "./src/obsidian/commands";

export default class MermaidGuiPlugin extends Plugin {
  async onload(): Promise<void> {
    // Replace Obsidian's default rendering for ```mermaid``` fences so we can
    // overlay an Edit button without breaking the diagram preview.
    this.registerMarkdownCodeBlockProcessor("mermaid", (source, el, ctx) => {
      mountMermaidBlock(this, source, el, ctx);
    });
    this.registerEditorExtension(createMermaidEditorExtension(this));

    this.addCommand({
      id: "edit-current-mermaid",
      name: "Edit current Mermaid block",
      editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        const block = findMermaidBlockAtCursor(editor);
        if (!block) {
          new Notice("Cursor is not inside a `mermaid` block.");
          return;
        }
        const file = ctx instanceof MarkdownView ? ctx.file : ctx.file;
        openModalForBlock(this, file ?? null, block);
      },
    });
  }

  async onunload(): Promise<void> {
    // Per-block React roots are owned by MarkdownRenderChild instances, which
    // Obsidian unmounts automatically. Modals tear down their roots in onClose.
  }
}
