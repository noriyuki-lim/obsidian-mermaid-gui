# AGENTS.md — Mermaid GUI for Obsidian

このリポジトリは **Obsidian プラグイン単体構成**。ベースの設計と意思決定は `docs/obsidian-plugin-spec.md` に集約してある。コードに触れる前にそれと本ファイルを読む。

---

## 一行要約

`registerMarkdownCodeBlockProcessor("mermaid", ...)` で Reading view の mermaid ブロックに Edit ボタンを差し込み、Modal で React + ReactFlow + Zustand の GUI を立ち上げる。flowchart / sequenceDiagram / classDiagram / stateDiagram(-v2) / pie / sankey-beta / quadrantChart / xychart-beta / radar-beta / gantt / timeline / erDiagram / mindmap / journey / architecture-beta / block-beta / kanban は専用エディタを持つ（radar-beta は Obsidian 内蔵 Mermaid 非対応のためプレビュー不可）。全エディタ共通で Undo/Redo + SVG エクスポートボタンを持つ。それ以外の図種は `SourceOnlyEditor` でソースのみ表示。保存時に**当該フェンスの中身だけ**を `vault.modify` で書き戻す。ノード座標はセッション内のみ保持し、ファイルには書き出さない（標準 Mermaid 準拠）。

---

## リポジトリ構成

