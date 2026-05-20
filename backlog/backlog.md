# バックログ

| #  | 状態   | 項目                           | 対応                                             |
| -- | ---- | ---------------------------- | ---------------------------------------------- |
| 1  | ✅ 完了 | GUIメタコメント起因のMermaid描画エラー対策   | プレビュー描画前に `%% gui:*` を除外したMermaid本文へ正規化        |
| 2  | ✅ 完了 | GUIで接続先を移動できるようにする           | edge再接続イベントでIRの `source` / `target` を更新        |
| 3  | ✅ 完了 | LR/RL時の左右接続表示                | 方向別に既定ハンドルを設定し、LRは右から左へ接続                      |
| 4  | ✅ 完了 | 回帰確認                         | adapterテストと既存テストを実行                            |
| 5  | ✅ 完了 | edgeごとの接続辺をGUI上で変更・保存        | Mermaid本文を維持し、`%% gui:edges` に接続ハンドルを保存        |
| 6  | ✅ 完了 | 同一ノード間の接続辺変更でedgeが重複追加される    | `onConnect` で既存edgeを検出し、1本だけならハンドル更新に変換        |
| 7  | ✅ 完了 | ノード・線の削除操作をGUIに明示            | PropertyPanelに選択対象の削除ボタンを追加                    |
| 8  | ✅ 完了 | ノード・線のダブルクリック編集              | ダブルクリックで選択し、Label入力へフォーカス                      |
| 9  | ✅ 完了 | 既存edgeの接続辺変更で矢印方向が反転する       | React Flowの再接続イベントを正規化し、元edgeの向きを保持            |
| 10 | ✅ 完了 | 同一ノード内の別辺へ接続位置を変えると自己ループができる | 非自己ループedgeでは accidental self-loop をハンドル変更として吸収 |
| 11 | ✅ 完了 | GUIメタ情報でMermaidプレビューがheader不在エラーになる | 描画用テキストから `%% gui:*` とheader前の行を常に除去 |
| 12 | ✅ 完了 | ノード・エッジのシングルクリック選択 | シングルクリックで選択状態を更新し、プロパティを表示 |
| 13 | 🟡 ペンディング | 横スクロールバーの追加 | エディタ空白化の原因候補。追加DOMと `setViewport` 同期が初期表示・React Flow内部移動と競合した可能性あり |
| 14 | ✅ 完了 | 図形位置の永続化オプション | `Save positions` トグルで `%% gui:positions` の保存有無を切替。Auto-layout は維持 |
| 15 | 🟡 ペンディング | サブグラフのマウス操作（移動・リサイズ） | エディタ空白化の原因候補。`NodeResizer`、`draggable/selectable`、`pointer-events` 変更がReact Flow描画を阻害した可能性あり |
| 16 | ✅ 完了 | サブグラフへのノード所属のGUI反映 | サブグラフ所属ノードをMermaid本文内で明示し、再パース後も所属を維持 |
| 17 | ✅ 完了 | ソース表示欄（TextPane）の上下リサイズ | TextPane上端ドラッグでエディター下部のソース表示領域の高さを調整可能にする（ポップアップ表示は不要） |
| 18 | ⏳ 未着手 | TextPaneリサイズ時のポップアップ削除 | リサイズ操作時に表示される「リサイズペイン」のようなツールチップ（title属性など）を削除する |
| 19 | ⏳ 未着手 | ウィンドウリサイズの最適化 | GUI モーダルのウィンドウサイズを変更した際のレイアウト追従や描画パフォーマンスを最適化する |
| 20 | ⏳ 未着手 | ダークモードでの視認性向上 | ライトモードでの視認性を損なわずに、ダークモード適用時の各ペインやテキストの見やすさを改善する |
| 21 | ⏳ 未着手 | SVG出力での表示不具合を解消 | SVGエクスポート時に発生するレイアウト崩れやスタイルの欠落などの描画不具合を修正する |
| 22 | ✅ 完了 | MermaidボタンをLive Previewとコードビューの右上に表示 | 読取モードと編集モードの両方で同じEditボタンを右上オーバーレイ表示する |
| 23 | 🟡 ペンディング | 水平スクロールが効かない不具合の修正 | 横スクロールバー追加の再設計に統合。まず表示空白化の再現条件を分離してから対応 |
| 24 | ✅ 完了 | ライブプレビューでEditボタンがスクロールに追従しない | `view.scrollDOM` の scroll イベントを購読して再計測。`requestMeasure` に `key` を付与して重複排除。可視エリア外ブロックのボタンはスキップ |
| 25 | ✅ 完了 | ノード選択時の枠線が太すぎる | 選択時の `stroke-width` を 2.25 → 1.5 に変更し、色のみで選択状態を表現 |
| 26 | ✅ 完了 | 全エディタ共通の上部バーをドラッグ可能に | `src/ui/EditorShell.tsx` を新設し、全図種エディタが `.mge-toolbar` を持つ共通シェルを使用。modal の drag handle が flowchart 以外でも作動 |
| 27 | ✅ 完了 | 全図種でコード+プレビューを横に並べる | EditorShell の右ペインに Mermaid 描画と生成ソースを上下分割表示。`renderMermaid` を `EditorModal` から `loadMermaid()` 経由で注入 |
| 28 | ✅ 完了 | quadrantChart：プレビュー上でポイントをドラッグ編集 | `QuadrantInteractivePreview` を導入し、ポイントを SVG 上でドラッグして x/y を更新（IR 座標 0..1 を直接編集） |
| 29 | ⏳ 未着手 | pie：プレビュー上でスライス境界をドラッグ編集 | 各スライスのエッジハンドルを掴んで割合を直接調整できるようにする |
| 30 | ⏳ 未着手 | xychart：バー/折れ線の値をドラッグ編集 | プロット領域でデータポイントを上下ドラッグし values 配列を直接編集 |
| 31 | ⏳ 未着手 | sankey：ノード移動とフロー値のドラッグ編集 | source/target ノードの並べ替えや link の幅を直接掴んで編集 |
| 32 | ⏳ 未着手 | sequence/class/state：プレビュー要素のドラッグ並べ替え | participant 順、class 配置、state 遷移の起点/終点を SVG オーバーレイ上で操作 |
| 33 | ⏳ 未着手 | radar：軸/カーブのドラッグ編集 | 内蔵 Mermaid が radar-beta 対応する将来を見据え、独自 SVG プレビューを検討 |
| 34 | ⏳ 未着手 | flowchart：React Flow canvas に加えて Mermaid 出力プレビューも併設 | 現状 canvas が graphical preview を兼ねるが、最終 SVG を独立に確認できる小窓を検討 |
| 35 | ✅ 完了 | まっさらな状態から GUI で新規作成（右クリックメニュー＋種別ピッカー＋初期テンプレート） | エディタ内右クリックで「Insert new Mermaid diagram (GUI)」を追加。空ソースで Modal を開くと `DiagramKindPicker` が表示され、種別を選ぶと `src/core/templates.ts` のテンプレートをロード。保存時に新規 `\`\`\`mermaid` フェンスをカーソル位置に挿入。コマンドパレットからも実行可能 |
| 36 | ✅ 完了 | DiagramKindPicker のタイル内テキストはみ出しを根本対応 | `min-width:0`・`overflow-wrap:anywhere`・`-webkit-line-clamp:3`・`grid-auto-rows:1fr` をタイルとリストに適用し、長文 description でも横はみ出しゼロ・行高揃えを実現 |
| 37 | ✅ 完了 | プレビュー上のテキスト可視性（暗い背景・図形でのコントラスト不足） | `src/obsidian/mermaidRender.ts` を新設し、`document.body.classList.contains("theme-dark")` を見て `mermaid.initialize({ theme })` をライト/ダーク切替。EditorShell と Reading view 双方を同 helper 経由に統一。プレビューラッパに `color-scheme: light dark` も付与 |
| 38 | ✅ 完了 | エディタウィンドウのリサイズハンドルを四隅に拡張 | CSS `resize: both` を撤去し、`EditorModal.onOpen` で四隅に `mge-resize-handle-*` を生成。`pointerdown` 起点に `getBoundingClientRect` から `width`/`height`/`left`/`top` を一括更新し、左/上辺ドラッグ時も反対側を基準点に固定。最小 540×360 / 最大 98vw×96vh でクランプ |
| 39 | ✅ 完了 | GUI エディタ右ペインの Mermaid コードを編集可能化 | `EditorShell` に `onSourceEdit` を追加。draft state を抱えて入力中は生成結果で上書きしない。各 `<Kind>Editor` で `parse<Kind>` を再実行し、成功時に IR を差し替え、失敗時はインライン error バッジを出す。flowchart は既存 `TextPane` の経路を踏襲。Class/State の `rawItems` を state 化して非対応構文の round-trip を維持 |
