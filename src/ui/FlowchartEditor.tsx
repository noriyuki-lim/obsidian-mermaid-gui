import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { createEditorStore, type EditorEdgeType } from "../core/store-factory";
import { parseMermaid, generateMermaid, stripGuiComments } from "../core";
import { Toolbar } from "./toolbar/Toolbar";
import { Palette } from "./panels/Palette";
import { PropertyPanel } from "./panels/PropertyPanel";
import { TextPane } from "./panels/TextPane";
import { FlowCanvas } from "./canvas/FlowCanvas";
import { EditorStoreProvider } from "./EditorContext";
import { isEditableShortcutTarget, shouldRemoveSelectionFromKey } from "./keyboard";

const EDGE_TYPE_STORAGE_KEY = "mge:flowchart:editor-edge-type";
const isEditorEdgeType = (value: string | null): value is EditorEdgeType =>
  value === "bezier" || value === "smoothstep";

const loadEditorEdgeTypePreference = (): EditorEdgeType | null => {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(EDGE_TYPE_STORAGE_KEY);
    return isEditorEdgeType(value) ? value : null;
  } catch {
    return null;
  }
};

export interface FlowchartEditorProps {
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
 * Flowchart GUI shell. Hosts a fresh store per mount so several editors can
 * coexist without state bleed (plugin spec §6.3). The store is intentionally
 * created via `useMemo` keyed only on mount — re-running `initialSource`
 * effects re-applies the IR but does not recreate the store, so undo history
 * survives benign re-renders by the host.
 */
export const FlowchartEditor = ({
  initialSource,
  onSave,
  onCancel,
  onExportSvg,
  onParseError,
}: FlowchartEditorProps) => {
  const storeApi = useMemo(() => {
    const store = createEditorStore();
    const edgeType = loadEditorEdgeTypePreference();
    if (edgeType) store.getState().setEditorEdgeType(edgeType);
    return store;
  }, []);
  const shellRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const parse = parseMermaid(stripGuiComments(initialSource));
    if (!parse.ok) {
      onParseError?.(parse.message);
      return;
    }
    storeApi.getState().applyIR(parse.ir, { layout: true, recordHistory: false });
  }, [initialSource, storeApi, onParseError]);

  useEffect(() => {
    const root = shellRef.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      if (shouldRemoveSelectionFromKey(e)) {
        e.preventDefault();
        storeApi.getState().removeSelection();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (isEditableShortcutTarget(e.target)) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        storeApi.getState().undo();
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        storeApi.getState().redo();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [storeApi]);

  const focusShell = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (isEditableShortcutTarget(e.target)) return;
    shellRef.current?.focus({ preventScroll: true });
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const state = storeApi.getState();
    if (state.isTextDirty) state.commitText();
    const after = storeApi.getState();
    if (after.status.kind === "error") {
      onParseError?.(after.status.message);
      return;
    }
    const out = generateMermaid(after.ir);
    setSaving(true);
    try {
      await onSave(out);
    } finally {
      setSaving(false);
    }
  }, [storeApi, onSave, onParseError, saving]);

  const handleExportSvg = useCallback(() => {
    if (!onExportSvg) return;
    const state = storeApi.getState();
    if (state.isTextDirty) state.commitText();
    const text = storeApi.getState().text;
    void onExportSvg(text);
  }, [storeApi, onExportSvg]);

  return (
    <EditorStoreProvider store={storeApi}>
      <ReactFlowProvider>
        <div
          className="mge-app-shell"
          ref={shellRef}
          tabIndex={-1}
          onMouseDownCapture={focusShell}
        >
          <Toolbar
            onSave={handleSave}
            onCancel={onCancel}
            onExportSvg={onExportSvg ? handleExportSvg : undefined}
            saving={saving}
          />
          <Palette />
          <FlowCanvas />
          <PropertyPanel />
          <TextPane />
        </div>
      </ReactFlowProvider>
    </EditorStoreProvider>
  );
};
