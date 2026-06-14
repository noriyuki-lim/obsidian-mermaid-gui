import type { DiagramKind } from "./diagram-kind";

/**
 * Editor maturity, used to split the picker into "Available" and "Under
 * Construction" sections. `available` = the editor offers graphical, direct-
 * manipulation editing (a canvas or an interactive preview), not just forms.
 * Distinct from `supportsGui`, which only flags whether a bespoke editor
 * exists at all.
 */
export type EditorStage = "available" | "wip";

export interface DiagramTemplate {
  kind: DiagramKind;
  /** Label shown in the picker UI. */
  label: string;
  /** One-line description of when this diagram type fits. */
  description: string;
  /**
   * Minimal Mermaid source that parses, renders, and is GUI-editable. A
   * function form lets a template inject runtime values (e.g. gantt seeds dates
   * relative to today); call it via {@link templateSource}.
   */
  source: string | (() => string);
  /** Whether this template's kind currently has a bespoke GUI editor. */
  supportsGui: boolean;
  /** Picker grouping: graphical editing available vs. work-in-progress. */
  editorStage: EditorStage;
}

/** Resolve a template's source, evaluating the function form if present. */
export const templateSource = (t: DiagramTemplate): string =>
  typeof t.source === "function" ? t.source() : t.source;

const dedent = (s: string): string => s.replace(/^\n/, "").replace(/\n[ \t]+$/, "");

const pad2 = (n: number): string => String(n).padStart(2, "0");
const isoDate = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * Gantt seed spanning roughly today → +3 months. Generated at pick time so the
 * sample lands on the user's current dates. Every task carries an id and chains
 * via `after <prev>`; the last item is a milestone. `axisFormat` is preserved as
 * a raw line until the gantt editor formalises it into IR.
 */
const ganttTemplate = (): string =>
  dedent(`
gantt
    title Project Plan
    dateFormat YYYY-MM-DD
    axisFormat %m/%d
    section Planning
        Requirements :t1, ${isoDate(new Date())}, 2w
        Design :t2, after t1, 3w
    section Build
        Implementation :t3, after t2, 5w
        Review :t4, after t3, 2w
    section Release
        Launch :milestone, m1, after t4, 0d
`);

/**
 * Seed templates for the blank-state diagram picker. Each template is the
 * smallest source that lets the user immediately drag / type without a parse
 * error. Keep them deliberately tiny — users are expected to extend, not trim.
 */
export const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
  {
    kind: "flowchart",
    editorStage: "available",
    label: "Flowchart",
    description: "ノード・矢印で手順や関係を表現。GUI で形状・配線を編集",
    supportsGui: true,
    source: dedent(`
flowchart TD
  n1[Start] --> n2[Step]
  n2 --> n3[End]
`),
  },
  {
    kind: "sequenceDiagram",
    editorStage: "wip",
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
    editorStage: "wip",
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
    editorStage: "wip",
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
    editorStage: "wip",
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
    editorStage: "wip",
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
    editorStage: "available",
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
    editorStage: "wip",
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
    editorStage: "wip",
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
  {
    kind: "gantt",
    editorStage: "available",
    label: "Gantt",
    description: "タスクとスケジュールをバーで表現するプロジェクト管理図",
    supportsGui: true,
    source: ganttTemplate,
  },
  {
    kind: "timeline",
    editorStage: "wip",
    label: "Timeline",
    description: "時系列のイベントや出来事を年表形式で表現",
    supportsGui: true,
    source: dedent(`
timeline
    title Project History
    2022 : Planning
    2023 : Development
         : Testing
    2024 : Launch
`),
  },
  {
    kind: "erDiagram",
    editorStage: "wip",
    label: "ER Diagram",
    description: "エンティティ・属性・リレーションシップを表現するER図",
    supportsGui: true,
    source: dedent(`
erDiagram
    CUSTOMER {
        string name
        string customerId PK
    }
    ORDER {
        int orderId PK
        string customerId FK
    }
    CUSTOMER ||--o{ ORDER : "places"
`),
  },
  {
    kind: "mindmap",
    editorStage: "wip",
    label: "Mindmap",
    description: "階層的なアイデアや構造をツリーで表現するマインドマップ",
    supportsGui: true,
    source: dedent(`
mindmap
  root((Root))
    Topic A
      Subtopic 1
      Subtopic 2
    Topic B
`),
  },
  {
    kind: "treemap-beta",
    label: "Treemap (beta)",
    description: "階層データの面積比で可視化（Obsidian 内蔵 Mermaid 非対応のためプレビュー不可）",
    supportsGui: false,
    editorStage: "wip",
    source: dedent(`
treemap-beta
  title My Treemap
  A: 40
  B: 30
  C: 30
`),
  },
  {
    kind: "journey",
    editorStage: "wip",
    label: "User Journey",
    description: "ユーザータスクと満足度スコア（1-7）を時系列で表現するUX分析図",
    supportsGui: true,
    source: dedent(`
journey
    title My working day
    section Go to work
      Make tea: 5: Me
      Go upstairs: 3: Me
      Do work: 1: Me, Cat
    section Go home
      Go downstairs: 5: Me
      Sit down: 5: Me
`),
  },
  {
    kind: "architecture-beta",
    editorStage: "wip",
    label: "Architecture (beta)",
    description: "クラウド/インフラ構成図。group / service / edge の関係を表現",
    supportsGui: true,
    source: dedent(`
architecture-beta
    group api(cloud)[API]
    service db(database)[Database] in api
    service server(server)[Server] in api
    db:L -- R:server
`),
  },
  {
    kind: "block-beta",
    editorStage: "available",
    label: "Block (beta)",
    description: "コンポーネント配置をブロックとカラム数で表現するシステム設計図",
    supportsGui: true,
    source: dedent(`
block-beta
    columns 3
    A["Client"]
    B["Server"]
    C["DB"]
`),
  },
  {
    kind: "venn-beta",
    label: "Venn (beta)",
    description: "集合の重なりを表現するベン図（Obsidian 内蔵 Mermaid 非対応のためプレビュー不可）",
    supportsGui: false,
    editorStage: "wip",
    source: dedent(`
venn-beta
  title Venn
  A "Set A"
  B "Set B"
  A,B "Intersection"
`),
  },
  {
    kind: "kanban",
    editorStage: "available",
    label: "Kanban",
    description: "カラムとカードでワークフローを表現するカンバンボード（カードをドラッグで移動）",
    supportsGui: true,
    source: dedent(`
kanban
  todo[To Do]
    t1[Draft spec]
    t2[Review PR]
  doing[In Progress]
    t3[Build feature]
  done[Done]
    t4[Ship release]
`),
  },
];

export const getTemplate = (kind: DiagramKind): DiagramTemplate | undefined =>
  DIAGRAM_TEMPLATES.find((t) => t.kind === kind);
