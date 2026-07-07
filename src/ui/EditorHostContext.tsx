import { createContext, useContext, type ReactNode } from "react";
import { ja } from "./i18n/ja";
import type { Translations } from "./i18n";

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
  /** Resolved UI strings for the Obsidian language detected at modal open
   *  (`EditorModal`'s `detectLocale()`). Required (not optional) so every
   *  consumer gets real strings; defaults to the Japanese dictionary when
   *  nothing wraps a component in a provider (e.g. isolated tests). */
  t: Translations;
}

const EditorHostContext = createContext<EditorHostCapabilities>({ t: ja });

export const EditorHostProvider = ({
  value,
  children,
}: {
  value: EditorHostCapabilities;
  children: ReactNode;
}) => <EditorHostContext.Provider value={value}>{children}</EditorHostContext.Provider>;

export const useEditorHost = (): EditorHostCapabilities => useContext(EditorHostContext);

/** Convenience accessor for just the translation dictionary. */
export const useT = (): Translations => useEditorHost().t;
