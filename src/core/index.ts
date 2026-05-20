export * from "./ir-types";
export * from "./shapes";
export { parseMermaid, stripGuiComments, type ParseOutcome, type ParseResult, type ParseError } from "./parser";
export { generateMermaid } from "./generator";
export { computeLayout, NODE_SIZE } from "./dagre";
export {
  createEditorStore,
  type EditorState,
  type EditorStoreApi,
  type Selection,
  type SyncStatus,
} from "./store-factory";
export { detectDiagramKind, isFlowchart, type DiagramKind } from "./diagram-kind";
export { type DiagramIR } from "./diagram-ir";
export { DIAGRAM_TEMPLATES, getTemplate, type DiagramTemplate } from "./templates";
