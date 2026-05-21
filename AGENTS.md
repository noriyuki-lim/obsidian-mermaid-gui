# AGENTS.md — Mermaid GUI for Obsidian

このリポジトリは **Obsidian プラグイン単体構成**。ベースの設計と意思決定は `docs/obsidian-plugin-spec.md` に集約してある。コードに触れる前にそれと本ファイルを読む。

---

## 一行要約

`registerMarkdownCodeBlockProcessor("mermaid", ...)` で Reading view の mermaid ブロックに Edit ボタンを差し込み、Modal で React + ReactFlow + Zustand の GUI を立ち上げる。flowchart / sequenceDiagram / classDiagram / stateDiagram(-v2) / pie / sankey-beta / quadrantChart / xychart-beta / radar-beta は専用エディタを持つ（radar-beta は Obsidian 内蔵 Mermaid 非対応のためプレビュー不可）。それ以外の図種は `SourceOnlyEditor` でソースのみ表示。保存時に**当該フェンスの中身だけ**を `vault.modify` で書き戻す。ノード座標はセッション内のみ保持し、ファイルには書き出さない（標準 Mermaid 準拠）。

---

## リポジトリ構成

```
mermaid-gui-obsidian/
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
│   │   │   └── venn.ts
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
│   │   └── venn/
│   │       ├── ir-types.ts
│   │       ├── parser.ts
│   │       └── generator.ts
│   ├── ui/                        ← React コンポーネント（obsidian 非依存）
│   │   ├── MermaidEditor.tsx      ← 図種に応じてエディタを切り替えるルート（空ソース時は DiagramKindPicker）
│   │   ├── EditorShell.tsx        ← 非 flowchart 全エディタ共通の外殻（ドラッグ可能 toolbar + プレビュー + コードペイン）
│   │   ├── DiagramKindPicker.tsx  ← 新規作成時の図種選択 UI（テンプレートのプレビュー付き）
│   │   ├── FlowchartEditor.tsx
│   │   ├── SourceOnlyEditor.tsx   ← GUI 未対応図種のフォールバック
│   │   ├── EditorContext.tsx
│   │   ├── adapter.ts             ← IR ↔ ReactFlow ブリッジ（flowchart 用）
│   │   ├── keyboard.ts
│   │   ├── canvas/
│   │   │   ├── FlowCanvas.tsx
│   │   │   ├── ShapeNode.tsx
│   │   │   ├── SubgraphNode.tsx
│   │   │   └── edgeActions.ts
│   │   ├── panels/
│   │   │   ├── Palette.tsx
│   │   │   ├── TextPane.tsx
│   │   │   └── PropertyPanel.tsx
│   │   ├── toolbar/
│   │   │   └── Toolbar.tsx
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
│   │   │   └── XYChartEditor.tsx
│   │   ├── radar/
│   │   │   └── RadarEditor.tsx
│   │   ├── gantt/
│   │   │   └── GanttEditor.tsx
│   │   ├── timeline/
│   │   │   └── TimelineEditor.tsx
│   │   ├── er/
│   │   │   └── ERDiagramEditor.tsx
│   │   └── mindmap/
│   │       └── MindmapEditor.tsx
│   └── obsidian/                  ← Obsidian API 固有レイヤ
│       ├── EditorModal.ts         ← Modal の生成・toolbar ドラッグ・四隅リサイズハンドル
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

**登録済み図種（Phase 1–8 完了）**：flowchart / sequenceDiagram / classDiagram / stateDiagram-v2 / stateDiagram / pie / sankey-beta / quadrantChart / xychart-beta / radar-beta / gantt / timeline / erDiagram / mindmap / treemap-beta / venn-beta の 16 種。`supportsGui: false` のアダプタ（treemap-beta / venn-beta）または未登録の図種は `src/ui/SourceOnlyEditor.tsx` にフォールバックする。radar-beta / venn-beta は Obsidian 内蔵 Mermaid が非対応のため GUI 編集は可能だがプレビューは描画されない。treemap-beta は Obsidian 内蔵 Mermaid 非対応のため Source-only 提供。

### 新図種の追加手順

1. `src/core/<kind>/ir-types.ts` / `parser.ts` / `generator.ts` を実装
2. `src/core/adapters/<kind>.ts` で `DiagramAdapter` を実装
3. `src/core/adapters/index.ts` のレジストリに登録
4. `src/core/diagram-ir.ts` の `DiagramIR` union に variant を追加
5. GUI が必要なら `src/ui/<kind>/<Kind>Editor.tsx` を実装して `MermaidEditor.tsx` に組み込む（**`EditorShell` を経由すること**。後述の共通シェル契約を遵守）
6. **本ファイル（`AGENTS.md`）・`docs/obsidian-plugin-spec.md`・`docs/mermaid-diagram-types.md` を更新する**

---

## 共通エディタシェル（EditorShell）

flowchart を除く全ての専用エディタは `src/ui/EditorShell.tsx` を root として使う。シェルは 3 つの責務を一手に引き受ける：

1. **ドラッグ可能な toolbar** — `.mge-toolbar` クラスを付けたヘッダを描画する。`EditorModal` の delegated mousedown handler がこれを検知し、modal を移動させる。専用 toolbar をエディタ側で再実装してはいけない（drag 対象が外れる）。
2. **ライブ Mermaid プレビュー** — 親から渡された `renderMermaid(source)` を使い、IR の更新ごとに最新の Mermaid SVG を再描画する。`EditorModal` からは `src/obsidian/mermaidRender.ts` の `renderMermaidThemed` が注入される。同 helper は Obsidian の `theme-dark` クラスを見て `mermaid.initialize({ theme })` を切り替えるため、ライト/ダーク両方で文字色が追従する。Reading view の `postProcessor.ts` も同じ helper を経由するので、プレビューの見た目はモーダルと一致する（#37）。
3. **コードペイン** — 生成中のソースを textarea に同期表示する。`onSourceEdit` を渡すと編集可能になり、ユーザーのキーストロークごとに `parse<Kind>(next)` を呼んで IR を差し替える。draft state がユーザーの正確な入力を保持し続け、blur で IR から再生成された canonical 形に戻る。parse 失敗時はインラインの error バッジ（赤）が出るだけで IR は据え置く。

各 `<Kind>Editor` は次のシグネチャを満たす：

```tsx
<EditorShell
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