```
mermaid-gui-editor/
├── AGENTS.md                      ← プロジェクトルールの SSOT（本ファイル）
├── CLAUDE.md                      ← @AGENTS.md 参照
├── README.md
├── manifest.json                  ← Obsidian プラグインマニフェスト
├── main.ts                        ← Plugin エントリポイント
├── esbuild.config.mjs             ← バンドル設定
├── tsconfig.json
├── vitest.config.ts
├── package.json
├── package-lock.json
├── styles.src.css                 ← 著者管理 CSS
├── styles.css                     ← ビルド成果物（.gitignore 対象）
├── main.js                        ← ビルド成果物（.gitignore 対象）
├── .gitignore
├── src/
│   ├── global.d.ts
│   ├── core/                      ← 純粋ロジック（IO・Obsidian・React 非依存）
│   │   ├── parser.ts              ← flowchart パーサ
│   │   ├── generator.ts           ← flowchart ジェネレータ
│   │   ├── ir-types.ts            ← flowchart IR 型
│   │   ├── shapes.ts
│   │   ├── dagre.ts               ← 自動レイアウト
│   │   ├── store-factory.ts       ← createEditorStore() ファクトリ
│   │   ├── diagram-kind.ts        ← detectDiagramKind()
│   │   ├── diagram-ir.ts          ← DiagramIR 判別 union
│   │   ├── templates.ts           ← 図種別の初期テンプレート（新規作成フロー）
│   │   ├── index.ts
│   │   ├── adapters/              ← アダプタレジストリ
│   │   │   ├── types.ts           ← DiagramAdapter インターフェイス
│   │   │   ├── index.ts           ← getAdapter() レジストリ
│   │   │   ├── flowchart.ts
│   │   │   ├── sequence.ts
│   │   │   ├── class.ts
│   │   │   ├── state.ts
│   │   │   ├── pie.ts
│   │   │   ├── sankey.ts
│   │   │   ├── quadrant.ts
│   │   │   ├── xychart.ts
│   │   │   ├── radar.ts
│   │   │   ├── gantt.ts
│   │   │   ├── timeline.ts
│   │   │   ├── er.ts
│   │   │   ├── mindmap.ts
│   │   │   ├── treemap.ts
│   │   │   ├── venn.ts
│   │   │   ├── journey.ts
│   │   │   ├── architecture.ts
│   │   │   ├── block.ts
│   │   │   └── kanban.ts
│   │   ├── sequence/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── class/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── state/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── pie/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── sankey/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── quadrant/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── xychart/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── radar/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── gantt/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── timeline/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── er/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── mindmap/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── treemap/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── venn/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── journey/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── architecture/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   ├── block/
│   │   │   ├── ir-types.ts
│   │   │   ├── parser.ts
│   │   │   └── generator.ts
│   │   └── kanban/
│   │       ├── ir-types.ts
│   │       ├── parser.ts
│   │       ├── generator.ts
│   │       ├── frontmatter.ts     ← 先頭 `---...---` frontmatter の分離・温存 + `config.kanban.ticketBaseUrl` の狙い撃ち読み書き（YAML 依存なしのテキストパッチ、他のキーは無改変で温存）
│   │       └── meta.ts            ← カードの `@{ ticket, assigned, priority }` メタデータの構造化 read/write（`metaRaw` 文字列が正、未知キーは温存）
│   ├── ui/                        ← React コンポーネント（obsidian 非依存）
│   │   ├── MermaidEditor.tsx      ← 図種に応じてエディタを切り替えるルート（空ソース時は DiagramKindPicker）
│   │   ├── EditorShell.tsx        ← 非 flowchart 全エディタ共通の外殻（ドラッグ可能 toolbar + プレビュー + コードペイン + Undo/Redo 履歴）
│   │   ├── EditorActions.tsx      ← Undo / Redo / SVG エクスポートボタン共通コンポーネント（flowchart Toolbar と EditorShell が共用）
│   │   ├── EditorHostContext.tsx  ← ホスト能力（onExportSvg 等）と i18n 辞書（`t`）を React context で全エディタに供給。MermaidEditor が EditorHostProvider でラップ。`useT()` で辞書を取得
│   │   ├── i18n/
│   │   │   ├── ja.ts               ← 日本語辞書（形状の正＝これが唯一のソース。他言語はこの shape に合わせる）
│   │   │   ├── en.ts               ← 英語辞書。`typeof ja` で型付けし、キー欠落やshape不一致をコンパイルエラーにする
│   │   │   └── index.ts            ← `Locale` 型・`resolveLocale()`（ja 以外は en にフォールバック）・`translationsFor()`
│   │   ├── DiagramKindPicker.tsx  ← 新規作成時の図種選択 UI（Favorites ★ / それ以外はフラットな一覧、タイルはドラッグで自由に並べ替え可能、テンプレートプレビュー付き）
│   │   ├── FlowchartEditor.tsx
│   │   ├── SourceOnlyEditor.tsx   ← GUI 未対応図種のフォールバック
│   │   ├── EditorContext.tsx
│   │   ├── adapter.ts             ← IR ↔ ReactFlow ブリッジ（flowchart 用）
│   │   ├── keyboard.ts
│   │   ├── canvas/
│   │   │   ├── FlowCanvas.tsx
│   │   │   ├── FlowchartCanvasControls.tsx ← canvas 左上の Editor edge / Auto-layout パネル
│   │   │   ├── ShapeNode.tsx
│   │   │   ├── SubgraphNode.tsx   ← NodeResizer でリサイズ可能。セッション内 subgraphFrames に座標を保持
│   │   │   └── edgeActions.ts
│   │   ├── panels/
│   │   │   ├── Palette.tsx        ← flowchart 用。Direction / Subgraph / Shapes
│   │   │   ├── TextPane.tsx
│   │   │   └── PropertyPanel.tsx
│   │   ├── toolbar/
│   │   │   └── Toolbar.tsx        ← flowchart 用トップバー。Undo/Redo/Export/Save/Cancel のみ
│   │   ├── sequence/
│   │   │   └── SequenceEditor.tsx
│   │   ├── class/
│   │   │   └── ClassEditor.tsx
│   │   ├── state/
│   │   │   └── StateEditor.tsx
│   │   ├── pie/
│   │   │   └── PieEditor.tsx
│   │   ├── sankey/
│   │   │   └── SankeyEditor.tsx
│   │   ├── quadrant/
│   │   │   ├── QuadrantEditor.tsx
│   │   │   └── QuadrantInteractivePreview.tsx   ← プレビュー上でポイントを直接ドラッグできる SVG エディタ
│   │   ├── xychart/
│   │   │   └── XYChartEditor.tsx  ← 全幅の操作可能 SVG プレビュー + 縦向き Excel ライクテーブル（カテゴリ/値の直接編集、TSV ペースト対応）。バー・折れ線ノードともどこをドラッグしても値変更でき（ダブルクリックはどこでも有効）、ドラッグでの変更幅は整数単位にスナップ、小数値はダブルクリックでの直接入力でのみ指定する。y-axis min/max と表の値セルには quadrantChart と同じ意匠のフラットな増減ステッパー（`.mge-xy-num-*`）を装備。プレビューは `ir.orientation`（vertical/horizontal）に完全追従し、`categoryCenter(row)` / `valueCoord(value)` / `pointFor(row, value)` という向き非依存の座標ヘルパー（カテゴリ軸は vertical で x、horizontal で y、値軸はその逆）を介して棒・折れ線・グリッド・ラベル・ドラッグ判定（`valueForClient` は horizontal 時に clientX、vertical 時に clientY を読む）を共通化している。カテゴリ（行）の並べ替えは gantt の `reorderItem`/`targetRowFromPoint` パターンを踏襲した `reorderCategory(from, to)`（categories と全 series の values を同時に splice-move してrow整合を保つ）で、プレビュー側のドットグリップ（`.mge-xy-row-handle-group`）とテーブル側のドラッグハンドル（`.mge-xy-table-row-handle`）の双方から共有駆動する。行のキーは `cat-${row}`（位置ベース、カテゴリ固有IDではない）ため、並べ替え中に DOM ノードが再マウントされず `setPointerCapture` がそのまま保持される
│   │   ├── radar/
│   │   │   └── RadarEditor.tsx
│   │   ├── gantt/
│   │   │   └── GanttEditor.tsx        ← 表形式エディタ + 操作可能 SVG ガントプレビュー（axisFormat、依存線 DnD、Delete、Excel 風キーナビ）
│   │   ├── timeline/
│   │   │   └── TimelineEditor.tsx
│   │   ├── er/
│   │   │   └── ERDiagramEditor.tsx
│   │   ├── mindmap/
│   │   │   └── MindmapEditor.tsx
│   │   ├── journey/
│   │   │   └── JourneyEditor.tsx
│   │   ├── architecture/
│   │   │   └── ArchitectureEditor.tsx
│   │   ├── block/
│   │   │   └── BlockEditor.tsx
│   │   └── kanban/
│   │       ├── KanbanEditor.tsx             ← kanban 専用エディタ（EditorShell + previewOverride + sidePanel）。`sourceInitiallyOpen` でソース欄をデフォルト表示にし、frontmatter の `ticketBaseUrl` と選択中カードの `ticket`/`assigned`/`priority` を `KanbanOptionsPanel` に橋渡しする
│   │       ├── KanbanOptionsPanel.tsx       ← `EditorShell` の `sidePanel` に渡す、プレビュー〜ソース欄の縦幅いっぱいに常時表示される「詳細設定」パネル。ボード設定（ticketBaseUrl）と選択中カードのメタデータ（ticket/assigned/priority）を編集する。Mermaid の kanban には列/カード任意色の指定機能が無いため、「色」に相当する唯一の GUI 操作は priority セレクトになる
│   │       ├── priority.ts                  ← `KanbanOptionsPanel` と `KanbanInteractivePreview` が共有する priority の表示ラベルキー・アクセントカラー用スラッグ（priority の視覚表現はカード左端ボーダーの色のみで、バッジやグリフは持たない）
│   │       ├── KanbanInteractivePreview.tsx ← DOM ベースドラッグボード。列ヘッダー / 各タスクの専用ドットグリップ（クリック選択・ダブルクリック編集・削除ボタンとは独立）でカラム・タスクを並べ替え。ドラッグ追跡は `setPointerCapture` ではなく window レベルの pointermove/up リスナー（`DiagramKindPicker` と同じ理由: 安定キー付きノードの並べ替えで DOM 位置が動くと Chromium がキャプチャを暗黙解除しゴーストが固まる）。列・タスクいずれの入れ替え判定も、カーソル位置ではなく「ドラッグ中の要素自身の仮想矩形（カーソル − 掴んだ時のオフセット。列は左端、タスクも左端のハンドルで掴むため、カーソル位置そのものは要素の中心からズレている）」を基準にする。仮想矩形が隣接する列・タスクの自分のサイズ（列=幅／タスク=高さ）の 50%（`SWAP_ENTER_RATIO`）以上と重なって swap し、いま swap した相手は重なりが 30%（`SWAP_EXIT_RATIO`）を割るまで再トリガー対象から外す 2 閾値ヒステリシス（`isSwapArmed` / シュミットトリガー）。1 閾値（50% のみ）だと、カーソルが閾値ちょうど付近で静止したときの微小なポインタ揺れだけで比率が 50% を跨ぎ続け、逆方向へ即座に再 swap してちらつく問題が実機で再現したため、[30%,50%) を「何も起きない帯」として明示的に設けている。列を跨ぐタスク移動も同じロジック（横方向の重なりで隣接列に入ったかを判定し、その列内での挿入位置はドラッグ中タスクの垂直中心と既存タスクの中心を比較して決める）。連続する判定の間には最小カーソル移動量（`REORDER_THRESHOLD_PX`）の粗いスロットルも別途入れている。ドラッグ中はポインタに追従するゴーストが浮遊し（`position: fixed` の基準原点をドラッグ開始時に実測して補正するため、モーダルの配置状態に依らず正しくカーソルに追従する）、他の兄弟要素は FLIP（`useFlip`）でアニメーション付きに新しい位置へ移動する。カード本体は `.mge-kanban-card-row`（ハンドル・タイトル・削除ボタン）と、ある場合のみ表示される `.mge-kanban-card-meta-row`（ticket/assigned）の縦積み構造（`.mge-kanban-card` は `flex-direction: column`）。この2段構成は、1本のラップ可能な横並びフレックス行に長いタイトルを混ぜるとフレックスの折返し判定が「実際に折り返した後の幅」ではなく「折り返さなかった場合の幅」で行われてしまい、ハンドルだけが単独で1行目に取り残される表示崩れが起きたための修正（タイトル行と meta 行を別の縦積み子要素に分離すれば折返し判定自体が発生しない）。カードに `ticket`/`assigned` が設定されていると `readCardFields` で読み取った値を `.mge-kanban-card-meta-row` に描画する（ticket は `ticketBaseUrl` があればクリック可能なリンクバッジ、assigned はイニシャル化せず氏名をそのままテキスト表示。実際の Mermaid レンダリングに合わせた）。priority はバッジやグリフを持たず、カード左端ボーダーの色のみで表現する（Mermaid の kanban に任意色指定機能が無いため、色で表現できるのはこの1箇所のみという判断）。詳細設定パネルでの編集内容が即座にボード上のカード表示にも反映される
│   │       └── identity.ts                  ← カード/カラムに WeakMap ベースの安定 UI 識別子を付与（React key・FLIP・ドラッグ対象特定に使用。Mermaid の `id[...]` とは無関係）
│   └── obsidian/                  ← Obsidian API 固有レイヤ
│       ├── EditorModal.ts         ← Modal の生成・toolbar ドラッグ / ダブルクリック最大化 / 最大化ドラッグ復元・四隅リサイズハンドル。`detectLocale()` を呼び `locale` を MermaidEditor に渡す
│       ├── locale.ts              ← `getLanguage()`（obsidian、1.8.7〜）でモーダルを開くたび言語を判定する `detectLocale()`
│       ├── ReactHost.tsx          ← createRoot / unmount ライフサイクル管理
│       ├── postProcessor.ts      ← Reading view ブロック装飾
│       ├── commands.ts           ← コマンドパレット & 右クリックメニュー登録（既存ブロック編集 / 新規挿入）
│       ├── editorExtension.ts    ← Live Preview CM6 拡張
│       ├── mermaidRender.ts      ← Mermaid 描画のテーマ追従ヘルパ（modal preview / reading view 共通）
│       ├── svgExport.ts
│       └── io.ts                 ← vault/editor IO adapter
├── tests/
│   ├── core/
│   │   ├── parser.test.ts
│   │   ├── generator.test.ts
│   │   ├── store-factory.test.ts
│   │   ├── diagram-kind.test.ts
│   │   ├── sequence-parser.test.ts
│   │   ├── sequence-generator.test.ts
│   │   ├── class-parser.test.ts
│   │   ├── class-generator.test.ts
│   │   ├── state-parser.test.ts
│   │   ├── state-generator.test.ts
│   │   ├── pie-parser.test.ts
│   │   ├── pie-generator.test.ts
│   │   ├── sankey-parser.test.ts
│   │   ├── sankey-generator.test.ts
│   │   ├── quadrant-parser.test.ts
│   │   ├── quadrant-generator.test.ts
│   │   ├── xychart-parser.test.ts
│   │   ├── xychart-generator.test.ts
│   │   ├── radar-parser.test.ts
│   │   ├── radar-generator.test.ts
│   │   ├── gantt-parser.test.ts
│   │   ├── gantt-generator.test.ts
│   │   ├── timeline-parser.test.ts
│   │   ├── timeline-generator.test.ts
│   │   ├── kanban-parser.test.ts
│   │   ├── kanban-generator.test.ts
│   │   ├── kanban-frontmatter.test.ts
│   │   ├── kanban-meta.test.ts
│   │   └── adapters.test.ts
│   └── ui/
│       ├── adapter.test.ts
│       ├── edge-actions.test.ts
│       └── keyboard.test.ts
├── docs/
│   ├── requirements.md
│   ├── obsidian-plugin-spec.md
│   └── mermaid-diagram-types.md
├── backlog/
│   ├── backlog.md
│   └── Mermaid種別拡張タスク.md
└── _legacy/
    └── web/                       ← 旧 Web 版の遺物。参考保管のみ
        ├── App.tsx
        ├── editorStore.ts
        ├── exportSvg.ts
        ├── fileIO.ts
        ├── main.tsx
        ├── vite-env.d.ts
        ├── index.html
        ├── vite.config.ts
        ├── tsconfig.app.json
        ├── tsconfig.node.json
        └── public/
            └── favicon.svg
```

