# Mermaid GUI for Obsidian

Obsidian ノート内の `` ```mermaid `` フェンスをそのまま GUI で編集できるプラグイン。
保存はあくまで **プレーンテキストの Mermaid 記法**で、ノードの座標だけを `%% gui:positions` のコメント行としてフェンス内に書き戻す。

要件・設計: [`docs/obsidian-plugin-spec.md`](./docs/obsidian-plugin-spec.md)

## できること（v0.1 MVP）

- Reading view の `` ```mermaid `` ブロックに「Edit」ボタンを差し込み、Modal で GUI 編集
- コマンドパレットから `Edit current Mermaid block` で Live Preview / Source view からも起動
- 保存時に **そのフェンスの中身だけ** を `editor` API で書き戻し、ノートの他の行は触らない
- ノードの座標を `%% gui:positions {...}` のコメントとしてフェンス内に永続化（再オープンでレイアウト復元）
- 未対応の構文（`classDef` / `style` / `linkStyle` / `click` 等）は `rawLines` で素通し
- SVG エクスポート（Obsidian 内蔵の `loadMermaid()` でレンダリング → ノートと同じフォルダに添付保存）
- Obsidian テーマ追従（CSS 変数を読みに行く）

P1.5 以降（専用ビュー、`[[wikilink]]` 解釈、選択範囲 → flowchart 化、Live Preview インライン GUI、sequence diagram）はスコープ外。

## インストール

コミュニティプラグインへの公開は行わない方針。社内・個人 vault へのローカル配布で運用する。

1. このリポジトリで `npm run build`
2. ビルドで生成された `main.js`、リポジトリ直下の `manifest.json`、`styles.css` の 3 ファイルを<br>
   `<vault>/.obsidian/plugins/mermaid-gui-obsidian/` にコピー
3. Obsidian の **Settings → Community plugins** で「制限モード」を OFF にし、
   `Mermaid GUI` を有効化

zip 配布する場合は上記 3 ファイル＋`README.md`/`CHANGELOG.md` をまとめて配る。

## 開発

```bash
npm install
npm run dev          # esbuild watch — main.js を更新したら Obsidian で Cmd+R
npm run build        # 本番ビルド（typecheck + minify）
npm run typecheck
npm run test
npm run test:watch
```

Obsidian で動作確認するときは vault に直接出力するシンボリックリンクを張ると速い:

```bash
# Windows (PowerShell, 管理者)
New-Item -ItemType Junction `
  -Path "<vault>\.obsidian\plugins\mermaid-gui-obsidian" `
  -Target "<repo>\."
```

リポジトリ側で `npm run dev` を回しつつ Obsidian で `Cmd/Ctrl+R` すれば反映される。

## ディレクトリ構成

```
.
├── main.ts                       # Plugin エントリ（registerMarkdownCodeBlockProcessor / commands）
├── manifest.json                 # Obsidian プラグインマニフェスト
├── esbuild.config.mjs            # main.ts → main.js、styles.src.css → styles.css の concat
├── styles.src.css                # 著者管理の CSS（mge-* プレフィックス）
├── styles.css                    # ビルド成果物（@xyflow/react CSS と styles.src.css を結合）
├── main.js                       # ビルド成果物
├── src/
│   ├── core/                     # IO 非依存の中核ロジック（Obsidian API に触れない）
│   │   ├── ir-types.ts           # MermaidIR / Positions など
│   │   ├── parser.ts             # text → IR
│   │   ├── generator.ts          # IR → text
│   │   ├── shapes.ts
│   │   ├── dagre.ts              # 自動レイアウト
│   │   ├── store-factory.ts      # createEditorStore() — 1 ブロック 1 store
│   │   └── positions-codec.ts    # %% gui:positions / %% gui:meta の読み書き
│   ├── ui/                       # React コンポーネント（Obsidian 非依存）
│   │   ├── MermaidEditor.tsx     # Modal / 専用ビューから共通呼出される GUI シェル
│   │   ├── EditorContext.tsx     # store ファクトリと React を橋渡しする Provider/hook
│   │   ├── adapter.ts            # IR ↔ ReactFlow 変換
│   │   ├── canvas/               # FlowCanvas / ShapeNode / SubgraphNode
│   │   ├── panels/               # Palette / PropertyPanel / TextPane
│   │   └── toolbar/Toolbar.tsx
│   ├── obsidian/                 # Obsidian API を呼ぶレイヤ
│   │   ├── postProcessor.ts      # Reading view のブロック装飾＋Edit ボタン
│   │   ├── EditorModal.ts        # Modal をラップして React をホスト
│   │   ├── ReactHost.tsx         # createRoot / unmount ライフサイクル
│   │   ├── commands.ts           # コマンドパレットからの起動経路
│   │   ├── io.ts                 # editor.replaceRange 相当を vault.modify で安全に
│   │   └── svgExport.ts          # loadMermaid → SVG → vault attachment
│   └── global.d.ts               # `import "*.css"` 用の型宣言
└── tests/
    └── core/                     # vitest（parser ラウンドトリップ／positions-codec ラウンドトリップ）
```

`_legacy/web/` は旧 Web 版の痕跡（`App.tsx` / `index.html` / `vite.config.ts` 等）。
プラグインのビルドからは除外しており、参考用として保持しているだけ。

## 設計の要点

- **IR 中心 + rawLines 温存** — 旧 Web 版のロジックをそのまま継承。未対応構文は破壊しない。
- **store は 1 ブロック 1 インスタンス** — `createEditorStore()` を `useMemo` で初期化し、
  Modal/View のライフサイクルで生成 → 破棄。複数の mermaid ブロックを同時に開いても状態が混線しない。
- **Obsidian 内蔵 mermaid を再利用** — `loadMermaid()` でレンダリングし、自前で mermaid をバンドルしない（仕様 §6.2）。
- **CSS は `mge-` プレフィックスで隔離** — テーマや他プラグインと衝突しない。
- **書き戻しは fence 検証つき** — `vault.modify` の前に開始/終了 fence のシグネチャを再検証して、
  ノートの他の行を破壊しない（仕様 §9 の「`editor.replaceRange` 失敗時のノート破損」対策）。

## テスト

```
$ npm run test
 ✓ tests/core/parser.test.ts            (14 tests)
 ✓ tests/core/positions-codec.test.ts   (4 tests)
   ✓ decodes a block with gui:positions and removes them from rawLines
   ✓ falls through cleanly when no gui comments are present
   ✓ encodes positions just below the flowchart header
   ✓ round-trips: decode → encode keeps positions stable
```

## 既知の制約

- モバイル（Obsidian Mobile）は対象外（`isDesktopOnly: true`）
- sequence / state / class diagram は P2 以降
- Live Preview のインラインで GUI を直接表示する B 案は実装していない（CM6 と主導権を取り合うため、Modal/A 案先行）
- `linkStyle 0` などインデックス参照のスタイルは IR 化していないため、エッジを並び替えると指し先がズレる可能性あり（仕様 §12.1 の残課題）
