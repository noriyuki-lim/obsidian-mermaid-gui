# CLAUDE.md — Mermaid GUI for Obsidian

このリポジトリは **Obsidian プラグイン単体構成**。ベースの設計と意思決定は `obsidian-plugin-spec.md` に集約してある。コード触る前にそれと本ファイルを読む。

## 一行要約

`registerMarkdownCodeBlockProcessor("mermaid", ...)` で Reading view の mermaid ブロックに Edit ボタンを差し込み、Modal で React + ReactFlow + Zustand の GUI を立ち上げ、保存時に **当該フェンスの中身だけ** を `vault.modify` で書き戻す。座標は `%% gui:positions {...}` のコメント行としてフェンス内に永続化する。

## 3 層構造（依存方向は厳守）

```
src/obsidian/  →  src/ui/  →  src/core/
   ↑ Obsidian API はここだけ
                  ↑ React / @xyflow/react を使う
                                 ↑ 純粋ロジック / Obsidian, React 非依存
```

- `src/core` は `obsidian` も `react*` も `@xyflow/*` も import しない。テスト容易性と将来の VS Code 拡張への展開余地のため。
- `src/ui` は `obsidian` を import しない。`src/core` と React 系のみ依存。
- `src/obsidian` だけが Obsidian API を呼んでよい。`vault` / `editor` / `Modal` / `loadMermaid` 等。

逆方向の依存を作りたくなったら、それは設計が間違っている合図。先に IR / store / プロパティで橋渡しできないか考える。

## ファクトリ化された store の意味

旧 Web 版は `useEditorStore = create<...>(...)` のモジュールトップレベル singleton だった。プラグイン化に当たって `src/core/store-factory.ts` の `createEditorStore()` で **呼び出しごとに独立 store を返す**ファクトリへ書き換えてある（仕様 §6.3）。

- 1 ノートに mermaid ブロックが複数あっても状態が混線しない
- Modal / 専用ビュー / 将来のインライン GUI それぞれが自分の store を持つ
- 必ず `useMemo(() => createEditorStore(), [])` で生成し、React のライフサイクルに乗せる
- React 側からは `src/ui/EditorContext.tsx` の `EditorStoreProvider` / `useEditorStore` / `useEditorStoreApi` 経由でアクセスする。`useStore(api, selector)` を直接呼ぶケースは原則ない。

## rawLines 戦略は壊さない

parser が理解できない行は `MermaidIR.rawLines` に温存され、generator がそのまま再出力する。これが「既存ノートを破壊しない」契約の根拠。

- `classDef` / `style` / `linkStyle` / `click` は **IR 化しない**。MVP スコープ外（仕様 §5.1）。
- 新しい構文に対応したくなったら、まず raw として生き残ることを確認 → 必要なら IR 化。逆順でやらない。

## positions-codec の暗黙ルール

- `%% gui:positions {...}` と `%% gui:meta {...}` は **フェンスの中、`flowchart` 行の直後**に書き出す（仕様 §5）。
- 旧版は parser が pre-header コメントを落とすので、`decodeBlock` は **source 文字列レベル** で先にストリップしてから parser に渡す。これを変えると round-trip が破綻するので注意。
- スキーマを変更するなら `GUI_VERSION` を上げて、バージョン分岐の migration を入れる。

## 書き戻しの安全装置

`src/obsidian/io.ts:writeBlockBack` は `vault.modify` する前に必ず：

1. `info.lineStart` の行が `^\s*` ` ``` ` `mermaid\b` にマッチするか
2. `info.lineEnd` の行が `^\s*` ` ``` ` `\s*$` にマッチするか

を再検証する。ユーザーが Modal を開いている間にノートを編集した場合に、ズレた範囲を上書きして他の行を破壊するのを防ぐため。失敗時は throw して呼び出し側 (`EditorModal`) が Notice で通知する。**この検証を外したり緩めたりしてはいけない**（仕様 §9 のリスク表に明記された対策）。

## ビルドの仕組み

`esbuild.config.mjs` が以下を担う：

- `main.ts` を CJS の単一バンドル (`main.js`) に
- `obsidian` / `electron` / `@codemirror/*` / `@lezer/*` / Node 組込モジュールは external
- `loader: { ".css": "empty" }` — JS 側の CSS import はビルド時に no-op
- `styles.src.css`（著者管理）と `node_modules/@xyflow/react/dist/style.css` を結合して `styles.css` を生成

`mermaid` 本体はバンドルしない。Obsidian 内蔵の `loadMermaid()` を使う（仕様 §6.2）。`@xyflow/react` / `react` / `react-dom` / `zustand` / `@dagrejs/dagre` はバンドルされる。

`main.js` と `styles.css` はビルド成果物なので `.gitignore` に入れてある。リリース時は別途 zip にまとめる。

## CSS のお作法

- 全クラスに `mge-` プレフィックスを付ける（仕様 §9 のリスク対策）。Obsidian テーマや他プラグインと衝突させない。
- 色はハードコードせず、Obsidian のテーマ変数 (`--background-primary`, `--text-normal` 等) をフォールバック付きで参照。
- `.mge-app-shell` の中で CSS 変数を再定義してテーマ変化に追従させている。

## 動作確認のショートカット

```bash
npm run dev          # esbuild watch
```

を回しつつ、vault の `<vault>/.obsidian/plugins/mermaid-gui-obsidian/` に対して **junction**（Windows なら `New-Item -ItemType Junction`）でリポジトリ直下を貼ると、保存即反映できる。`Cmd/Ctrl+R` で Obsidian をリロード。

## やってはいけないこと

- `mermaid` を `dependencies` に戻して自前バンドルすること（バンドルサイズと内蔵レンダラとの差分の温床）
- `editor.replaceRange` を fence 検証なしで呼ぶこと
- `useEditorStore` を `src/core` 内で参照すること（依存方向違反）
- `createEditorStore()` を呼ばずに既定 store を共有すること
- `_legacy/` 配下のファイルを実プラグインから import すること（旧 Web 版の遺物。参考保管のみ）

## TODO ／ 未実装メモ

- 専用ビュー（`.mmd` を Mermaid GUI で開く）— 仕様 §7.2 / P1.5
- `[[wikilink]]` のクリック遷移
- 選択範囲（箇条書き）→ flowchart 生成コマンド
- Live Preview インライン GUI（CM6 WidgetType）— 仕様 P2、IME・Undo の事故が出やすいので慎重に
- 添付ファイルの保存先設定（現状はノートと同じフォルダ固定）— 仕様 §12.1 の残オープンクエスチョン
- `linkStyle` のインデックス保護 or 警告表示 — 同上
