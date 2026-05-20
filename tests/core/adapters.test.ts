import { describe, expect, it } from "vitest";
import { getAdapter } from "../../src/core/adapters/index";
import { detectDiagramKind } from "../../src/core/diagram-kind";

describe("adapter registry", () => {
  it("returns flowchart adapter for 'flowchart' kind", () => {
    const adapter = getAdapter("flowchart");
    expect(adapter).not.toBeNull();
    expect(adapter?.kind).toBe("flowchart");
    expect(adapter?.supportsGui).toBe(true);
  });

  it("returns null for unknown kind", () => {
    expect(getAdapter("unknown")).toBeNull();
  });

  it("returns sequenceDiagram adapter", () => {
    const adapter = getAdapter("sequenceDiagram");
    expect(adapter).not.toBeNull();
    expect(adapter?.kind).toBe("sequenceDiagram");
    expect(adapter?.supportsGui).toBe(true);
  });

  it("returns classDiagram adapter", () => {
    const adapter = getAdapter("classDiagram");
    expect(adapter).not.toBeNull();
    expect(adapter?.kind).toBe("classDiagram");
    expect(adapter?.supportsGui).toBe(true);
  });

  it("returns stateDiagram-v2 adapter", () => {
    const adapter = getAdapter("stateDiagram-v2");
    expect(adapter).not.toBeNull();
    expect(adapter?.supportsGui).toBe(true);
  });

  it("returns null for unknown kind", () => {
    expect(getAdapter("unknown")).toBeNull();
  });

  it.each([
    ["pie"],
    ["sankey-beta"],
    ["quadrantChart"],
    ["xychart-beta"],
    ["radar-beta"],
  ] as const)("returns Phase 6 adapter for %s", (kind) => {
    const adapter = getAdapter(kind);
    expect(adapter).not.toBeNull();
    expect(adapter?.kind).toBe(kind);
    expect(adapter?.supportsGui).toBe(true);
  });
});

describe("flowchart adapter — raw line retention (Task 14)", () => {
  const adapter = getAdapter("flowchart")!;

  it("preserves unrecognised lines through parse → generate round-trip", () => {
    const source = `flowchart TD
  A --> B
  classDef myStyle fill:#f96
  style A fill:#bbf
`;
    const result = adapter.parse(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const generated = adapter.generate(result.ir);
    expect(generated).toContain("classDef myStyle");
    expect(generated).toContain("style A fill:#bbf");
  });

  it("preserves relative order of raw lines in output", () => {
    const source = `flowchart LR
  A --> B
  click A callback "Tooltip"
  linkStyle 0 stroke:#ff3
`;
    const result = adapter.parse(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const generated = adapter.generate(result.ir);
    const clickIdx = generated.indexOf("click A");
    const linkIdx = generated.indexOf("linkStyle 0");
    expect(clickIdx).toBeGreaterThan(-1);
    expect(linkIdx).toBeGreaterThan(-1);
    expect(clickIdx).toBeLessThan(linkIdx);
  });

  it("adapter kind matches detectDiagramKind for flowchart source", () => {
    const source = "flowchart TD\n  A --> B\n";
    const kind = detectDiagramKind(source);
    const adapter2 = getAdapter(kind);
    expect(adapter2?.kind).toBe("flowchart");
  });
});
