import { stripGuiMetadata } from "../core/positions-codec";
import { detectDiagramKind, isFlowchart } from "../core/diagram-kind";
import { FlowchartEditor } from "./FlowchartEditor";
import { SourceOnlyEditor } from "./SourceOnlyEditor";
import { SequenceEditor } from "./sequence/SequenceEditor";

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
 * flowchart → FlowchartEditor (full canvas GUI)
 * sequenceDiagram → SequenceEditor (structured list editor)
 * others → SourceOnlyEditor (plain textarea fallback)
 */
export const MermaidEditor = (props: Props) => {
  const kind = detectDiagramKind(props.initialSource);

  if (isFlowchart(kind)) {
    return <FlowchartEditor {...props} />;
  }

  const stripped = stripGuiMetadata(props.initialSource);

  if (kind === "sequenceDiagram") {
    return (
      <SequenceEditor
        initialSource={stripped}
        onSave={props.onSave}
        onCancel={props.onCancel}
      />
    );
  }

  return (
    <SourceOnlyEditor
      initialSource={stripped}
      onSave={props.onSave}
      onCancel={props.onCancel}
    />
  );
};
