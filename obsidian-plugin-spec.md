# Mermaid GUI Editor — Obsidian プラグイン化 要件定義・設計書

作成日: 2026-04-28（v1: 初版） / 2026-04-28（v2: §12 オープンクエスチョン回答を反映）
ベース: 本リポジトリ既存の Mermaid GUI Editor (`requirements.md` / `README.md`)
位置付け: Web 版で完成した IR 中核・双方向同期エンジンを、Obsidian の Markdown 編集体験に組み込むための拡張仕様。Obsidian プラグインへの一本化を前提とし、Web 版アプリ（旧 `apps/web`）は別ディレクトリに退避済みのためリポジトリ対象外。

---

## 1. 背景と狙い

- 既存の Web 版は単体ツールとして完結しており、**ドキュメント執筆フローに割り込む**コストが残る（ファイル受け渡し・コピペ）。
- Obsidian は Markdown ノートの中で `\`\`\`mermaid` フェンスを Reading view にレンダリングするが、編集はテキスト直書きに限定される。
- 「ノートを書きながら、その場で GUI で図を編集し、保存はテキスト（Mermaid）として残る」状態が欲しい。

→ **既存 IR エンジンをそのまま Obsidian プラグインにマウントし、コードブロックと GUI を双方向に往復させる。**

---

## 2. ゴール / 非ゴール

### ゴール
- Obsidian ノート内の `\`\`\`mermaid` ブロックを GUI で編集でき、保存結果がそのブロックに書き戻る。
- 既存ノートの記法を**破壊しない**（未対応構文・スタイル指定を素通し）。
- ノード座標を**ノート内に永続化**し、再オープン時に同じレイアウトが復元される。
- 既存 Web 版の IR・パーサ・ジェネレータ・Dagre レイアウトを共通ソースで再利用する。

### 非ゴール（初版）
- Mermaid 全図種対応（flowchart のみ。それ以外は触らず素通し）。
- モバイル（Obsidian Mobile）対応。
- Vault 横断検索や Dataview 連携。
- 共同編集・コンフリクト解決（個人利用前提）。

---

## 3. ターゲットと前提

- 個人利用、デスクトップ版 Obsidian（Windows / macOS）。
- ユーザーは Obsidian の Reading view と Live Preview を併用している前提。
- 既存 Web 版の `MermaidIR`／`rawLines`／`positions` 設計を継続採用。

---

## 4. UX モデル

### 4.1 編集導線（3 モード併設）

| モード | トリガー | 体験 | 優先度 |
| --- | --- | --- | --- |
| **A. モーダル編集** | Reading view のブロック右上「Edit」ボタン、または Live Preview のブロック上で `Cmd/Ctrl+E` 相当のコマンド | `Modal` を開き、Web 版 UI をフルに表示。保存でブロックへ書き戻し | **MVP 必須** |
| **B. インライン GUI** | Live Preview 上で該当ブロックにカーソルが入ったとき | CM6 WidgetType に GUI を inline 埋め込み。ドラッグでノード移動 | P2（MVP 後） |
| **C. 専用ビュー** | `.mmd` ファイルを開く／コマンドパレット「Open in Mermaid GUI」 | `WorkspaceLeaf` に全画面で展開 | P1.5（A の派生） |

理由: B は CM6 の selection／undo／IME と主導権を取り合うため事故源。A・C を先に固めてから着手する。

### 4.2 保存フロー
1. GUI 操作 → IR 更新 → Mermaid テキスト再生成（既存ロジック）。
2. Modal 「保存」または autosave で `editor.replaceRange` により**該当フェンスのみ**を置換。
3. ノート全体は Obsidian の通常フローで保存。

### 4.3 主要操作
既存 Web 版の機能セットを継承する（ノード CRUD・形状変更・エッジ・サブグラフ・自動レイアウト・Undo/Redo・SVG 出力）。**ショートカットは Obsidian 既存と衝突しない範囲に再マップ**する。