---

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

逆方向の依存を作りたくなったら、設計が間違っているサイン。先に IR / store / プロパティで橋渡しできないか考える。

---

## アダプタアーキテクチャ

図種ごとの parse / generate ロジックは `src/core/adapters/` に隔離されたアダプタとして実装する。

| ファイル | 役割 |
| --- | --- |
| `src/core/diagram-kind.ts` | `detectDiagramKind(source)` で図種を識別 |
| `src/core/adapters/types.ts` | `DiagramAdapter<TIR>` インターフェイス（`kind`, `supportsGui`, `parse`, `generate`） |
| `src/core/adapters/index.ts` | `getAdapter(kind)` レジストリ |
| `src/core/diagram-ir.ts` | `DiagramIR` 判別 union |

**登録済み図種（Phase 1–10 + kanban 完了）**：flowchart / sequenceDiagram / classDiagram / stateDiagram-v2 / stateDiagram / pie / sankey-beta / quadrantChart / xychart-beta / radar-beta / gantt / timeline / erDiagram / mindmap / treemap-beta / venn-beta / journey / architecture-beta / block-beta / kanban の **20 種**。`supportsGui: false` のアダプタ（treemap-beta / venn-beta）または未登録の図種は `src/ui/SourceOnlyEditor.tsx` にフォールバックする。radar-beta / venn-beta は Obsidian 内蔵 Mermaid が非対応のため GUI 編集は可能だがプレビューは描画されない。treemap-beta は Obsidian 内蔵 Mermaid 非対応のため Source-only 提供。kanban は Obsidian 内蔵 Mermaid が対応しているため完全なプレビュー付き GUI 編集が可能。

