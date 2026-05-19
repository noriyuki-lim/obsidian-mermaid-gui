import { describe, expect, it } from "vitest";
import { parseClassDiagram } from "../../src/core/class/parser";
import { generateClassDiagram } from "../../src/core/class/generator";
import type { ClassDiagramIR } from "../../src/core/class/ir-types";

const roundTrip = (source: string): ClassDiagramIR | null => {
  const r1 = parseClassDiagram(source);
  if (!r1.ok) return null;
  const generated = generateClassDiagram(r1.ir);
  const r2 = parseClassDiagram(generated);
  return r2.ok ? r2.ir : null;
};

describe("generateClassDiagram", () => {
  it("outputs classDiagram header", () => {
    const ir: ClassDiagramIR = { kind: "classDiagram", items: [] };
    expect(generateClassDiagram(ir)).toMatch(/^classDiagram/);
  });

  it("outputs simple class", () => {
    const ir: ClassDiagramIR = {
      kind: "classDiagram",
      items: [{ type: "class", name: "Animal" }],
    };
    expect(generateClassDiagram(ir)).toContain("class Animal");
  });

  it("outputs class with annotation and members as block", () => {
    const ir: ClassDiagramIR = {
      kind: "classDiagram",
      items: [
        { type: "class", name: "Fly", annotation: "interface" },
        { type: "member", className: "Fly", visibility: "+", text: "fly()", isMethod: true },
      ],
    };
    const out = generateClassDiagram(ir);
    expect(out).toContain("<<interface>>");
    expect(out).toContain("+fly()");
    expect(out).toContain("{");
    expect(out).toContain("}");
  });

  it("outputs relation", () => {
    const ir: ClassDiagramIR = {
      kind: "classDiagram",
      items: [
        { type: "relation", from: "Animal", to: "Duck", relation: "<|--" },
      ],
    };
    expect(generateClassDiagram(ir)).toContain("Animal <|-- Duck");
  });

  it("outputs relation with cardinalities and label", () => {
    const ir: ClassDiagramIR = {
      kind: "classDiagram",
      items: [{
        type: "relation", from: "Customer", to: "Order", relation: "o--",
        fromCardinality: "1", toCardinality: "0..*", label: "places",
      }],
    };
    const out = generateClassDiagram(ir);
    expect(out).toContain('"1"');
    expect(out).toContain('"0..*"');
    expect(out).toContain("places");
  });

  it("outputs note and note-for-class", () => {
    const ir: ClassDiagramIR = {
      kind: "classDiagram",
      items: [
        { type: "note", text: "global note" },
        { type: "note", text: "class note", forClass: "Foo" },
      ],
    };
    const out = generateClassDiagram(ir);
    expect(out).toContain('note "global note"');
    expect(out).toContain('note for Foo "class note"');
  });

  it("preserves raw lines verbatim", () => {
    const raw = "  classDef special fill:#f96";
    const ir: ClassDiagramIR = {
      kind: "classDiagram",
      items: [{ type: "raw", line: raw }],
    };
    expect(generateClassDiagram(ir)).toContain(raw);
  });

  it("does not emit member twice (once via class block, once standalone)", () => {
    const ir: ClassDiagramIR = {
      kind: "classDiagram",
      items: [
        { type: "class", name: "Duck" },
        { type: "member", className: "Duck", visibility: "+", text: "swim()", isMethod: true },
      ],
    };
    const out = generateClassDiagram(ir);
    const occurrences = (out.match(/swim\(\)/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  // ── Round-trip ───────────────────────────────────────────────────────────

  describe("round-trip", () => {
    it("class + members + relations", () => {
      const src = `classDiagram
  Animal <|-- Duck
  Animal : +int age
  class Duck {
    +String beakColor
    +swim()
  }
`;
      const ir2 = roundTrip(src);
      expect(ir2).not.toBeNull();
      if (!ir2) return;
      expect(ir2.items.filter((i) => i.type === "class").map((i) => (i as { name: string }).name)).toContain("Duck");
      expect(ir2.items.filter((i) => i.type === "relation")).toHaveLength(1);
      expect(ir2.items.filter((i) => i.type === "member").length).toBeGreaterThanOrEqual(3);
    });

    it("class with annotation survives round-trip", () => {
      const src = "classDiagram\n  class Fly {\n    <<interface>>\n    +fly()\n  }\n";
      const ir2 = roundTrip(src);
      expect(ir2).not.toBeNull();
      if (!ir2) return;
      const cls = ir2.items.find((i) => i.type === "class") as { annotation?: string } | undefined;
      expect(cls?.annotation).toBe("interface");
    });

    it("raw lines are preserved through round-trip", () => {
      const src = "classDiagram\n  classDef special fill:#f96\n  class Foo\n";
      const ir2 = roundTrip(src);
      expect(ir2).not.toBeNull();
      if (!ir2) return;
      expect(ir2.items.some((i) => i.type === "raw")).toBe(true);
    });
  });
});