---

## 5. 座標永続化 — 設計判断

### 採用案: Mermaid コメント行への JSON 埋め込み

\`\`\`
\`\`\`mermaid
%% gui:positions {"A":[120,40],"B":[260,140]}
%% gui:meta {"version":1,"layout":"dagre"}
flowchart LR
    A[Start] --> B[End]
\`\`\`
\`\`\`

| 観点 | 評価 |
| --- | --- |
| Mermaid 公式レンダラとの互換 | `%%` で始まる行は仕様上コメント。レンダリングに影響なし |
| Git 差分 | テキストでそのまま読める |
| ノート移動・rename | コードブロック内に閉じているので破綻しない |
| 既存ロジックとの整合 | 現行 `rawLines` の温存機構で自然に通る |

### 却下した代替案
- **frontmatter**: 1 ノートに複数図がある場合キーが衝突／煩雑。
- **サイドカー `.json`**: vault 構造を汚す、添付ルール・rename・モバイル同期で破綻しやすい。
- **HTML コメント `<!-- -->`**: フェンス内では Markdown コメントとして機能しない。

### マイグレーション
- `gui:positions` 行が無いブロックは Dagre で初期配置し、保存時に追記。
- バージョンキー (`gui:meta.version`) を付け、将来の schema 変更時に変換可能にする。

### 5.1 補助構文（classDef / style / linkStyle / click）の方針

| 構文 | 役割 | 例 |
| --- | --- | --- |
| `classDef name ...` | スタイル定義（CSS クラス相当） | `classDef important fill:#f96,stroke-width:4px` |
| `class A,B name` | ノードへのクラス適用 | `class A,B important` |
| `style A ...` | 個別ノードに直接スタイル | `style A fill:#bbf` |
| `linkStyle 0 ...` | エッジへのスタイル（インデックス指定） | `linkStyle 0 stroke:red` |
| `click A ...` | クリック動作（URL or callback） | `click A "https://..."` |

**MVP 方針: rawLines 戦略を継続（IR 化しない）**。

採用理由:
- 既存ノートの非破壊往復が最優先。現行ロジックがすでに保証している。
- GUI で色・スタイルを編集するユースケースが個人/チーム利用の現スコープで具体化していない。
- `linkStyle 0` のようなインデックス参照は、ノード/エッジの並び替えで容易に破綻する。IR 化するならインデックスを id 参照へ変換する追加工程が必要で、コストが大きい。

**将来の段階的 IR 化パス**（要望が出た時点で実装）:
1. `style A ...` のみ IR 化（ノード id に直接ぶら下げるので安全）。
2. `class` 適用関係を IR 化（`classDef` 本体は rawLines のまま参照）。
3. `linkStyle` を IR 化（エッジ id 参照に変換）。
4. `click` を IR 化（Obsidian では `[[wikilink]]` 経路の方が自然なため、優先度低）。

このパスは MVP のスコープ外。

---

## 6. アーキテクチャ

### 6.1 リポジトリ構成

Web 版は別ディレクトリに退避済みのため、本リポジトリは **Obsidian プラグイン単体構成**に再編する。`core` / `ui` / `plugin` の関心分離は維持し、将来 VS Code 拡張等への展開余地は残す。

