import { Menu } from "obsidian";

/**
 * Session-only registry of Mermaid blocks whose Edit button the user has
 * hidden via the block's right-click menu. Keyed by note path + source so the
 * choice survives scroll-out/in and Reading-view ↔ Live-Preview switches (which
 * re-create the button DOM) but resets on Obsidian reload.
 *
 * Shared by both button hosts — `postProcessor.ts` (Reading view) and
 * `editorExtension.ts` (Live Preview overlay + source-mode widget) — so a block
 * hidden in one mode stays hidden in the other.
 *
 * Two blocks with identical source in the same note share a key and therefore a
 * hidden state — an accepted edge case for a session-only convenience.
 */
const hidden = new Set<string>();

export const editBtnKey = (path: string, source: string): string => `${path}\n${source}`;

export const isEditBtnHidden = (key: string): boolean => hidden.has(key);

/**
 * Wire a right-click menu onto `target` that toggles the hidden state for
 * `key`. `apply(hidden)` is invoked immediately (to reflect the current state
 * on first render) and again after each toggle.
 *
 * The menu lives on whatever element the caller passes: the whole block in
 * Reading view (so it stays reachable once the button is gone), or the button
 * itself in Live Preview (where the button is the only pointer-events target).
 */
export const attachEditBtnHideMenu = (
  target: HTMLElement,
  key: string,
  apply: (hidden: boolean) => void,
): void => {
  apply(isEditBtnHidden(key));
  target.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const nowHidden = isEditBtnHidden(key);
    const next = !nowHidden;
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle(nowHidden ? "Show edit button" : "Hide edit button")
        .setIcon(nowHidden ? "eye" : "eye-off")
        .onClick(() => {
          if (next) hidden.add(key);
          else hidden.delete(key);
          apply(next);
        }),
    );
    menu.showAtMouseEvent(ev);
  });
};
