// Allow `import "@xyflow/react/dist/style.css"` in TS source files.
// At bundle time esbuild treats `.css` imports as `empty` (see esbuild.config.mjs);
// the actual CSS is concatenated into the plugin's `styles.css` deliverable.
declare module "*.css";
