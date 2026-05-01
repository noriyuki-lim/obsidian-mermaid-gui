import { editorInfoField, editorLivePreviewField, Notice, Plugin, TFile } from "obsidian";
import { RangeSetBuilder, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { EditorModal } from "./EditorModal";
import { type MermaidBlock } from "./commands";
import { exportSvgToVault } from "./svgExport";

const FENCE_OPEN = /^\s*```\s*mermaid\b/i;
const FENCE_CLOSE = /^\s*```\s*$/;

const collectMermaidBlocks = (doc: Text): MermaidBlock[] => {
  const blocks: MermaidBlock[] = [];
  let openLine = -1;
  for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
    const line = doc.line(lineNo);
    if (openLine === -1) {
      if (FENCE_OPEN.test(line.text)) openLine = lineNo;
      continue;
    }
    if (!FENCE_CLOSE.test(line.text)) continue;

    const body: string[] = [];
    for (let bodyLineNo = openLine + 1; bodyLineNo < lineNo; bodyLineNo++) {
      body.push(doc.line(bodyLineNo).text);
    }
    blocks.push({
      source: body.join("\n"),
      text: doc.toString(),
      lineStart: openLine - 1,
      lineEnd: lineNo - 1,
    });
    openLine = -1;
  }
  return blocks;
};

const fileFromView = (view: EditorView): TFile | null => {
  const info = view.state.field(editorInfoField, false);
  return info?.file ?? null;
};

const replaceBlockInView = (view: EditorView, block: MermaidBlock, newSource: string): void => {
  const doc = view.state.doc;
  if (block.lineStart >= doc.lines || block.lineEnd >= doc.lines) {
    throw new Error("Mermaid block has moved since the editor opened.");
  }

  const openLine = doc.line(block.lineStart + 1);
  const closeLine = doc.line(block.lineEnd + 1);
  if (!FENCE_OPEN.test(openLine.text)) {
    throw new Error("Opening fence has moved since the editor opened.");
  }
  if (!FENCE_CLOSE.test(closeLine.text)) {
    throw new Error("Closing fence has moved since the editor opened.");
  }

  const body = newSource.replace(/\n+$/, "");
  view.dispatch({
    changes: {
      from: openLine.to + 1,
      to: closeLine.from,
      insert: body ? `${body}\n` : "",
    },
  });
  view.focus();
};

const openEditorFromView = (plugin: Plugin, view: EditorView, block: MermaidBlock): void => {
  const file = fileFromView(view);
  if (!file) {
    new Notice("Cannot edit Mermaid block — no active file.");
    return;
  }
  new EditorModal(plugin.app, block.source, {
    onSave: (newSource) => replaceBlockInView(view, block, newSource),
    onExportSvg: async (src) => {
      await exportSvgToVault(plugin.app, file.path, src);
    },
  }).open();
};

type PositionedBlock = {
  block: MermaidBlock;
  left: number;
  width: number;
  top: number;
};

class MermaidSourceWidget extends WidgetType {
  constructor(
    private readonly plugin: Plugin,
    private readonly block: MermaidBlock,
  ) {
    super();
  }

  eq(other: MermaidSourceWidget): boolean {
    return (
      other.block.lineStart === this.block.lineStart &&
      other.block.lineEnd === this.block.lineEnd &&
      other.block.source === this.block.source
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "mge-cm-edit-widget";

    const button = document.createElement("button");
    button.className = "mge-cm-edit-btn";
    button.type = "button";
    button.textContent = "Edit Mermaid GUI";
    button.setAttribute("aria-label", "Edit Mermaid block in GUI");
    button.addEventListener("mousedown", (ev) => ev.preventDefault());
    button.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openEditorFromView(this.plugin, view, this.block);
    });

    wrap.appendChild(button);
    return wrap;
  }
}

class MermaidEditorButtonPlugin {
  private readonly overlay: HTMLDivElement;
  private lastLivePreview: boolean;
  decorations: DecorationSet;