`detectDiagramKind` は先頭の `---\n...\n---` frontmatter ブロックを **kanban に限定して** スキップし、その後ろの `kanban` キーワードを検出する（`src/core/diagram-kind.ts` の `FRONTMATTER_RE`）。他の図種の frontmatter 対応は意図的に見送っている：全エディタの `seed()` は初回パース失敗時に**空の IR**へフォールバックする実装のため、frontmatter を理解しない図種のパーサに frontmatter 付きソースを渡すと、気づかず保存した際に元の内容が失われるリスクがある。frontmatter 付きで未対応の図種は今まで通り `SourceOnlyEditor` に安全側でフォールバックさせる。新たに frontmatter 対応を追加するときは、この安全策を壊さないこと。

### 新図種の追加手順

1. `src/core/<kind>/ir-types.ts` / `parser.ts` / `generator.ts` を実装
2. `src/core/adapters/<kind>.ts` で `DiagramAdapter` を実装
3. `src/core/adapters/index.ts` のレジストリに登録
4. `src/core/diagram-ir.ts` の `DiagramIR` union に variant を追加
5. GUI が必要なら `src/ui/<kind>/<Kind>Editor.tsx` を実装して `MermaidEditor.tsx` に組み込む（**`EditorShell` を経由すること**。後述の共通シェル契約を遵守）
6. **本ファイル（`AGENTS.md`）・`docs/obsidian-plugin-spec.md`・`docs/mermaid-diagram-types.md` を更新する**

---

## 共通エディタシェル（EditorShell）

flowchart を除く全ての専用エディタは `src/ui/EditorShell.tsx` を root として使う。シェルは 4 つの責務を一手に引き受ける：

1. **ドラッグ可能な toolbar** — `.mge-toolbar` クラスを付けたヘッダを描画する。`EditorModal` の delegated mousedown handler がこれを検知し、modal を移動させる。専用 toolbar をエディタ側で再実装してはいけない（drag 対象が外れる）。toolbar には `src/ui/EditorActions.tsx` の Undo / Redo / SVG エクスポートボタンが組み込まれており、`src/ui/toolbar/Toolbar.tsx`（flowchart 用）と同じコンポーネントを共用する。
2. **Mermaid ソース文字列の Undo/Redo 履歴** — EditorShell 内部でソース文字列のスタックを管理し、`Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z` で操作を取り消し・やり直せる。flowchart の store-backed undo とは別個に実装されている。
3. **ライブ Mermaid プレビュー** — 親から渡された `renderMermaid(source)` を使い、IR の更新ごとに最新の Mermaid SVG を再描画する。`EditorModal` からは `src/obsidian/mermaidRender.ts` の `renderMermaidThemed` が注入される。同 helper は Obsidian の `theme-dark` クラスを見て `mermaid.initialize({ theme })` を切り替えるため、ライト/ダーク両方で文字色が追従する。Reading view の `postProcessor.ts` も同じ helper を経由するので、プレビューの見た目はモーダルと一致する（#37）。
4. **コードペイン** — 生成中のソースを textarea に同期表示する。`onSourceEdit` を渡すと編集可能になり、ユーザーのキーストロークごとに `parse<Kind>(next)` を呼んで IR を差し替える。draft state がユーザーの正確な入力を保持し続け、blur で IR から再生成された canonical 形に戻る。parse 失敗時はインラインの error バッジ（赤）が出るだけで IR は据え置く。
5. **パネル比率の永続化** — side ratio（`--mge-side-ratio`）と preview ratio（`--mge-preview-ratio`）はドラッグ確定時に `src/ui/layoutPrefs.ts` 経由で `localStorage` に保存され、次回モーダルを開いたときに復元される。キーは必須 prop `diagramKind`（`DiagramKind`）で名前空間化されており、図種ごとに独立して幅・高さの好みを保持する（ある図種で広げても他の図種には影響しない）。flowchart 専用の `TextPane`（ソースペイン高さ `--mge-text-pane-height`）も同モジュールで同様に永続化するが、flowchart は単一エディタなので図種別のキー分けは不要。保存済みの好みがまだ無い場合の初期比率は、任意 prop `defaultSideRatio` / `defaultPreviewRatio` でエディタ側から上書きできる（例: `QuadrantEditor` はグラフィカルなプレビューを広く見せたいので 0.55 / 0.68 を指定）。未指定時は共通の `SIDE_DEFAULT`(0.42) / `PREVIEW_DEFAULT`(0.58) にフォールバックする。

