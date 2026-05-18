# Mermaid種別拡張タスク

目的: flowchart専用GUIから、Mermaid種別ごとに拡張できる編集基盤へ移行する。

| 状態 | 順序 | タスク | 完了条件 |
| --- | ---: | --- | --- |
| ⏳ 未着手 | 1 | Mermaid種別判定を独立させる | `detectDiagramKind(source)` が先頭の有効行から `flowchart` / `graph` / `sequenceDiagram` / `classDiagram` / `stateDiagram-v2` / `mindmap` 等を判定できる |
| ⏳ 未着手 | 2 | 非対応種別の扱いを定義する | GUI未対応種別で parser error を出さず、Source-only または Preview-only として開ける |
| ⏳ 未着手 | 3 | 既存flowchart処理をadapter化する | 現行 `parser.ts` / `generator.ts` の責務を `flowchartAdapter` 経由で呼び出せる |
| ⏳ 未着手 | 4 | adapter registryを追加する | `kind` から対応adapterを引き、未登録種別はfallback editorへ渡せる |
| ⏳ 未着手 | 5 | IRの親型を導入する | `DiagramIR` が `kind` ごとに別IRを保持し、flowchart専用 `nodes/edges` 前提を外側へ漏らさない |
| ⏳ 未着手 | 6 | Editor分岐を追加する | `MermaidEditor` が `FlowchartEditor` / `SourceOnlyEditor` を種別に応じて表示する |
| ⏳ 未着手 | 7 | Editボタンの起動失敗を解消する | 非flowchart Mermaidブロックを開いても Notice の parse error だけで終わらない |
| ⏳ 未着手 | 8 | sequenceDiagram MVPのIRを設計する | participant / actor / message / note / activation を表現でき、未対応行は `rawLines` に保持できる |
| ⏳ 未着手 | 9 | sequenceDiagram parserを追加する | 対応構文を構造化し、順序と未対応行を落とさず保持する |
| ⏳ 未着手 | 10 | sequenceDiagram generatorを追加する | parser結果を Mermaid source に戻し、対応構文の round-trip が成立する |
| ⏳ 未着手 | 11 | sequenceDiagram編集UIを作る | participant一覧とmessage行リストを編集できる |
| ⏳ 未着手 | 12 | sequenceDiagramの保存経路を接続する | GUI編集後に Mermaid block body として保存できる |
| ⏳ 未着手 | 13 | classDiagram対応方針を決める | class / member / method / relation / annotation の最小対応範囲を決める |
| ⏳ 未着手 | 14 | stateDiagram対応方針を決める | state / transition / nested state / start-end の最小対応範囲を決める |
| ⏳ 未着手 | 15 | mindmap / gantt / pieの編集形態を分類する | tree editor / table editor / form editor のどれで扱うかを決める |

## 実装順の基準

- 先に共通基盤を作り、個別種別は後から差し込む。
- Mermaid全構文の完全対応は目指さない。
- GUIで理解できる構文だけ構造化し、その他は `rawLines` として保持する。
- flowchart既存挙動の回帰を最優先で防ぐ。

## 最初のマイルストーン

| 状態 | タスク |
| --- | --- |
| ⏳ 未着手 | `detectDiagramKind` 追加 |
| ⏳ 未着手 | flowchart adapter化 |
| ⏳ 未着手 | Source-only fallback追加 |
| ⏳ 未着手 | 非flowchartブロックでGUI起動時の parse error を解消 |
| ⏳ 未着手 | 既存 `npm run typecheck` / `npm test` 成功 |
