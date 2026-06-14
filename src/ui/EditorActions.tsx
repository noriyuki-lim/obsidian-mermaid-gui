interface EditorActionsProps {
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** When provided, an Export SVG button is shown. */
  onExport?: () => void | Promise<void>;
}

/**
 * Diagram-agnostic toolbar actions: Undo / Redo / Export SVG.
 *
 * Shared by the flowchart `Toolbar` (store-backed history) and the common
 * `EditorShell` (source-string history) so every editor exposes the same
 * controls without duplicating button markup. Purely presentational — the host
 * wires the handlers and enabled state. Keeping this single source of truth is
 * the reason these controls stay consistent across all diagram kinds.
 */
export const EditorActions = ({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onExport,
}: EditorActionsProps) => (
  <div className="mge-group mge-editor-actions">
    <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
      Undo
    </button>
    <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y / Ctrl+Shift+Z)">
      Redo
    </button>
    {onExport ? (
      <button onClick={() => void onExport()} title="Export SVG to vault attachment">
        Export SVG
      </button>
    ) : null}
  </div>
);