- **数値入力欄のみで構成しない**。プレビュー上でグラフィカルに操作できるなら `previewOverride` で SVG エディタを差し込み、ドラッグやハンドルで直接編集する経路を提供する（例: `QuadrantInteractivePreview`）。フォームは補助。
- **`onSourceEdit` は再 parse を伴う**ため、未対応構文を `rawLines` / `rawItems` 経由で round-trip させているエディタ（class / state）は当該配列も `useState` で管理し、再 parse の結果で必ず置き換える。closure-captured な const のままだとコードペイン経由の編集で raw 行が消えてしまう。
- 共通シェルの toolbar の見た目を変えたければ `toolbarExtras` slot を使う。`<header>` の DOM 構造には触れない。
- flowchart は React Flow canvas そのものがグラフィカルプレビューなので `EditorShell` を使わず `mge-app-shell` の独自レイアウトを維持する。例外として扱う。コード編集は既存の `src/ui/panels/TextPane.tsx`（store の `setText` / `commitText` 経由、debounce ありの blur commit）に集約。

---

## 新規作成フロー（blank-state）

既存ブロックを編集する経路に加えて、**まっさらな状態から GUI で作り始める**経路がある。エントリポイントは 2 つ：

1. **エディタ右クリック → "Insert new Mermaid diagram (GUI)"** — `main.ts` の `editor-menu` ハンドラから `openModalForNewBlock()` を呼ぶ。
2. **コマンドパレット → "Insert new Mermaid diagram (GUI)"** — 同じ関数を呼ぶ。

`openModalForNewBlock()` は `EditorModal` を **空ソース**で開く。`MermaidEditor` は `initialSource.trim().length === 0` を見て `DiagramKindPicker` をレンダリングする。ユーザーが種別を選ぶと、`src/core/templates.ts` のテンプレートが `seeded` state に格納され、その文字列を起点に通常の図種別エディタが立ち上がる。Save が押されたら、`commands.ts` の `insertNewMermaidFence()` が現在のカーソル位置に新しい `\`\`\`mermaid` フェンスを挿入する。

### 新しい図種テンプレートを足すとき

`src/core/templates.ts` の `DIAGRAM_TEMPLATES` 配列にエントリを追加する：

- `kind` は `DiagramKind` の値
- `source` は **最小だが parser が通る** Mermaid テキスト（テストで保証）
- `supportsGui: true` を立てるのは bespoke エディタがある図種だけ。`false` だと `SourceOnlyEditor` 経由になるが、テンプレートピッカーには出てよい

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

---

## 動作確認のショートカット

```bash
npm run dev
```

を回しつつ、vault の `<vault>/.obsidian/plugins/mermaid-gui-obsidian/` に対して **junction**（Windows: `New-Item -ItemType Junction`）でリポジトリ直下を貼ると、保存即反映できる。`Ctrl+R` で Obsidian をリロード。

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
- `main.js` / `styles.css` を直接編集すること（ソースを変更してビルドする）
- `node_modules/` をコミットすること

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