`layout="stacked"` には任意 prop `sidePanel`（`ReactNode`）もある。渡すと `.mge-editor-shell-stacked` の CSS Grid に `sidepanel` という列を追加し、そこに常時表示のフルハイト右パネルを配置する（`grid-template-areas` で preview / preview-resizer / body の3行を縦断する1列として定義。`toolbar` 行だけは2列にまたがる）。設定系 UI をプレビュー下の `children` ではなく常時見える右パネルに置きたいとき（kanban の `KanbanOptionsPanel` が最初の利用例）に使う。`sidePanel` を渡すエディタは `children` に実質何も残らないことが多いため、`.mge-has-sidepanel` 修飾クラスが `children` 用の `.mge-editor-main-content` を非表示にし、ソース欄（`sourceOpen` 時）がその行を全幅で使うよう CSS 側で調整している。**この非表示化は `sidePanel` を持つエディタは `children` を使わない前提の割り切り**なので、将来 `sidePanel` と実質的な `children` を両方使うエディタを追加するときはこの結合を見直すこと。`sidePanel` を使わない既存の stacked エディタ（gantt / xychart / block）の見た目・DOM構造は無変更。

各 `<Kind>Editor` は次のシグネチャを満たす：

```tsx
<EditorShell
  diagramKind="pie"                 // このエディタが担当する DiagramKind リテラル（パネル比率のキーに使う）
  currentSource={generate(ir)}      // IR から都度生成。useMemo 推奨
  onSave={async () => onSave(...)}
  onCancel={onCancel}
  saving={saving}
  renderMermaid={props.renderMermaid}
  previewOverride={/* グラフィカル編集が必要なら独自プレビューで上書き */}
  previewUnavailableMessage={/* Mermaid が非対応な図種 (radar 等) のメッセージ */}
  onSourceEdit={(next) => {        // コードペインからの編集を受け取る
    const outcome = parse(next);
    if (!outcome.ok) return { ok: false, error: outcome.message };
    setIr(outcome.ir);            // class/state では rawItems も state 化して setRawItems
    return { ok: true };
  }}
>
  {/* フォーム / リスト等 */}
</EditorShell>
```

- **数値入力欄のみで構成しない**。プレビュー上でグラフィカルに操作できるなら `previewOverride` で SVG エディタを差し込み、ドラッグやハンドルで直接編集する経路を提供する（例: `QuadrantInteractivePreview`、Gantt のバー移動/リサイズ/ラベル編集）。フォームは補助。
- **`onSourceEdit` は再 parse を伴う**ため、未対応構文を `rawLines` / `rawItems` 経由で round-trip させているエディタ（class / state）は当該配列も `useState` で管理し、再 parse の結果で必ず置き換える。closure-captured な const のままだとコードペイン経由の編集で raw 行が消えてしまう。
- 共通シェルの toolbar の見た目を変えたければ `toolbarExtras` slot を使う。`<header>` の DOM 構造には触れない。
- flowchart は React Flow canvas そのものがグラフィカルプレビューなので `EditorShell` を使わず `mge-app-shell` の独自レイアウトを維持する。例外として扱う。コード編集は既存の `src/ui/panels/TextPane.tsx`（store の `setText` / `commitText` 経由、debounce ありの blur commit）に集約し、`Sort source by canvas` で Mermaid の node / subgraph / edge 出力順を明示的に整列できる。ノードの並び順はエッジから求めたグラフ上のrank（根からの最長距離。`src/core/store-factory.ts` の `computeGraphRanks`）を第一キーとし、rankが同じノード同士（同階層の兄弟）だけをcross-axis座標（TD/BT系はx、LR/RL系はy）で並べる。ピクセル座標だけで比較しないため、兄弟ノードの高さ（TDの場合）がわずかにズレていても左右の意図した並びが崩れない。並べ替えと同時に Auto-layout（Dagre）も同一コミットで実行し、ソース順とキャンバス座標を1回のUndo単位で揃える。Direction / Subgraph は `src/ui/panels/Palette.tsx` の Shapes 上部に置き、Editor edge / Auto-layout は `src/ui/canvas/FlowchartCanvasControls.tsx` で canvas 左上に表示する。`src/ui/toolbar/Toolbar.tsx` は Undo/Redo/Export/Save/Cancel のみ保持する。キャンバスコンテナのリサイズ時は、リサイズ前の画面中心にあった flow 座標をリサイズ後も中心に保つ。ただし Modal 最大化 / 復元の transition 中は viewport 補正を保留し、transition 終了後に1回だけ補正する。Subgraph 選択時の右ペインでは `direction` を `(inherit)` / TD / LR / BT / RL から編集でき、変更は Mermaid の `direction ...` とキャンバス上の局所レイアウトの両方に反映される。ノード選択時の右ペインには接続 edge 一覧を表示し、重なって掴みにくい edge も一覧から選択・削除・接続先変更できる。選択済み edge は canvas 上でも前面化し、edge reconnect は選択済み edge が1本かつヒットした edge と固定端点を共有する場合、その選択済み edge を操作対象にする。Auto-layout は各 subgraph 内を先にレイアウトして表示上の subgraph frame と同じサイズの box として外側の Dagre に渡す。Subgraph endpoint の edge はその box へ接続されるため、個別条件ごとの距離補正は行わない。
- **ホスト能力の注入** — `src/ui/EditorHostContext.tsx` の `EditorHostProvider` が `onExportSvg` 等のホスト能力と i18n 辞書（`t`）を React context 経由で全エディタに供給する。`MermaidEditor` が最上位で `EditorHostProvider` をラップするため、各エディタは prop drilling なしに能力を取得できる。
- `SourceOnlyEditor`（treemap-beta / venn-beta / 未対応図種の共通フォールバック）だけは `diagramKind` をリテラルで固定せず、`MermaidEditor.tsx` が `detectDiagramKind` で判定した実際の kind を prop で受け取って転送する。1 コンポーネントが複数図種を跨ぐため、リテラル固定だとパネル比率がそれらの図種間で共有されてしまう。