```
mermaid-gui-obsidian/
├── manifest.json              # Obsidian プラグインマニフェスト
├── main.ts                    # Plugin エントリ（registerMarkdownCodeBlockProcessor 等）
├── esbuild.config.mjs
├── styles.css
├── src/
│   ├── core/                  # 純粋ロジック（IO 非依存）
│   │   ├── parser.ts          # 既存 src/mermaid/parser.ts を移設
│   │   ├── generator.ts
│   │   ├── shapes.ts
│   │   ├── ir-types.ts        # 既存 types.ts を改名
│   │   ├── dagre.ts           # 既存 src/layout/dagre.ts を移設
│   │   ├── store-factory.ts   # ★ 旧 editorStore.ts を「createStore()」関数化
│   │   └── positions-codec.ts # ★ %% gui:positions の読み書き（新規）
│   ├── ui/                    # React コンポーネント
│   │   ├── MermaidEditor.tsx  # 旧 App.tsx をコンポーネント化（Modal / 専用ビューから共通呼出）
│   │   ├── canvas/
│   │   ├── panels/
│   │   ├── toolbar/
│   │   └── adapter.ts         # 旧 src/store/adapter.ts
│   └── obsidian/              # Obsidian 固有レイヤ
│       ├── EditorModal.ts
│       ├── MermaidView.ts     # 専用ビュー（C 案）
│       ├── ReactHost.tsx      # createRoot / unmount ライフサイクル管理
│       ├── postProcessor.ts   # Reading view のブロック装飾
│       ├── widget.ts          # CM6 WidgetType（P2）
│       └── io.ts              # vault/editor 経由の IO adapter
└── tests/
    └── core/                  # 既存 vitest スイートを移設
```

**設計上の制約**:
- `src/core` と `src/ui` は `obsidian` モジュールに依存しない（テスト・将来再利用のため）。
- `src/obsidian` のみが Obsidian API を呼ぶ。IO は adapter として `core` に注入する。

### 6.2 ビルド
- `obsidian-plugin` は **esbuild** で `main.js` 単一ファイルへバンドル（Obsidian 公式 sample-plugin 準拠）。
- `obsidian` / `@codemirror/*` は external、本体に同梱しない。
- **`mermaid` 本体はバンドルしない** — Obsidian 内蔵の renderer (`MarkdownRenderer.render`) を呼ぶ。SVG エクスポート時もこれに委譲する。

### 6.3 React マウントとライフサイクル（複数ブロック同居前提）

1 ノートに複数の mermaid ブロックが並ぶ運用を**正式サポート**する。これにより以下が **MUST** となる:

- 1 コードブロック = 1 React root = 1 store インスタンス。
- `MarkdownPostProcessorContext.addChild(new MarkdownRenderChild(el))` を使い、`onunload` で `root.unmount()` を必ず呼ぶ。
- **Zustand store のファクトリ化**: `createEditorStore()` が呼び出しごとに独立した store を返す形へリファクタする（既存のモジュールトップレベル `create()` は不可）。
- 同一ノート内のブロック間でショートカット・選択状態が混線しないよう、キーボードイベントは**フォーカスのある root に閉じ込める**（document-level listener を避ける）。
- Modal 起動中はその Modal の store のみ active。背後の Reading view 上の他ブロックは静的プレビューのまま。

### 6.4 IO レイヤ

| 関心事 | 実装 |
| --- | --- |
| ファイル読み | `app.vault.read` / `editor.getValue`（コードブロック section info で範囲特定） |
| ファイル書き | `editor.replaceRange`（該当フェンスのみを置換） |
| 添付保存 | `app.vault.adapter.writeBinary` → 添付フォルダ → `![[]]` を選択範囲に自動挿入 |
| クリップボード | `navigator.clipboard`（Electron で利用可） |

`src/core` は IO に依存しない。`src/obsidian/io.ts` が adapter として注入される。

---

## 7. 機能要件

### 7.1 MVP（v0.1）
1. `registerMarkdownCodeBlockProcessor("mermaid", ...)` で Reading view のフェンスを装飾し、右上に Edit ボタンを表示。
2. ボタン／コマンドパレット「Edit current Mermaid block」で Modal を起動。
3. Modal 内で既存 GUI 編集を提供。Save で当該フェンスのみ書き戻し。
4. `%% gui:positions` を読み書きし、再オープン時にレイアウト復元。
5. 既存ブロックの未対応構文（`classDef` / `linkStyle` / `click` 等）は `rawLines` で温存。
6. SVG エクスポート（添付保存 + リンク挿入）。
7. テーマ追従（Obsidian の CSS 変数を palette に反映）。

