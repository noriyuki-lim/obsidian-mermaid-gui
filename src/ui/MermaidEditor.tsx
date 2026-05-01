import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { createEditorStore } from "../core/store-factory";
import { decodeBlock, encodeBlock } from "../core/positions-codec";
import { Toolbar } from "./toolbar/Toolbar";
import { Palette } from "./panels/Palette";
import { PropertyPanel } from "./panels/PropertyPanel";
import { TextPane } from "./panels/TextPane";
import { FlowCanvas } from "./canvas/FlowCanvas";
import { EditorStoreProvider } from "./EditorContext";

interface Props {
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
 * Top-level GUI shell. Hosts a fresh store per mount so several editors can
 * coexist without state bleed (plugin spec §6.3). The store is intentionally
 * created via `useMemo` keyed only on mount — re-running `initialSource`
 * effects re-applies the IR but does not recreate the store, so undo history
 * survives benign re-renders by the host.
 */
export const MermaidEditor = ({
  initialSource,
  onSave,
  onCancel,
  onExportSvg,
  onParseError,
}: Props) => {
  const storeApi = useMemo(() => createEditorStore(), []);
  const shellRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  // Apply initialSource → store on mount and whenever the source identity changes.
  useEffect(() => {
    const decoded = decodeBlock(initialSource);
    if (!decoded.parse.ok) {
      onParseError?.(decoded.parse.message);
      return;
    }
    const ir = decoded.parse.ir;
    const hasPositions = Object.keys(decoded.positions).length > 0;
    storeApi
      .getState()
      .applyIR(ir, { layout: !hasPositions, recordHistory: false });
  }, [initialSource, storeApi, onParseError]);

  // Scope keyboard shortcuts to this editor instance.
  useEffect(() => {
    const root = shellRef.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
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

  const handleSave = useCallback(async () => {
    if (saving) return;
    // Make sure pending text edits are committed before reading IR.
    const state = storeApi.getState();
    if (state.isTextDirty) state.commitText();
    const after = storeApi.getState();
    if (after.status.kind === "error") {
      onParseError?.(after.status.message);
      return;
    }
    const out = encodeBlock(after.ir);
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
        <div className="mge-app-shell" ref={shellRef} tabIndex={-1}>
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