---

## i18n（日本語・英語の動的切り替え）

GUI の表示言語は Obsidian 本体の言語設定に連動する。併記ではなく、判定した1言語だけを表示する。

- **言語判定** — `src/obsidian/locale.ts` の `detectLocale()` が Obsidian 公式 API `getLanguage()`（`obsidian` パッケージ、v1.8.7〜。本プラグインの `minAppVersion` もこれに合わせて 1.8.7 に引き上げ済み）を呼ぶ。`ja` ならそのまま、それ以外（`en` を含むあらゆる ISO コード、および「システム既定」時の `getLanguage()` の既定値である `en`）はすべて英語にフォールバックする（`src/ui/i18n/index.ts` の `resolveLocale()`）。判定は **モーダルを開いた瞬間に1回だけ**行い、以降はその結果を使う（設定変更へのライブ追従はしない）。
- **辞書の実体** — `src/ui/i18n/ja.ts` が唯一のソース（shape の正）。`src/ui/i18n/en.ts` は `typeof ja` で型付けされており、キーの欠落・型不一致（例: 補間が要る文字列に `(n) => ...` 関数を書き忘れる）はコンパイルエラーになる。図種テンプレートの説明文（`src/core/templates.ts` の `description`）は core 層に留め、UI 側の `ja.templateDescriptions` / `en.templateDescriptions`（`DiagramKind` キー）が英語版を上書きする形にしてある — core は Obsidian にも React にも依存しないという層構造を、翻訳のために崩さないため。
- **供給経路** — `EditorModal.onOpen()` → `detectLocale()` の結果を `MermaidEditor` の `locale` prop（省略時は `"ja"` = 従来どおりの挙動）に渡す → `MermaidEditor` が `translationsFor(locale)` で辞書を解決し、`EditorHostProvider` の `value.t` として全エディタに配る → 各エディタ・各サブコンポーネントは `useT()`（`src/ui/EditorHostContext.tsx`）でその辞書を取得し、`t.kanban.addCard` のように直接参照する。`DiagramKindPicker` も含め、`MermaidEditor` が返す JSX 全体を単一の `EditorHostProvider` でラップしてある。

### 新しい文字列を足すとき

1. `src/ui/i18n/ja.ts` に日本語の値を追加する（適切な namespace に。新しい図種なら新しい namespace を切る）。
2. `src/ui/i18n/en.ts` に同じキーで英語を追加する。`typeof ja` 型チェックにより、追加を忘れると `tsc` がそこで止まる。
3. コンポーネント側で `useT()` を呼び、`t.<namespace>.<key>` を参照する。数値等を埋め込む文字列は `ja.ts`/`en.ts` 側で `(n: number) => \`...\`` の関数として定義し、呼び出し側は `t.xychart.seriesLabel(n)` のように呼ぶ（文字列の断片を組み合わせて文を作らない — 日英で語順・活用が異なるため）。
4. 複数箇所で完全に同じ文言を再利用する場合のみ `common` namespace に置く。似ているが意味の異なる文言（例: 「クラスなし」と「関係なし」）は共有しない。

---

## 新規作成フロー（blank-state）

既存ブロックを編集する経路に加えて、**まっさらな状態から GUI で作り始める**経路がある。エントリポイントは 2 つ：

1. **エディタ右クリック → "Insert new Mermaid diagram (GUI)"** — `main.ts` の `editor-menu` ハンドラから `openModalForNewBlock()` を呼ぶ。
2. **コマンドパレット → "Insert new Mermaid diagram (GUI)"** — 同じ関数を呼ぶ。

`openModalForNewBlock()` は `EditorModal` を **空ソース**で開く。`MermaidEditor` は `initialSource.trim().length === 0` を見て `DiagramKindPicker` をレンダリングする。ユーザーが種別を選ぶと、`src/core/templates.ts` のテンプレートが `seeded` state に格納され、その文字列を起点に通常の図種別エディタが立ち上がる。Save が押されたら、`commands.ts` の `insertNewMermaidFence()` が現在のカーソル位置に新しい `\`\`\`mermaid` フェンスを挿入する。

### 新しい図種テンプレートを足すとき

`src/core/templates.ts` の `DIAGRAM_TEMPLATES` 配列にエントリを追加する：

- `kind` は `DiagramKind` の値
- `source` は **最小だが parser が通る** Mermaid テキスト（テストで保証）。動的に日付を生成する場合は `source` の代わりに `templateSource()` ヘルパ関数として定義できる。gantt テンプレートはこの形式を採用し、今日の日付から約 3 ヶ月先のタスク・依存・マイルストーン・`axisFormat %m/%d` を動的に生成する。
- `supportsGui: true` を立てるのは bespoke エディタがある図種だけ。`false` だと `SourceOnlyEditor` 経由になるが、テンプレートピッカーには出てよい
- `DiagramKindPicker` は `DIAGRAM_TEMPLATES` の配列順を初期表示順として使う。新規テンプレートを挿入する位置がそのまま初期表示順になる点に注意する。グラフィカルな直接操作エディタを持つ図種（flowchart / quadrantChart / gantt / block-beta / kanban / xychart-beta）は配列先頭にまとめてある。
  - ユーザーはタイル左上のグリップハンドルをドラッグして表示順を自由に並べ替えられる（`mge-kind-order` として localStorage に永続化）。並べ替えは `DiagramKindPicker.tsx` の `reorderKind` が担い、保存済み順序と `DIAGRAM_TEMPLATES` を `mergeOrder()` でマージする（新規テンプレートは末尾に追加、削除されたテンプレートは無視）。
  - **Favorites ★**（`mge-pinned-kinds`）は独立した永続キーで、ピン留めした図種を別セクションとして先頭に固定表示する。ピン内・ピン外それぞれの並び順は上記のドラッグ順序に従う。

