# Mermaid GUI for Obsidian

Obsidian ノート内の `` ```mermaid `` フェンスをそのまま GUI で編集できるプラグイン。
保存はあくまで **プレーンテキストの Mermaid 記法**。ノードの座標はセッション内のみ保持し、ファイルには書き出さない（標準 Mermaid 準拠）。

## できること

- Reading view の `` ```mermaid `` ブロックに「Edit」ボタンを差し込み、Modal で GUI 編集
- コマンドパレット / 右クリックメニューから既存ブロックの編集、および新規 Mermaid ブロックの挿入
- flowchart / sequenceDiagram / classDiagram / stateDiagram(-v2) / pie / sankey-beta / quadrantChart / xychart-beta / radar-beta / gantt / timeline / erDiagram / mindmap / journey / architecture-beta / block-beta / kanban に専用 GUI エディタ。それ以外の図種はソース編集のみのフォールバック
- 保存時に **そのフェンスの中身だけ** を `vault.modify` で書き戻し、ノートの他の行は触らない
- 未対応の構文（`classDef` / `style` / `linkStyle` / `click` 等）は `rawLines` で素通し
- 全エディタ共通で Undo / Redo、SVG エクスポート
- Obsidian テーマ追従（CSS 変数を読みに行く）

スコープ外（TODO）は専用ビュー、`[[wikilink]]` クリック遷移、選択範囲 → flowchart 生成コマンド、Live Preview インライン GUI など。

## インストール

現状は下記手順でローカルにインストールして利用する。Obsidian コミュニティプラグインとしての公開に向けて準備中。

1. このリポジトリで `npm run build`
2. ビルドで生成された `main.js`、リポジトリ直下の `manifest.json`、`styles.css` の 3 ファイルを<br>
   `<vault>/.obsidian/plugins/mermaid-gui-editor/` にコピー
3. Obsidian の **Settings → Community plugins** で「制限モード」を OFF にし、
   `Mermaid GUI Editor` を有効化

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
  -Path "<vault>\.obsidian\plugins\mermaid-gui-editor" `
  -Target "<repo>\."
```

リポジトリ側で `npm run dev` を回しつつ Obsidian で `Cmd/Ctrl+R` すれば反映される。

## ディレクトリ構成

```
mermaid-gui-editor/
├── main.ts            # Plugin エントリ（registerMarkdownCodeBlockProcessor / commands）
├── manifest.json       # Obsidian プラグインマニフェスト
├── esbuild.config.mjs  # main.ts → main.js、styles.src.css → styles.css の concat
├── styles.src.css      # 著者管理の CSS（mge-* プレフィックス）
├── src/
│   ├── core/           # IO 非依存の中核ロジック（Obsidian / React 非依存）。図種ごとに ir-types / parser / generator
│   ├── ui/              # React コンポーネント（Obsidian 非依存）。図種ごとに専用エディタ
│   └── obsidian/        # Obsidian API を呼ぶレイヤ（Modal / postProcessor / commands / io）
└── tests/
    └── core/, ui/       # vitest（パーサ・ジェネレータのラウンドトリップ、ストア、UI 射影ロジック）
```

`main.js` / `styles.css` はビルド成果物のため Git 管理外。`_legacy/web/` は旧 Web 版の痕跡で、プラグインのビルドからは除外している。

## 設計の要点

- **IR 中心 + rawLines 温存** — 図種ごとに Mermaid テキスト ⇄ IR を変換し、パーサが理解できない行は破壊せず素通しする。
- **アダプタレジストリ** — 図種の識別・parse・generate は `src/core/adapters/` に隔離。
- **store は 1 ブロック 1 インスタンス** — `createEditorStore()` を `useMemo` で初期化し、Modal/View のライフサイクルで生成 → 破棄。複数の mermaid ブロックを同時に開いても状態が混線しない。
- **Obsidian 内蔵 mermaid を再利用** — `loadMermaid()` でレンダリングし、自前で mermaid をバンドルしない。
- **CSS は `mge-` プレフィックスで隔離** — テーマや他プラグインと衝突しない。
- **書き戻しは fence 検証つき** — `vault.modify` の前に開始/終了 fence のシグネチャを再検証して、ノートの他の行を破壊しない。
- **ノード座標はセッション内のみ** — ファイルには書き出さない（標準 Mermaid 準拠）。

## テスト

```bash
npm run test
```

パーサ・ジェネレータのラウンドトリップは `tests/core/`、UI の射影ロジックは `tests/ui/` に集中している。Mermaid シリアライズ・座標・パーサ対応を変更したときは必ずラウンドトリップテストを追加する。

## 既知の制約

- モバイル（Obsidian Mobile）は対象外（`isDesktopOnly: true`）
- radar-beta / venn-beta は Obsidian 内蔵 Mermaid が非対応のため GUI 編集は可能だがプレビューは描画されない。treemap-beta / venn-beta は GUI 編集自体が未対応でソース編集のみ
- Live Preview のインラインで GUI を直接表示する案は実装していない（CM6 と主導権を取り合うため、Modal 先行）
- `linkStyle 0` などインデックス参照のスタイルは IR 化していないため、エッジを並び替えると指し先がズレる可能性あり