### 7.2 P1.5
8. 専用ビュー（`.mmd` ファイルを Mermaid GUI で開く）。
9. ノードラベルの `[[wikilink]]` 解釈・クリック遷移。
10. ノートの選択範囲（箇条書き）から flowchart を生成するコマンド。

### 7.3 P2 以降
- Live Preview インライン GUI（CM6 WidgetType）。
- sequence diagram のサポート（既存 `requirements.md` の P2 と整合）。
- 図のテンプレートライブラリ／スニペット。

---

## 8. 非機能要件

| 区分 | 要件 |
| --- | --- |
| 互換 | Obsidian v1.5 以降（`MarkdownRenderer.render` API 安定版が前提） |
| 性能 | 1 ノートに mermaid ブロック 20 個程度まで違和感なく開ける（React root の遅延初期化） |
| サイズ | プラグイン本体（`main.js` + `styles.css`）で 500KB 以下を目標。mermaid・@xyflow/react は含めるが、tree-shake で削減 |
| 安全性 | ノートの**未対応行を絶対に消さない**（rawLines 必須）。書き戻しは該当フェンスの range だけ |
| 国際化 | UI は日本語／英語の文字列辞書を `core` から分離 |
| アクセシビリティ | キーボードのみで主要操作が完結すること（既存 Web 版の課題と共通） |

---

## 9. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| Obsidian 内蔵 mermaid のバージョン差 | レンダリング差分 | 自前 `mermaid` を保険として動的 import 可能にしておく（feature flag） |
| `editor.replaceRange` の range 取得失敗（フェンスが移動した等） | ノート破損 | 書き戻し前に該当フェンスの先頭/末尾シグネチャを再検証。失敗時はモーダルでユーザー確認 |
| React 複数 root による メモリリーク | 性能劣化 | `MarkdownRenderChild.onunload` を必ず通す自動テスト（DOM カウント） |
| Zustand シングルトン残存 | 図同士の状態混線 | store ファクトリ化を MVP の必須項目に置く |
| CSS グローバル汚染 | テーマ崩れ | クラス名 prefix `mge-`、CSS 変数経由でのみテーマ参照 |
| Live Preview と CM6 の競合（B 案） | IME・Undo の事故 | MVP では実装しない。専用ブランチで段階的に検証 |

---

## 10. テスト戦略

- `packages/core`: 既存 vitest を継続。`positions-codec` のラウンドトリップを追加。
- プラグイン層: Obsidian の API は thin adapter に閉じ込め、adapter のみ jest mock。E2E は Obsidian 開発者用 vault に手動シナリオを置く（自動化困難）。
- 受け入れシナリオ:
  1. 既存 `.mmd` を含むノートを開く → Edit → 何も変更せず Save → diff が `%% gui:positions` 追加のみ。
  2. `classDef` を含むブロックを編集 → 保存 → `classDef` が温存されている。
  3. 1 ノートに 3 ブロック並べて同時に開閉 → ストア混線なし。

---

## 11. 段階リリース計画

| バージョン | 含む内容 | 目安 |
| --- | --- | --- |
| v0.1 (MVP) | §7.1 全項目 | 2 週間 |
| v0.2 | §7.2（専用ビュー・wikilink・選択→図化） | +1 週間 |
| v0.3 | テーマ／i18n／パフォーマンス調整 | +1 週間 |
| v0.4 | sequence diagram | 別企画 |
| v1.0 | Live Preview インライン GUI | 別企画 |

### 11.1 配布方法（チーム内共有）

コミュニティプラグインへの公開申請は行わない。Obsidian プラグインは `<vault>/.obsidian/plugins/<plugin-id>/` に `manifest.json` / `main.js` / `styles.css` を配置するだけで動作するため、ローカル配布で完結する。

