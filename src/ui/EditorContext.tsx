import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import type { EditorState, EditorStoreApi } from "../core/store-factory";

const EditorStoreContext = createContext<EditorStoreApi | null>(null);

interface ProviderProps {
  store: EditorStoreApi;
  children: ReactNode;
}

export const EditorStoreProvider = ({ store, children }: ProviderProps) => (
  <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>
);

const requireStore = (): EditorStoreApi => {
  const ctx = useContext(EditorStoreContext);
  if (!ctx) {
    throw new Error(
      "useEditorStore: must be used inside <EditorStoreProvider> — see MermaidEditor.tsx",
    );
  }
  return ctx;
};

export function useEditorStore<T>(selector: (s: EditorState) => T): T {
  const store = requireStore();
  return useStore(store, selector);
}

export const useEditorStoreApi = (): EditorStoreApi => requireStore();
