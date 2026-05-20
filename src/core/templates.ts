import type { DiagramKind } from "./diagram-kind";

export interface DiagramTemplate {
  kind: DiagramKind;
  /** Label shown in the picker UI. */
  label: string;
  /** One-line description of when this diagram type fits. */
  description: string;
  /** Minimal Mermaid source that parses, renders, and is GUI-editable. */
  source: string;
  /** Whether this template's kind currently has a bespoke GUI editor. */
  supportsGui: boolean;
}

const dedent = (s: string): string => s.replace(/^\n/, "").replace(/\n[ \t]+$/, "");

/**
 * Seed templates for the blank-state diagram picker. Each template is the
 * smallest source that lets the user immediately drag / type without a parse
 * error. Keep them deliberately tiny — users are expected to extend, not trim.
 */
export const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
  {
    kind: "flowchart",
    label: "Flowchart",
    description: "ノード・矢印で手順や関係を表現。GUI で形状・配線を編集",
    supportsGui: true,
    source: dedent(`
flowchart TD
  A[Start] --> B[Step]
  B --> C[End]
`),
  },
  {
    kind: "sequenceDiagram",
    label: "Sequence",
    description: "参加者間のメッセージ往復・時系列を表現",
    supportsGui: true,
    source: dedent(`
sequenceDiagram
  participant A
  participant B
  A->>B: Request
  B-->>A: Response
`),
  },
  {
    kind: "classDiagram",
    label: "Class",
    description: "クラス・属性・関係（継承/集約等）を表現",
    supportsGui: true,
    source: dedent(`
classDiagram
  class Animal {
    +String name
    +eat()
  }
  class Dog
  Animal <|-- Dog
`),
  },
  {
    kind: "stateDiagram-v2",
    label: "State",
    description: "状態と遷移を表現（stateDiagram-v2 で出力）",
    supportsGui: true,
    source: dedent(`
stateDiagram-v2
  [*] --> Idle
  Idle --> Running: start
  Running --> Idle: stop
  Running --> [*]
`),
  },
  {
    kind: "pie",
    label: "Pie",
    description: "比率を扇形で表現。ラベル + 数値の素直なグラフ",
    supportsGui: true,
    source: dedent(`
pie title Distribution
  "A" : 40
  "B" : 35
  "C" : 25
`),
  },
  {
    kind: "sankey-beta",
    label: "Sankey",
    description: "ソース → ターゲット間のフロー量を帯幅で表現",
    supportsGui: true,
    source: dedent(`
sankey-beta
A,B,10
A,C,5
B,D,8
`),
  },
  {
    kind: "quadrantChart",
    label: "Quadrant",
    description: "2 軸 4 象限のポジショニング。プレビュー上で点をドラッグ編集",
    supportsGui: true,
    source: dedent(`
quadrantChart
  title Reach vs Engagement
  x-axis Low --> High
  y-axis Low --> High
  quadrant-1 Champions
  quadrant-2 Promising
  quadrant-3 Niche
  quadrant-4 Underperforming
  Item A: [0.7, 0.8]
  Item B: [0.3, 0.6]
`),
  },
  {
    kind: "xychart-beta",
    label: "XY Chart",
    description: "棒/折れ線の数値グラフ",
    supportsGui: true,
    source: dedent(`
xychart-beta
  title "Monthly Sales"
  x-axis [Jan, Feb, Mar, Apr]
  y-axis "Amount" 0 --> 100
  bar [30, 60, 45, 80]
  line [30, 60, 45, 80]
`),
  },
  {
    kind: "radar-beta",
    label: "Radar (beta)",
    description: "多軸のレーダーチャート（Obsidian 内蔵 Mermaid 非対応のためプレビュー不可）",
    supportsGui: true,
    source: dedent(`
radar-beta
  axis A, B, C, D, E
  curve c1{1, 2, 3, 4, 5}
  showLegend true
`),
  },
];

export const getTemplate = (kind: DiagramKind): DiagramTemplate | undefined =>
  DIAGRAM_TEMPLATES.find((t) => t.kind === kind);
