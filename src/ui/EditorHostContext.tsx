import { createContext, useContext, type ReactNode } from "react";

/**
 * Host capabilities that only the Obsidian layer can fulfil (vault writes etc.),
 * surfaced to every EditorShell-based editor without threading a prop through
 * each one. `MermaidEditor` provides the value; `EditorShell` consumes it. The
 * flowchart editor still receives `onExportSvg` as a direct prop because it does
 * not use `EditorShell`.
 */
export interface EditorHostCapabilities {
  /** Render the given Mermaid source to an SVG file in the vault. */
  onExportSvg?: (mermaidSource: string) => void | Promise<void>;
}

const EditorHostContext = createContext<EditorHostCapabilities>({});

export const EditorHostProvider = ({
  value,
  children,
}: {
  value: EditorHostCapabilities;
  children: ReactNode;
}) => <EditorHostContext.Provider value={value}>{children}</EditorHostContext.Provider>;

export const useEditorHost = (): EditorHostCapabilities => useContext(EditorHostContext);
