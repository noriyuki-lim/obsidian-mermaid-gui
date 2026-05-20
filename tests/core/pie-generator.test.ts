import { describe, expect, it } from "vitest";
import { generatePie } from "../../src/core/pie/generator";
import { parsePie } from "../../src/core/pie/parser";
import type { PieIR } from "../../src/core/pie/ir-types";

describe("generatePie", () => {
  it("generates bare pie header for empty IR", () => {
    const ir: PieIR = { kind: "pie", showData: false, items: [] };
    expect(generatePie(ir)).toBe("pie\n");
  });

  it("appends showData when flagged", () => {
    const ir: PieIR = { kind: "pie", showData: true, items: [] };
    expect(generatePie(ir).startsWith("pie showData")).toBe(true);
  });

  it("emits quoted title when it contains whitespace", () => {
    const ir: PieIR = { kind: "pie", showData: false, title: "Sales 2024", items: [] };
    expect(generatePie(ir)).toContain('title "Sales 2024"');
  });

  it("emits bare title when it has no special characters", () => {
    const ir: PieIR = { kind: "pie", showData: false, title: "Sales", items: [] };
    expect(generatePie(ir)).toContain("title Sales");
    expect(generatePie(ir)).not.toContain('"Sales"');
  });

  it("renders slice with two-space indent", () => {
    const ir: PieIR = {
      kind: "pie",
      showData: false,
      items: [{ type: "slice", label: "A", value: 10 }],
    };
    expect(generatePie(ir)).toContain('  "A" : 10');
  });

  it("preserves raw line verbatim", () => {
    const ir: PieIR = {
      kind: "pie",
      showData: false,
      items: [{ type: "raw", line: "  %% keep me" }],
    };
    expect(generatePie(ir)).toContain("  %% keep me");
  });

  it("ends with a trailing newline", () => {
    const ir: PieIR = {
      kind: "pie",
      showData: false,
      items: [{ type: "slice", label: "A", value: 1 }],
    };
    expect(generatePie(ir).endsWith("\n")).toBe(true);
  });
});

describe("pie parse → generate → parse round-trip", () => {
  const src = `pie showData title "My Chart"
  %% leading comment
  "Section A" : 30
  "Section B" : 70.5
  unknownDirective
`;

  it("generates parseable output", () => {
    const first = parsePie(src);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = parsePie(generatePie(first.ir));
    expect(second.ok).toBe(true);
  });

  it("preserves item count and types in order", () => {
    const first = parsePie(src);
    if (!first.ok) return;
    const second = parsePie(generatePie(first.ir));
    if (!second.ok) return;
    expect(second.ir.items.map((i) => i.type)).toEqual(first.ir.items.map((i) => i.type));
  });

  it("preserves showData and title across round-trip", () => {
    const first = parsePie(src);
    if (!first.ok) return;
    const second = parsePie(generatePie(first.ir));
    if (!second.ok) return;
    expect(second.ir.showData).toBe(first.ir.showData);
    expect(second.ir.title).toBe(first.ir.title);
  });

  it("preserves slice label and value", () => {
    const first = parsePie(src);
    if (!first.ok) return;
    const second = parsePie(generatePie(first.ir));
    if (!second.ok) return;
    const s1 = first.ir.items.filter((i) => i.type === "slice");
    const s2 = second.ir.items.filter((i) => i.type === "slice");
    expect(s2).toEqual(s1);
  });
});