テンプレートは `tests/core/templates.test.ts` が次の不変条件を検証する：

- `detectDiagramKind(template.source) === template.kind`
- `getAdapter(kind).parse(template.source).ok === true`（adapter が GUI 対応のとき）

新規追加時にここに引っかかったら、テンプレートの構文を見直す。フィクスチャを増やすのではなく**テンプレート自体を直す**。

---

## ファクトリ化された store の意味

旧 Web 版は `useEditorStore = create<...>(...)` のモジュールトップレベル singleton だった。プラグイン化に当たって `src/core/store-factory.ts` の `createEditorStore()` で**呼び出しごとに独立 store を返す**ファクトリへ書き換えてある（仕様 §6.3）。

- 1 ノートに mermaid ブロックが複数あっても状態が混線しない
- Modal / 専用ビュー / 将来のインライン GUI それぞれが自分の store を持つ
- 必ず `useMemo(() => createEditorStore(), [])` で生成し、React のライフサイクルに乗せる
- React 側からは `src/ui/EditorContext.tsx` の `EditorStoreProvider` / `useEditorStore` / `useEditorStoreApi` 経由でアクセスする。`useStore(api, selector)` を直接呼ぶケースは原則ない。

---

## rawLines 戦略は壊さない

parser が理解できない行は `MermaidIR.rawLines` に温存され、generator がそのまま再出力する。これが「既存ノートを破壊しない」契約の根拠。**全図種に共通して適用される。**

- `classDef` / `style` / `linkStyle` / `click` は **IR 化しない**（仕様 §5.1）。
- 新しい構文に対応したくなったら、まず raw として生き残ることを確認 → 必要なら IR 化。逆順でやらない。

---

## 書き戻しの安全装置

`src/obsidian/io.ts:writeBlockBack` は `vault.modify` する前に必ず：

1. `info.lineStart` の行が `^\s*\`\`\`mermaid\b` にマッチするか
2. `info.lineEnd` の行が `^\s*\`\`\`\s*$` にマッチするか

を再検証する。ユーザーが Modal を開いている間にノートを編集した場合に、ズレた範囲を上書きして他の行を破壊するのを防ぐため。失敗時は throw して呼び出し側（`EditorModal`）が Notice で通知する。**この検証を外したり緩めたりしてはいけない**（仕様 §9 のリスク表に明記された対策）。

---

## ビルドの仕組み

`esbuild.config.mjs` が以下を担う：

- `main.ts` を CJS の単一バンドル（`main.js`）に
- `obsidian` / `electron` / `@codemirror/*` / `@lezer/*` / Node 組込モジュールは external
- `loader: { ".css": "empty" }` — JS 側の CSS import はビルド時に no-op
- `styles.src.css`（著者管理）と `node_modules/@xyflow/react/dist/style.css` を結合して `styles.css` を生成

`mermaid` 本体はバンドルしない。Obsidian 内蔵の `loadMermaid()` を使う（仕様 §6.2）。`@xyflow/react` / `react` / `react-dom` / `zustand` / `@dagrejs/dagre` はバンドルされる。

`main.js` と `styles.css` はビルド成果物なので `.gitignore` に入れてある。リリース時は別途 zip にまとめる。

### 開発コマンド

| コマンド | 用途 |
| --- | --- |
| `npm install` | `package-lock.json` から依存関係をインストール |
| `npm run dev` | esbuild watch モードで起動、保存のたびに `main.js` / `styles.css` を再生成 |
| `npm run build` | TypeScript チェック後、`main.js` と `styles.css` をビルド |
| `npm run typecheck` | `tsc -noEmit` のみ実行 |
| `npm test` | Vitest スイートを一度実行 |
| `npm run test:watch` | Vitest を watch モードで実行 |

---

## CSS のお作法

- 全クラスに `mge-` プレフィックスを付ける（仕様 §9 のリスク対策）。Obsidian テーマや他プラグインと衝突させない。
- 色はハードコードせず、Obsidian のテーマ変数（`--background-primary`, `--text-normal` 等）をフォールバック付きで参照。
- `.mge-app-shell` の中で CSS 変数を再定義してテーマ変化に追従させている。
- **モーダルの開閉アニメーションは opacity のみに固定する（`transform: scale()` を持ち込ませない）**。`.mge-modal` は `styles.src.css` で opacity フェードの `@keyframes mge-modal-open` を `animation ... !important` で当て、コミュニティテーマ（例: "Transparent"）の `.modal` に対する `scale()` 開閉アニメーションを無効化している。理由: React Flow はノード/ハンドルの座標を `getBoundingClientRect()` で計測し、この値は**祖先要素の transform を巻き込む**。モーダルが `scale()` の最中に計測されると flowchart のエッジがハンドルからズレて固定される（ドラッグや Auto-layout で「直る」ように見えるのは、それらが再計測を強制するだけで座標データ自体は最初から正しいため）。祖先の transform を再計測で後から補正するのではなく、そもそも scale を持ち込ませない方針を採る。詳細な調査記録は [[tech-reactflow-ancestor-transform-measurement]]。同種の落とし穴は自作 SVG の座標マッピング（quadrant / gantt 等）でも起こりうるので、テーマ依存の表示崩れは祖先の transform を最初に疑う。
- **特定のコミュニティテーマ名でだけ挙動を変えたいとき**は `src/obsidian/EditorModal.ts` の `isTransparentThemeActive()` のように、未公開 API `app.customCss.theme`（有効なコミュニティテーマ名の文字列。デフォルトテーマ時は空/undefined）を読んで `modalEl` にマーカークラス（例: `.mge-theme-transparent`）を付与し、CSS 側は `.mge-theme-transparent .mge-kanban-card { ... }` のように**そのクラス配下でのみ**上書きする。`--background-*` 系変数をテーマが意図的に透明化しているケース（Transparent テーマ）で境界線が消える問題はこの方法で対処し、他のテーマの見た目には一切触れない。

