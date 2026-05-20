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

export interface Props {
  /** Raw text from inside ```mermaid fences (without the fences themselves). */
  initialSource: string;
  /** Called with the new block body (without fences) when the user saves. */
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  /** Optional SVG exporter. Receives the current Mermaid source and saves it
   *  via the host (vault writeBinary in plugin context). */
  onExportSvg?: (mermaidSource: string) => void | Promise<void>;
  /** Optional callback for parse errors that should bubble up to the host. */
  onParseError?: (message: string) => void;
}

/**
 * Top-level editor entry point. Routes to the appropriate GUI by diagram kind.
 * flowchart        → FlowchartEditor (full canvas GUI)
 * sequenceDiagram  → SequenceEditor (structured list editor)
 * classDiagram     → ClassEditor (class + relation editor)
 * stateDiagram-v2  → StateEditor (transition list editor)
 * stateDiagram     → StateEditor (same editor, outputs stateDiagram-v2)
 * pie              → PieEditor (form: title / slices)
 * sankey-beta      → SankeyEditor (CSV link table)
 * quadrantChart    → QuadrantEditor (axes / quadrants / points)
 * xychart-beta     → XYChartEditor (axes / series)
 * radar-beta       → RadarEditor (axes / curves / options; no preview in Obsidian)
 * others           → SourceOnlyEditor (plain textarea fallback)
 */
export const MermaidEditor = (props: Props) => {
  const kind = detectDiagramKind(props.initialSource);

  if (isFlowchart(kind)) {
    return <FlowchartEditor {...props} />;
  }

  const stripped = stripGuiComments(props.initialSource);
  const passthrough = { initialSource: stripped, onSave: props.onSave, onCancel: props.onCancel };

  if (kind === "sequenceDiagram") return <SequenceEditor {...passthrough} />;
  if (kind === "classDiagram") return <ClassEditor {...passthrough} />;
  if (kind === "stateDiagram-v2" || kind === "stateDiagram") return <StateEditor {...passthrough} />;
  if (kind === "pie") return <PieEditor {...passthrough} />;
  if (kind === "sankey-beta") return <SankeyEditor {...passthrough} />;
  if (kind === "quadrantChart") return <QuadrantEditor {...passthrough} />;
  if (kind === "xychart-beta") return <XYChartEditor {...passthrough} />;
  if (kind === "radar-beta") return <RadarEditor {...passthrough} />;

  return <SourceOnlyEditor {...passthrough} />;
};
