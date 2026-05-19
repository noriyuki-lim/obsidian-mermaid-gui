import { stripGuiMetadata } from "../core/positions-codec";
import { detectDiagramKind, isFlowchart } from "../core/diagram-kind";
import { FlowchartEditor } from "./FlowchartEditor";
import { SourceOnlyEditor } from "./SourceOnlyEditor";

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
 * Top-level editor entry point. Routes to the flowchart GUI for `flowchart`/`graph`
 * diagrams and falls back to a plain source editor for all other types.
 */
export const MermaidEditor = (props: Props) => {
  const kind = detectDiagramKind(props.initialSource);
  if (!isFlowchart(kind)) {
    return (
      <SourceOnlyEditor
        initialSource={stripGuiMetadata(props.initialSource)}
        onSave={props.onSave}
        onCancel={props.onCancel}
      />
    );
  }
  return <FlowchartEditor {...props} />;
};
