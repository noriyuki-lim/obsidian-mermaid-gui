# Mermaid種別拡張タスク

目的: flowchart専用GUIから、Mermaid種別ごとに拡張できる編集基盤へ移行する。

## 追加対象のMermaid種別

| 区分 | 種別 | 初期対応 |
| --- | --- | --- |
| 既存GUI維持 | `flowchart`, `graph` | Flowchart GUI |
| 最初のGUI追加対象 | `sequenceDiagram` | Sequence専用GUI |
| 次期GUI検討対象 | `classDiagram`, `stateDiagram-v2`, `stateDiagram` | MVP範囲を決めてから専用GUI化 |
| 編集形態を分類してから対応 | `mindmap`, `gantt`, `pie` | Source-onlyから開始し、tree / table / form editorを検討 |
| その他 | unknown | Source-only fallback |

## 実装方針

- 共通化するのは「種別判定」「adapter選択」「保存経路」までに留める。
- IRは種別ごとに分ける。`nodes` / `edges` 前提を sequence / class / state / mindmap に流用しない。
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

## Phase 5: 次の種別

| 状態 | 順序 | タスク | 判断観点 | 完了条件 |
| --- | ---: | --- | --- | --- |
| ⏳ 未着手 | 22 | classDiagram対応方針を決める | class / member / method / relation / annotation をどこまでGUI化するか | MVP範囲とIR案が決まる |
| ⏳ 未着手 | 23 | stateDiagram対応方針を決める | state / transition / nested state / start-end をどこまでGUI化するか | MVP範囲とIR案が決まる |
| ⏳ 未着手 | 24 | mindmap / gantt / pieの編集形態を分類する | mindmap=tree, gantt=table, pie=form/table が自然か | 種別ごとのUI方針が決まる |

## テスト観点

| 対象 | 必須確認 |
| --- | --- |
| 種別判定 | 空行、`%%` コメント、`%% gui:*`、大文字小文字、fence付き入力 |
| fallback | 非flowchartを開いて編集・保存できること |
| flowchart | 既存42件のテストが維持されること |
| metadata | GUIメタ情報がMermaid preview/exportに混入しないこと |
| sequence | 未対応行を削除しないこと、対応構文のround-tripが成立すること |

## 最初のマイルストーン

| 状態 | タスク |
| --- | --- |
| ⏳ 未着手 | `detectDiagramKind` 追加 |
| ⏳ 未着手 | Source-only fallback追加 |
| ⏳ 未着手 | `MermaidEditor` のflowchart/fallback分岐 |
| ⏳ 未着手 | 非flowchartブロックでGUI起動時の parse error を解消 |
| ⏳ 未着手 | `npm run typecheck` / `npm test` 成功 |
