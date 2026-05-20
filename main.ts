import { Editor, MarkdownFileInfo, MarkdownView, Menu, Notice, Plugin } from "obsidian";
import { mountMermaidBlock } from "./src/obsidian/postProcessor";
import { createMermaidEditorExtension } from "./src/obsidian/editorExtension";
import {
  findMermaidBlockAtCursor,
  openModalForBlock,
  openModalForNewBlock,
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

    this.addCommand({
      id: "insert-new-mermaid",
      name: "Insert new Mermaid diagram (GUI)",
      editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        const file = ctx instanceof MarkdownView ? ctx.file : ctx.file;
        openModalForNewBlock(this, file ?? null, editor);
      },
    });

    // Right-click in the editor: if we're inside an existing mermaid block,
    // offer "Edit"; otherwise offer "Insert new". Both entry points share
    // EditorModal — the blank source variant lands on the kind picker.
    this.registerEvent(
      this.app.workspace.on(
        "editor-menu",
        (menu: Menu, editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
          const file = view instanceof MarkdownView ? view.file : view.file;
          const block = findMermaidBlockAtCursor(editor);
          if (block) {
            menu.addItem((item) =>
              item
                .setTitle("Edit Mermaid block (GUI)")
                .setIcon("pencil")
                .onClick(() => openModalForBlock(this, file ?? null, block)),
            );
          } else {
            menu.addItem((item) =>
              item
                .setTitle("Insert new Mermaid diagram (GUI)")
                .setIcon("plus")
                .onClick(() => openModalForNewBlock(this, file ?? null, editor)),
            );
          }
        },
      ),
    );
  }

  async onunload(): Promise<void> {
    // Per-block React roots are owned by MarkdownRenderChild instances, which
    // Obsidian unmounts automatically. Modals tear down their roots in onClose.
  }
}