| 方法 | 仕組み | 適用場面 |
| --- | --- | --- |
| **A. zip 配布**（MVP 採用） | ビルド成果物を zip → OneDrive 等で共有 → 受領側が plugins フォルダに解凍 | 初期版・小規模配布。OneDrive がすでに稼働中なため摩擦最小 |
| **B. BRAT 経由** | 受領側に BRAT（コミュニティプラグイン）を導入 → 社内 GitHub の private repo URL を登録 → 自動更新 | 更新頻度が上がってきた段階で移行 |
| **C. 共有 vault** | vault 自体を Git／Obsidian Sync 等で共有している場合、`.obsidian/plugins/` ごと自動同期 | 既存の vault 共有運用に乗せられる場合 |

**運用上の注意**:
- 受け取り側は Obsidian の「制限モード（Restricted mode）」を OFF にする必要がある（初回のみ）。
- BRAT は private repo に対しても GitHub Personal Access Token で対応可能。
- バージョン管理: `manifest.json` の `version` をビルドごとに上げ、`CHANGELOG.md` を同梱する。

**推奨ライン**: MVP は **A（zip + OneDrive）** で開始。配布対象が増え更新頻度が上がった段階で **B（社内 GitHub + BRAT）** へ移行する。

---

## 12. 決定事項（v2 で確定）

| 項目 | 決定 | 反映先 |
| --- | --- | --- |
| 複数ブロック同居 | **想定する** | §6.3（store ファクトリ化を MUST 化） |
| `classDef` / `style` / `linkStyle` / `click` | **MVP では rawLines 継続。IR 化しない** | §5.1（段階的 IR 化パスを記載） |
| Web 版の存続 | **不要**（別ディレクトリへ退避済み） | §6.1（モノレポ廃止、プラグイン単体構成へ） |
| 配布形態 | **コミュニティプラグイン申請しない。チーム内ローカル配布** | §11.1（zip → BRAT への段階運用） |

### 12.1 残るオープンクエスチョン

1. **plugin id の確定**: `manifest.json` の `id` を何にするか（例: `mermaid-gui-editor`）。BRAT 導入時に変更すると plugins フォルダのパスが変わるため、初版で決め切る必要がある。
2. **添付ファイルの保存先**: SVG エクスポート時の保存ディレクトリは Obsidian の添付設定に従うか、プラグイン独自設定を持つか。
3. **ショートカット衝突**: `Ctrl/Cmd+Z`、`Ctrl/Cmd+E` 等が Obsidian 既定のコマンドと衝突する可能性があるため、Modal 内のみで有効化するか専用キーを割り当てるかを決める。
4. **`linkStyle` のインデックス保護**: rawLines 継続でも、GUI でエッジを並び替えると `linkStyle 0` の指す対象がズレる。MVP では「`linkStyle` を含むブロックはエッジ並び順を変えない」制約を設けるか、警告表示で済ますか。

---

## 13. 既存資産との対応表

| 既存ファイル | プラグイン側での扱い |
| --- | --- |
| `src/mermaid/parser.ts` / `generator.ts` / `types.ts` / `shapes.ts` | `src/core/` へ移設、無改変（`types.ts` は `ir-types.ts` へ改名） |
| `src/layout/dagre.ts` | `src/core/dagre.ts` へ移設 |
| `src/store/editorStore.ts` | **`createEditorStore()` ファクトリ関数化**して `src/core/store-factory.ts` へ |
| `src/store/adapter.ts` | `src/ui/adapter.ts` へ |
| `src/components/**` | `src/ui/` へ、`@xyflow/react` 依存維持 |
| `src/io/fileIO.ts` | 廃止（Obsidian の vault/editor API へ置き換え、`src/obsidian/io.ts` に再実装） |
| `src/io/exportSvg.ts` | core 側にレンダラ非依存のインターフェイスを置き、Obsidian 側で `MarkdownRenderer.render` を呼ぶ実装を注入 |
| `src/App.tsx` | `src/ui/MermaidEditor.tsx` へリファクタ。Modal / 専用ビューから共通呼び出し |