  constructor(
    readonly view: EditorView,
    private readonly plugin: Plugin,
  ) {
    this.overlay = document.createElement("div");
    this.overlay.className = "mge-cm-overlay";
    this.view.dom.appendChild(this.overlay);
    this.lastLivePreview = this.isLivePreview();
    this.decorations = this.buildSourceDecorations();
    if (this.lastLivePreview) this.scheduleMeasure();
  }

  update(update: ViewUpdate): void {
    const livePreview = this.isLivePreview();
    if (
      !update.docChanged &&
      !update.viewportChanged &&
      !update.geometryChanged &&
      livePreview === this.lastLivePreview
    ) {
      return;
    }
    this.lastLivePreview = livePreview;
    this.decorations = livePreview ? Decoration.none : this.buildSourceDecorations();
    this.overlay.style.display = livePreview ? "" : "none";
    if (livePreview) this.scheduleMeasure();
  }

  destroy(): void {
    this.overlay.remove();
  }

  private scheduleMeasure(): void {
    const livePreview = this.isLivePreview();
    this.view.requestMeasure({
      read: () => {
        const rootRect = this.view.dom.getBoundingClientRect();
        const positions: PositionedBlock[] = [];

        for (const block of collectMermaidBlocks(this.view.state.doc)) {
          let left = Infinity;
          let right = -Infinity;
          let top = Infinity;
          for (let lineNo = block.lineStart + 1; lineNo <= block.lineEnd + 1; lineNo++) {
            const line = this.view.state.doc.line(lineNo);
            const start = this.view.coordsAtPos(line.from);
            const end = this.view.coordsAtPos(line.to);
            if (!start || !end) continue;
            left = Math.min(left, start.left);
            right = Math.max(right, end.right);
            top = Math.min(top, start.top);
          }
          if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top)) continue;
          positions.push({
            block,
            left: left - rootRect.left,
            width: Math.max(0, right - left),
            top: top - rootRect.top + 6,
          });
        }

        return positions;
      },
      write: (positions: PositionedBlock[]) => {
        this.overlay.replaceChildren();
        for (const { block, left, width, top } of positions) {
          const slot = document.createElement("div");
          slot.className = "mge-cm-edit-slot";
          slot.style.left = `${Math.max(0, left)}px`;
          slot.style.width = `${Math.max(0, width)}px`;
          slot.style.top = `${Math.max(0, top)}px`;
          slot.style.setProperty("--mge-cm-edit-gap", livePreview ? "44px" : "6px");

          const button = document.createElement("button");
          button.className = "mge-edit-btn mge-edit-btn--preview";
          button.type = "button";
          button.textContent = livePreview ? "Edit" : "Edit Mermaid GUI";
          button.setAttribute("aria-label", "Edit Mermaid block in GUI");
          button.addEventListener("mousedown", (ev) => ev.preventDefault());
          button.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            openEditorFromView(this.plugin, this.view, block);
          });

          slot.appendChild(button);
          this.overlay.appendChild(slot);
        }
      },
    });
  }

  private buildSourceDecorations(): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    for (const block of collectMermaidBlocks(this.view.state.doc)) {
      const line = this.view.state.doc.line(block.lineStart + 1);
      builder.add(
        line.to,
        line.to,
        Decoration.widget({
          widget: new MermaidSourceWidget(this.plugin, block),
          side: 1,
        }),
      );
    }
    return builder.finish();
  }

  private isLivePreview(): boolean {
    return !!this.view.state.field(editorLivePreviewField, false);
  }
}

export const createMermaidEditorExtension = (plugin: Plugin) =>
  ViewPlugin.fromClass(
    class extends MermaidEditorButtonPlugin {
      constructor(view: EditorView) {
        super(view, plugin);
      }
    },
    {
      decorations: (value) => value.decorations,
    },
  );
