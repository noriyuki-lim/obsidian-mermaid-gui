import { describe, expect, it } from "vitest";
import { generateSankey } from "../../src/core/sankey/generator";
import { parseSankey } from "../../src/core/sankey/parser";
import type { SankeyIR } from "../../src/core/sankey/ir-types";

describe("generateSankey", () => {
  it("generates header only for empty IR", () => {
    const ir: SankeyIR = { kind: "sankey-beta", hasHeaderRow: false, items: [] };
    expect(generateSankey(ir)).toBe("sankey-beta\n");
  });

  it("emits the CSV header row when flagged", () => {
    const ir: SankeyIR = { kind: "sankey-beta", hasHeaderRow: true, items: [] };
    expect(generateSankey(ir)).toContain("source,target,value");
  });

  it("renders unquoted fields without quotes", () => {
    const ir: SankeyIR = {
      kind: "sankey-beta",
      hasHeaderRow: false,
      items: [{ type: "link", source: "A", target: "B", value: 5 }],
    };
    expect(generateSankey(ir)).toContain("A,B,5");
  });

  it("quotes fields that contain commas", () => {
    const ir: SankeyIR = {
      kind: "sankey-beta",
      hasHeaderRow: false,
      items: [{ type: "link", source: "Node, A", target: "B", value: 1 }],
    };
    expect(generateSankey(ir)).toContain('"Node, A",B,1');
  });

  it("escapes embedded double quotes", () => {
    const ir: SankeyIR = {
      kind: "sankey-beta",
      hasHeaderRow: false,
      items: [{ type: "link", source: 'with "q"', target: "B", value: 1 }],
    };
    expect(generateSankey(ir)).toContain('"with ""q""",B,1');
  });

  it("preserves raw lines verbatim", () => {
    const ir: SankeyIR = {
      kind: "sankey-beta",
      hasHeaderRow: false,
      items: [{ type: "raw", line: "%% comment" }],
    };
    expect(generateSankey(ir)).toContain("%% comment");
  });
});

describe("sankey parse → generate → parse round-trip", () => {
  const src = `sankey-beta
source,target,value
%% leading comment
A,B,100
"Node, A",B,5
"with ""q""",C,2
`;

  it("generates parseable output", () => {
    const first = parseSankey(src);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = parseSankey(generateSankey(first.ir));
    expect(second.ok).toBe(true);
  });

  it("preserves hasHeaderRow", () => {
    const first = parseSankey(src);
    if (!first.ok) return;
    const second = parseSankey(generateSankey(first.ir));
    if (!second.ok) return;
    expect(second.ir.hasHeaderRow).toBe(true);
  });

  it("preserves link fields", () => {
    const first = parseSankey(src);
    if (!first.ok) return;
    const second = parseSankey(generateSankey(first.ir));
    if (!second.ok) return;
    const l1 = first.ir.items.filter((i) => i.type === "link");
    const l2 = second.ir.items.filter((i) => i.type === "link");
    expect(l2).toEqual(l1);
  });
});
