# Mermaid種別拡張タスク

目的: flowchart専用GUIから、Mermaid種別ごとに拡張できる編集基盤へ移行する。

## 追加対象のMermaid種別

| Phase | 種別 | 編集UI方針 | 公式ドキュメント |
| --- | --- | --- | --- |
| 実装済み | `flowchart`, `graph` | Flowchart GUI | [flowchart](https://mermaid.js.org/syntax/flowchart.html) |
| 4 | `sequenceDiagram` | Sequence専用GUI | [sequenceDiagram](https://mermaid.js.org/syntax/sequenceDiagram.html) |
| 5 | `classDiagram` | クラス図専用GUI | [classDiagram](https://mermaid.js.org/syntax/classDiagram.html) |
| 5 | `stateDiagram-v2`, `stateDiagram` | 状態遷移GUI | [stateDiagram](https://mermaid.js.org/syntax/stateDiagram.html) |
| 6 | `pie`, `xychart-beta`, `sankey-beta`, `quadrantChart`, `radar-beta` | form / chart editor | [pie](https://mermaid.js.org/syntax/pie.html) / [xychart](https://mermaid.js.org/syntax/xyChart.html) / [sankey](https://mermaid.js.org/syntax/sankey.html) / [quadrant](https://mermaid.js.org/syntax/quadrantChart.html) / [radar](https://mermaid.js.org/syntax/radar.html) |
| 7 | `gantt`, `timeline` | table editor | [gantt](https://mermaid.js.org/syntax/gantt.html) / [timeline](https://mermaid.js.org/syntax/timeline.html) |
| 8 | `erDiagram`, `mindmap`, `treemap-beta`, `venn-beta` | graph / tree editor | [er](https://mermaid.js.org/syntax/entityRelationshipDiagram.html) / [mindmap](https://mermaid.js.org/syntax/mindmap.html) / [treemap](https://mermaid.js.org/syntax/treemap.html) / [venn](https://mermaid.js.org/syntax/venn.html) |
| 9 | `journey`, `zenuml` | step / sequence editor | [journey](https://mermaid.js.org/syntax/userJourney.html) / [zenuml](https://mermaid.js.org/syntax/zenuml.html) |
| 10 | `architecture-beta`, `block-beta` | 専用GUI | [architecture](https://mermaid.js.org/syntax/architecture.html) / [block](https://mermaid.js.org/syntax/block.html) |
| fallback | `unknown` | Source-only fallback | — |

## 実装方針

- 共通化するのは「種別判定」「adapter選択」「保存経路」までに留める。
- IRは種別ごとに分ける。`nodes` / `edges` 前提を sequence / class / state / mindmap に流用しない。
- **各adapterの対応構文・IRの設計・テストケースは `https://mermaid.js.org/syntax/<種別>.html` を正として決定する。** 公式ドキュメントに記載のない構文はrawLinesとして保持し、GUIで編集対象としない。
- Mermaid全構文の完全対応は目指さない。GUIで理解できる構文だけ構造化し、その他は順序付きの `rawLines` / `items` として保持する。
- GUI未対応種別は **Source-only editor** で開く。Preview-only だと保存・修正ができず、`Edit` の目的とずれる。
- 既存公開APIの互換性を急に壊さない。`parseMermaid` / `generateMermaid` は当面 flowchart互換の薄いwrapperとして残す。

## Phase 1: 共通基盤と起動失敗の解消

| 状態 | 順序 | タスク | 変更候補 | 完了条件 |
| --- | ---: | --- | --- | --- |
| ⏳ 未着手 | 1 | Mermaid種別判定を独立させる | `src/core/diagram-kind.ts`, `tests/core/diagram-kind.test.ts` | `detectDiagramKind(source)` が空行・`%%` コメント・GUIメタコメントを無視し、先頭の有効行から種別を判定できる |
| ⏳ 未着手 | 2 | 判定対象を定義する | `src/core/diagram-kind.ts` | 「追加対象のMermaid種別」の種別を既知種別として扱い、それ以外は `unknown` にする |
| ⏳ 未着手 | 3 | Source-only fallbackを追加する | `src/ui/SourceOnlyEditor.tsx` | 非対応種別でもモーダル内でソースを編集・保存・キャンセルできる |
| ⏳ 未着手 | 4 | `MermaidEditor` を分岐させる | `src/ui/MermaidEditor.tsx` | flowchartは既存GUI、それ以外はSource-onlyで開き、parse error Noticeだけで止まらない |
| ⏳ 未着手 | 5 | preview/exportの正規化を維持する | `src/core/positions-codec.ts` | `stripGuiMetadata(source)` が非flowchartでもヘッダ前のGUIメタ情報を除外し、Mermaid本文を壊さない |
| ⏳ 未着手 | 6 | 回帰テストを追加する | `tests/core/positions-codec.test.ts`, `tests/ui` | `sequenceDiagram` ブロックを開く経路で保存可能なfallbackに入ることを確認する |

## Phase 2: flowchart adapter化

| 状態 | 順序 | タスク | 変更候補 | 完了条件 |
| --- | ---: | --- | --- | --- |
| ⏳ 未着手 | 7 | adapter型を定義する | `src/core/adapters/types.ts` | `kind`, `parse`, `generate`, `supportsGui` を持つadapter interfaceがある |
| ⏳ 未着手 | 8 | flowchart adapterを追加する | `src/core/adapters/flowchart.ts` | 既存 `parser.ts` / `generator.ts` の処理をadapter経由で呼べる |
| ⏳ 未着手 | 9 | adapter registryを追加する | `src/core/adapters/index.ts` | `getAdapter(kind)` で対応adapterを取得し、未対応は `null` を返す |
| ⏳ 未着手 | 10 | 既存storeの責務をflowchartに閉じる | `src/core/store-factory.ts`, `src/ui/FlowchartEditor.tsx` | `createEditorStore` はflowchart editor配下でのみ使われる |
| ⏳ 未着手 | 11 | 互換wrapperを残す | `src/core/parser.ts`, `src/core/generator.ts`, `src/core/index.ts` | 既存テストと既存importが壊れない |

## Phase 3: 共通IR境界

| 状態 | 順序 | タスク | 変更候補 | 完了条件 |
| --- | ---: | --- | --- | --- |
| ⏳ 未着手 | 12 | 親型 `DiagramIR` を導入する | `src/core/diagram-ir.ts` | `kind` ごとに別IRを保持できる discriminated union がある |
| ⏳ 未着手 | 13 | parse結果の型を整理する | `src/core/adapters/types.ts` | `ParseOutcome<T>` がadapterごとのIR型を返せる |
| ⏳ 未着手 | 14 | raw保持方針を明文化する | adapter実装、テスト | 未対応行を捨てず、生成時に元の相対順序へ戻せる |

## Phase 4: sequenceDiagram MVP

| 状態 | 順序 | タスク | 変更候補 | 完了条件 |
| --- | ---: | --- | --- | --- |
| ⏳ 未着手 | 15 | sequence IRを設計する | `src/core/sequence/ir-types.ts` | participant / actor / message / note / activation / raw item を順序付きで表現できる |
| ⏳ 未着手 | 16 | 対応構文を絞る | `src/core/sequence/parser.ts` | `participant A`, `actor A`, `participant A as Label`, `A->>B: text`, `A-->>B: text`, `Note over A,B: text`, `Note right of A: text`, `activate A`, `deactivate A` を対象にする |
| ⏳ 未着手 | 17 | sequence parserを追加する | `src/core/sequence/parser.ts`, `tests/core/sequence-parser.test.ts` | 対応構文を構造化し、未対応行は順序付きraw itemとして保持する |
| ⏳ 未着手 | 18 | sequence generatorを追加する | `src/core/sequence/generator.ts`, `tests/core/sequence-generator.test.ts` | parse -> generate -> parse の主要構造が一致する |
| ⏳ 未着手 | 19 | sequence adapterを登録する | `src/core/adapters/sequence.ts` | `sequenceDiagram` がregistryから取得できる |
| ⏳ 未着手 | 20 | sequence編集UIを作る | `src/ui/sequence/SequenceEditor.tsx` | participant一覧、message一覧、note/activationの最低限編集ができる |
| ⏳ 未着手 | 21 | sequence保存経路を接続する | `src/ui/MermaidEditor.tsx` | sequence GUI編集後に Mermaid block body として保存できる |

## Phase 5: classDiagram / stateDiagram

| 状態 | 順序 | タスク | 変更候補 | 完了条件 |
| --- | ---: | --- | --- | --- |
| ⏳ 未着手 | 22 | classDiagram MVPスコープを確定する | [公式docs](https://mermaid.js.org/syntax/classDiagram.html) | class / member / method / relation のうちGUI化する範囲とrawLines扱いとする構文が決まる |
| ⏳ 未着手 | 23 | classDiagram IRを設計する | `src/core/class/ir-types.ts` | クラス・メンバー・メソッド・関係を表現できるdiscriminated unionがある |
| ⏳ 未着手 | 24 | classDiagram parser/generatorを追加する | `src/core/class/parser.ts`, `generator.ts`, `tests/core/class-*.test.ts` | parse → generate → parse の主要構造が一致する |
| ⏳ 未着手 | 25 | classDiagram adapterを登録する | `src/core/adapters/class.ts` | `classDiagram` がregistryから取得できる |
| ⏳ 未着手 | 26 | classDiagram GUIを実装する | `src/ui/class/ClassEditor.tsx` | クラス追加・削除・関係線の最低限編集ができる |
| ⏳ 未着手 | 27 | stateDiagram MVPスコープを確定する | [公式docs](https://mermaid.js.org/syntax/stateDiagram.html) | state / transition / composite state のうちGUI化する範囲が決まる |
| ⏳ 未着手 | 28 | stateDiagram IRを設計する | `src/core/state/ir-types.ts` | 状態・遷移・開始終了状態を表現できるdiscriminated unionがある |
| ⏳ 未着手 | 29 | stateDiagram parser/generatorを追加する | `src/core/state/parser.ts`, `generator.ts`, `tests/core/state-*.test.ts` | parse → generate → parse の主要構造が一致する |
| ⏳ 未着手 | 30 | stateDiagram adapterを登録する | `src/core/adapters/state.ts` | `stateDiagram-v2` / `stateDiagram` がregistryから取得できる |
| ⏳ 未着手 | 31 | stateDiagram GUIを実装する | `src/ui/state/StateEditor.tsx` | 状態追加・遷移・開始終了ノードの最低限編集ができる |

## Phase 6: データ可視化系（pie / quadrantChart / xychart-beta / sankey-beta / radar-beta）

| 状態 | 順序 | タスク | 変更候補 | 完了条件 |
| --- | ---: | --- | --- | --- |
| ⏳ 未着手 | 32 | 各種別のMVPスコープを確定する | 公式docs参照（5種別） | データ構造と編集対象要素が種別ごとに決まる |
| ⏳ 未着手 | 33 | IR・parser・generator・adapterを実装する | `src/core/<kind>/`, `src/core/adapters/` | 各種別でparse → generate round-tripが成立する |
| ⏳ 未着手 | 34 | form / chart editor GUIを実装する | `src/ui/<kind>/` | 各種別で数値・ラベルの追加・編集・削除ができる |
| ⏳ 未着手 | 35 | 保存経路を接続し回帰テストを追加する | `src/ui/MermaidEditor.tsx`, `tests/` | 各種別の編集後にMermaidブロックとして保存できる |

## Phase 7: 時系列系（gantt / timeline）

| 状態 | 順序 | タスク | 変更候補 | 完了条件 |
| --- | ---: | --- | --- | --- |
| ⏳ 未着手 | 36 | 各種別のMVPスコープを確定する | 公式docs参照 | タスク/イベントのGUI化範囲とrawLines扱い構文が決まる |
| ⏳ 未着手 | 37 | IR・parser・generator・adapterを実装する | `src/core/<kind>/`, `src/core/adapters/` | parse → generate round-tripが成立する |
| ⏳ 未着手 | 38 | table editor GUIを実装する | `src/ui/<kind>/` | タスク/イベントの追加・編集・並び替えができる |
| ⏳ 未着手 | 39 | 保存経路を接続し回帰テストを追加する | `src/ui/MermaidEditor.tsx`, `tests/` | 編集後にMermaidブロックとして保存できる |

## Phase 8: 関係/階層系（erDiagram / mindmap / treemap-beta / venn-beta）

| 状態 | 順序 | タスク | 変更候補 | 完了条件 |
| --- | ---: | --- | --- | --- |
| ⏳ 未着手 | 40 | 各種別のMVPスコープを確定する | 公式docs参照 | エンティティ/ノード/集合のGUI化範囲が決まる |
| ⏳ 未着手 | 41 | IR・parser・generator・adapterを実装する | `src/core/<kind>/`, `src/core/adapters/` | parse → generate round-tripが成立する |
| ⏳ 未着手 | 42 | graph / tree editor GUIを実装する | `src/ui/<kind>/` | ノード・エッジ・階層の最低限編集ができる |
| ⏳ 未着手 | 43 | 保存経路を接続し回帰テストを追加する | `src/ui/MermaidEditor.tsx`, `tests/` | 編集後にMermaidブロックとして保存できる |

## Phase 9: インタラクション系（journey / zenuml）

| 状態 | 順序 | タスク | 変更候補 | 完了条件 |
| --- | ---: | --- | --- | --- |
| ⏳ 未着手 | 44 | 各種別のMVPスコープを確定する | 公式docs参照 | ステップ/メッセージのGUI化範囲が決まる |
| ⏳ 未着手 | 45 | IR・parser・generator・adapterを実装する | `src/core/<kind>/`, `src/core/adapters/` | parse → generate round-tripが成立する |
| ⏳ 未着手 | 46 | step / sequence editor GUIを実装する | `src/ui/<kind>/` | ステップ/メッセージの追加・編集ができる |
| ⏳ 未着手 | 47 | 保存経路を接続し回帰テストを追加する | `src/ui/MermaidEditor.tsx`, `tests/` | 編集後にMermaidブロックとして保存できる |

## Phase 10: インフラ/アーキテクチャ系（architecture-beta / block-beta）

| 状態 | 順序 | タスク | 変更候補 | 完了条件 |
| --- | ---: | --- | --- | --- |
| ⏳ 未着手 | 48 | 各種別のMVPスコープを確定する | 公式docs参照 | サービス/ブロックのGUI化範囲と空間配置方針が決まる |
| ⏳ 未着手 | 49 | IR・parser・generator・adapterを実装する | `src/core/<kind>/`, `src/core/adapters/` | parse → generate round-tripが成立する |
| ⏳ 未着手 | 50 | 専用GUIを実装する | `src/ui/<kind>/` | コンポーネント・接続の最低限編集ができる |
| ⏳ 未着手 | 51 | 保存経路を接続し回帰テストを追加する | `src/ui/MermaidEditor.tsx`, `tests/` | 編集後にMermaidブロックとして保存できる |

## テスト観点

| 対象 | 必須確認 |
| --- | --- |
| 種別判定 | 空行、`%%` コメント、`%% gui:*`、大文字小文字、fence付き入力 |
| fallback | 非実装種別を開いて編集・保存できること |
| flowchart | 既存テストが維持されること |
| metadata | GUIメタ情報がMermaid preview/exportに混入しないこと |
| sequence | 未対応行を削除しないこと、対応構文のround-tripが成立すること |
| 各新規種別 | 公式ドキュメント記載の対応構文のround-tripが成立すること、未対応行を削除しないこと |

## 最初のマイルストーン

| 状態 | タスク |
| --- | --- |
| ⏳ 未着手 | `detectDiagramKind` 追加 |
| ⏳ 未着手 | Source-only fallback追加 |
| ⏳ 未着手 | `MermaidEditor` のflowchart/fallback分岐 |
| ⏳ 未着手 | 非flowchartブロックでGUI起動時の parse error を解消 |
| ⏳ 未着手 | `npm run typecheck` / `npm test` 成功 |
