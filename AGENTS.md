# Repository Guidelines

## Project Structure & Module Organization

This repository is an Obsidian plugin for editing Mermaid flowcharts through a React GUI while saving plain Mermaid text. Keep IO-free logic in `src/core/`: parsing, generation, layout, IR types, store creation, and GUI metadata codecs. Keep React UI in `src/ui/`, with canvas components under `src/ui/canvas/`, panels under `src/ui/panels/`, and toolbar code under `src/ui/toolbar/`. Obsidian API integration belongs in `src/obsidian/`. Tests live in `tests/`, grouped by the module they cover, for example `tests/core/parser.test.ts` and `tests/ui/adapter.test.ts`. `_legacy/` is reference-only and excluded from the plugin build.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: run esbuild in watch mode and regenerate plugin assets.
- `npm run build`: run TypeScript checks and build `main.js` plus `styles.css`.
- `npm run typecheck`: run `tsc -noEmit`.
- `npm test`: run the Vitest suite once.
- `npm run test:watch`: run Vitest in watch mode during active development.

For local Obsidian testing, build the plugin and load `main.js`, `manifest.json`, and `styles.css` from the plugin folder.

## Coding Style & Naming Conventions

Use TypeScript with strict typing. Prefer small pure functions in `src/core/` and keep Obsidian-specific behavior out of that layer. React components use PascalCase filenames, hooks and callbacks use camelCase, and CSS classes use the `mge-` prefix. Preserve Mermaid round-trip behavior: unsupported syntax should remain in `rawLines` instead of being dropped. GUI-only state should be stored in `%% gui:*` comments and stripped before Mermaid rendering.

## Testing Guidelines

Use Vitest. Add focused tests near the changed module: parser/generator behavior in `tests/core/`, UI projection behavior in `tests/ui/`. Test round trips when changing Mermaid serialization, GUI metadata, edge handles, positions, or parser support. Run `npm run typecheck` and `npm test` before committing.

## Commit & Pull Request Guidelines

Existing commits use short imperative summaries, for example `Initial commit`, `Fix Mermaid GUI edge editing`, and `Persist GUI edge handles`. Keep commits scoped to one behavioral change. Pull requests should include the user-visible change, affected files or modules, test results, and screenshots or GIFs for GUI changes.

## Agent-Specific Instructions

Do not edit generated `main.js` or `styles.css` directly; change sources and run the build. Do not commit `node_modules/`. When modifying SSOT-style files, skills, rules, agents, or MCP server configuration, check `LINEAGE.md` first if it exists and update it when structure changes.
