import { describe, expect, it } from "vitest";
import { detectDiagramKind } from "../../src/core/diagram-kind";

describe("detectDiagramKind", () => {
  it("detects flowchart with direction", () => {
    expect(detectDiagramKind("flowchart TD\n  A --> B")).toBe("flowchart");
    expect(detectDiagramKind("flowchart LR\n  A --> B")).toBe("flowchart");
  });

  it("treats graph as flowchart", () => {
    expect(detectDiagramKind("graph TD\n  A --> B")).toBe("flowchart");
  });

  it("detects sequenceDiagram", () => {
    expect(detectDiagramKind("sequenceDiagram\n  A->>B: hello")).toBe("sequenceDiagram");
  });

  it("detects classDiagram", () => {
    expect(detectDiagramKind("classDiagram\n  Animal <|-- Duck")).toBe("classDiagram");
  });

  it("detects stateDiagram-v2 before stateDiagram", () => {
    expect(detectDiagramKind("stateDiagram-v2\n  s1 --> s2")).toBe("stateDiagram-v2");
    expect(detectDiagramKind("stateDiagram\n  s1 --> s2")).toBe("stateDiagram");
  });

  it("detects pie", () => {
    expect(detectDiagramKind('pie title Pets\n  "Dogs": 386')).toBe("pie");
    expect(detectDiagramKind("pie\n  ...")).toBe("pie");
  });

  it("detects data visualisation types", () => {
    expect(detectDiagramKind("xychart-beta\n  ...")).toBe("xychart-beta");
    expect(detectDiagramKind("sankey-beta\n  ...")).toBe("sankey-beta");
    expect(detectDiagramKind("quadrantChart\n  ...")).toBe("quadrantChart");
    expect(detectDiagramKind("radar-beta\n  ...")).toBe("radar-beta");
  });

  it("detects time-series types", () => {
    expect(detectDiagramKind("gantt\n  ...")).toBe("gantt");
    expect(detectDiagramKind("timeline\n  ...")).toBe("timeline");
  });

  it("detects graph/hierarchy types", () => {
    expect(detectDiagramKind("erDiagram\n  ...")).toBe("erDiagram");
    expect(detectDiagramKind("mindmap\n  root")).toBe("mindmap");
    expect(detectDiagramKind("treemap-beta\n  ...")).toBe("treemap-beta");
    expect(detectDiagramKind("venn-beta\n  ...")).toBe("venn-beta");
  });

  it("detects journey", () => {
    expect(detectDiagramKind("journey\n  ...")).toBe("journey");
  });

  it("detects infrastructure types", () => {
    expect(detectDiagramKind("architecture-beta\n  ...")).toBe("architecture-beta");
    expect(detectDiagramKind("block-beta\n  ...")).toBe("block-beta");
  });

  it("returns unknown for unrecognised first line", () => {
    expect(detectDiagramKind("gitGraph\n  commit")).toBe("unknown");
    expect(detectDiagramKind("")).toBe("unknown");
  });

  it("skips blank lines before the first content line", () => {
    expect(detectDiagramKind("\n\nflowchart TD\n  A --> B")).toBe("flowchart");
  });

  it("skips %% comments", () => {
    expect(detectDiagramKind("%% a comment\nsequenceDiagram\n  A->>B: hi")).toBe("sequenceDiagram");
  });

  it("skips %% gui:* metadata comments", () => {
    const src = `%% gui:positions {}
%% gui:meta {"version":2}
flowchart LR
  A --> B`;
    expect(detectDiagramKind(src)).toBe("flowchart");
  });
});
