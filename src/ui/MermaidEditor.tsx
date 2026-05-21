import { useState } from "react";
import { stripGuiComments } from "../core";
import { detectDiagramKind, isFlowchart } from "../core/diagram-kind";
import { FlowchartEditor } from "./FlowchartEditor";
import { SourceOnlyEditor } from "./SourceOnlyEditor";
import { SequenceEditor } from "./sequence/SequenceEditor";
import { ClassEditor } from "./class/ClassEditor";
import { StateEditor } from "./state/StateEditor";
import { PieEditor } from "./pie/PieEditor";
import { SankeyEditor } from "./sankey/SankeyEditor";
import { QuadrantEditor } from "./quadrant/QuadrantEditor";
import { XYChartEditor } from "./xychart/XYChartEditor";
import { RadarEditor } from "./radar/RadarEditor";
import { GanttEditor } from "./gantt/GanttEditor";
import { TimelineEditor } from "./timeline/TimelineEditor";
import { ERDiagramEditor } from "./er/ERDiagramEditor";
import { MindmapEditor } from "./mindmap/MindmapEditor";
import { JourneyEditor } from "./journey/JourneyEditor";
import { DiagramKindPicker } from "./DiagramKindPicker";

export interface Props {
  /** Raw text from inside ```mermaid fences (without the fences themselves).
   *  Pass an empty string to land on the diagram-kind picker. */
  initialSource: string;
  /** Called with the new block body (without fences) when the user saves. */
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  /** Optional SVG exporter. Receives the current Mermaid source and saves it
   *  via the host (vault writeBinary in plugin context). */
  onExportSvg?: (mermaidSource: string) => void | Promise<void>;
  /** Optional callback for parse errors that should bubble up to the host. */
  onParseError?: (message: string) => void;
  /** Optional Mermaid SVG renderer (wraps obsidian's loadMermaid). When
   *  provided, non-flowchart editors show a live preview alongside the
   *  generated source. */
  renderMermaid?: (source: string) => Promise<string>;
}

const isBlank = (s: string): boolean => s.trim().length === 0;

/**
 * Top-level editor entry point. Routes by:
 *   1. If `initialSource` is blank, show the DiagramKindPicker so the user can
 *      pick a kind and seed a starter template.
 *   2. Otherwise detect the kind and mount the matching editor.
 *      flowchart        → FlowchartEditor (canvas itself = preview)
 *      sequenceDiagram  → SequenceEditor   ┐
 *      classDiagram     → ClassEditor      │
 *      stateDiagram-v2  → StateEditor      │ shared EditorShell with drag bar,
 *      stateDiagram     → StateEditor      │ live Mermaid preview + source pane
 *      pie              → PieEditor        │
 *      sankey-beta      → SankeyEditor     │
 *      quadrantChart    → QuadrantEditor   │ (interactive drag-on-preview)
 *      xychart-beta     → XYChartEditor    │
 *      radar-beta       → RadarEditor      │ (preview unsupported by obsidian)
 *      gantt            → GanttEditor      │
 *      timeline         → TimelineEditor   ┘
 *      others           → SourceOnlyEditor
 */
export const MermaidEditor = (props: Props) => {
  const [seeded, setSeeded] = useState<string | null>(null);
  const effectiveSource = seeded ?? props.initialSource;

  if (isBlank(effectiveSource)) {
    return (
      <DiagramKindPicker
        onPick={(template) => setSeeded(template.source)}
        onCancel={props.onCancel}
        renderMermaid={props.renderMermaid}
      />
    );
  }

  const kind = detectDiagramKind(effectiveSource);
  const dispatchProps = { ...props, initialSource: effectiveSource };

  if (isFlowchart(kind)) {
    return <FlowchartEditor {...dispatchProps} />;
  }

  const stripped = stripGuiComments(effectiveSource);
  const passthrough = {
    initialSource: stripped,
    onSave: props.onSave,
    onCancel: props.onCancel,
    renderMermaid: props.renderMermaid,
  };

  if (kind === "sequenceDiagram") return <SequenceEditor {...passthrough} />;
  if (kind === "classDiagram") return <ClassEditor {...passthrough} />;
  if (kind === "stateDiagram-v2" || kind === "stateDiagram") return <StateEditor {...passthrough} />;
  if (kind === "pie") return <PieEditor {...passthrough} />;
  if (kind === "sankey-beta") return <SankeyEditor {...passthrough} />;
  if (kind === "quadrantChart") return <QuadrantEditor {...passthrough} />;
  if (kind === "xychart-beta") return <XYChartEditor {...passthrough} />;
  if (kind === "radar-beta") return <RadarEditor {...passthrough} />;
  if (kind === "gantt") return <GanttEditor {...passthrough} />;
  if (kind === "timeline") return <TimelineEditor {...passthrough} />;
  if (kind === "erDiagram") return <ERDiagramEditor {...passthrough} />;
  if (kind === "mindmap") return <MindmapEditor {...passthrough} />;
  if (kind === "journey") return <JourneyEditor {...passthrough} />;

  return <SourceOnlyEditor {...passthrough} />;
};