---

## 動作確認のショートカット

```bash
npm run dev
```

を回しつつ、vault の `<vault>/.obsidian/plugins/mermaid-gui-editor/` に対して **junction**（Windows: `New-Item -ItemType Junction`）でリポジトリ直下を貼ると、保存即反映できる。`Ctrl+R` で Obsidian をリロード。

**`src/` を編集したら、ユーザーに動作確認を促す前に必ず `main.js` / `styles.css` が最新化されているか確認する。** `npm run dev` がバックグラウンドで動いていない状態（このセッションでは既定）で `Edit`/`Write` だけ行うと `main.js` は古いままで、Obsidian が何度リロードしても変更が反映されない（実際に発生した事故）。

- `npm run dev` を watch で回していないなら、ソース変更後に毎回 `npm run build` を実行してから「リロードして確認して」と伝える。
- `ls -la main.js styles.css` 等でタイムスタンプが直近の編集より新しいことを確認してから完了報告する。
- watch を回している場合でも、esbuild のエラーで再生成が止まっていないか出力を確認する。

---

## コーディング規約

- TypeScript strict モードを使う。`src/core/` では小さな純粋関数を好む。
- React コンポーネントは PascalCase のファイル名、フックとコールバックは camelCase。
- CSS クラスは `mge-` プレフィックス必須。
- Mermaid のラウンドトリップ挙動を保持する。未対応構文は `rawLines` に温存し、絶対に脱落させない。
- GUI 専用状態は `%% gui:*` コメントに格納し、Mermaid レンダリング前に取り除く。

---

## テスト

Vitest を使用する。変更したモジュールの近くに集中したテストを追加する。

- パーサ・ジェネレータの振る舞いは `tests/core/`
- UI の射影ロジックは `tests/ui/`

**Mermaid シリアライズ・GUI メタデータ・エッジハンドル・座標・パーサ対応を変更したときは必ずラウンドトリップテストを追加する。** コミット前に `npm run typecheck` と `npm test` を実行して通過させる。

---

## コミット / PR ガイドライン

- コミットメッセージは短い命令形で書く（例: `Fix edge handle serialisation`）。
- 1 コミット = 1 つの振る舞いの変更に絞る。
- PR には「ユーザーが体験できる変更」「影響ファイル / モジュール」「テスト結果」「GUI の変更があればスクリーンショットまたは GIF」を含める。

---

## やってはいけないこと

- `mermaid` を `dependencies` に戻して自前バンドルすること（バンドルサイズと内蔵レンダラとの差分の温床）
- `editor.replaceRange` を fence 検証なしで呼ぶこと
- `useEditorStore` を `src/core` 内で参照すること（依存方向違反）
- `createEditorStore()` を呼ばずに既定 store を共有すること
- `_legacy/web/` 配下のファイルを実プラグインから import すること（旧 Web 版の遺物）
- アダプタを追加・変更したのに本ファイルと設計書を更新しないこと
- `src/ui` にユーザー向け文字列（ラベル・placeholder・aria-label・title・空状態メッセージ等）を直接ハードコードすること。`useT()` で取得した辞書（`src/ui/i18n/`）を必ず経由する
- 同一要素に `title` と `aria-label` を両方つけること。Obsidian は DOM 内の任意の要素（プラグインが生成したものも含む）の `aria-label` を見て独自のツールチップを自動描画するため、`title` も残すとブラウザネイティブのツールチップと二重表示になる（実際に発生した不具合。[Obsidian forum](https://forum.obsidian.md/t/feature-request-selectively-disable-obsidian-tooltips-using-data-attributes/106641) 参照）。ホバーヒントは `aria-label` 一本に統一し、`title` は使わない
- `main.js` / `styles.css` を直接編集すること（ソースを変更してビルドする）
- `node_modules/` をコミットすること
- `detectDiagramKind` の frontmatter 対応を kanban 以外にも汎用的に広げること。他図種のエディタは初回パース失敗時に空の IR へフォールバックする実装のため、frontmatter を理解しないパーサに frontmatter 付きソースを渡すと、気づかず保存した際に元の内容を消しかねない（詳細は「アダプタアーキテクチャ」節）。frontmatter 対応を広げるなら、対象図種のパーサ自身に frontmatter 分離・温存ロジックを実装してから detection 側を拡張すること

---

## ドキュメント同期ルール

**実装が変わったら設計書・ドキュメントも同じ PR で更新する。** コードと docs が一致している状態を常に保つ。

| 対象ファイル | 更新すべきタイミング |
| --- | --- |
| `AGENTS.md`（本ファイル） | 構造・ルール・制約が変わったとき |
| `docs/obsidian-plugin-spec.md` | アーキテクチャ・機能仕様・ディレクトリ構成が変わったとき |
| `docs/mermaid-diagram-types.md` | 図種の GUI 対応状況が変わったとき |
| `docs/requirements.md` | 機能優先度（P1/P2/P3）が変わったとき |

典型的なトリガー：新しい図種アダプタの追加、`src/` 構成の変更、TODO 項目の完了、非ゴールの境界変更。

---

## TODO ／ 未実装メモ

- 専用ビュー（`.mmd` を Mermaid GUI で開く）— 仕様 §7.2 / P1.5
- `[[wikilink]]` のクリック遷移
- 選択範囲（箇条書き）→ flowchart 生成コマンド
- Live Preview インライン GUI（CM6 WidgetType）— 仕様 P2、IME・Undo の事故が出やすいので慎重に
- 添付ファイルの保存先設定（現状はノートと同じフォルダ固定）— 仕様 §12.1 の残オープンクエスチョン
- `linkStyle` のインデックス保護 or 警告表示 — 同上
