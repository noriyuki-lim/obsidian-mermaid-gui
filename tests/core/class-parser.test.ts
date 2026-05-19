import { describe, expect, it } from "vitest";
import { parseClassDiagram } from "../../src/core/class/parser";

describe("parseClassDiagram", () => {
  it("returns ok for valid classDiagram header", () => {
    const result = parseClassDiagram("classDiagram\n  class Foo\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.kind).toBe("classDiagram");
  });

  it("returns error when header is missing", () => {
    expect(parseClassDiagram("flowchart TD\n").ok).toBe(false);
    expect(parseClassDiagram("").ok).toBe(false);
  });

  it("skips blank lines", () => {
    const result = parseClassDiagram("classDiagram\n\n  class Foo\n\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.items).toHaveLength(1);
  });

  it("skips YAML front matter", () => {
    const src = "---\ntitle: Test\n---\nclassDiagram\n  class Foo\n";
    const result = parseClassDiagram(src);
    expect(result.ok).toBe(true);
  });

  // ── Class declarations ──────────────────────────────────────────────────

  describe("class declarations", () => {
    it("parses simple class declaration", () => {
      const result = parseClassDiagram("classDiagram\n  class Animal\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "class", name: "Animal" });
    });

    it("parses block class with annotation", () => {
      const result = parseClassDiagram("classDiagram\n  class Fly {\n    <<interface>>\n    +fly()\n  }\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const cls = result.ir.items.find((i) => i.type === "class");
      expect(cls).toMatchObject({ type: "class", name: "Fly", annotation: "interface" });
    });

    it("parses block class without annotation", () => {
      const result = parseClassDiagram("classDiagram\n  class Duck {\n    +String beakColor\n    +swim()\n  }\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items.find((i) => i.type === "class")).toMatchObject({ type: "class", name: "Duck" });
      const members = result.ir.items.filter((i) => i.type === "member");
      expect(members).toHaveLength(2);
    });

    it("does not create duplicate class defs for inline members", () => {
      const src = "classDiagram\n  Animal : +int age\n  Animal : +String gender\n";
      const result = parseClassDiagram(src);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classDefs = result.ir.items.filter((i) => i.type === "class");
      expect(classDefs).toHaveLength(1);
    });
  });

  // ── Members ─────────────────────────────────────────────────────────────

  describe("members", () => {
    it("parses public attribute (inline form)", () => {
      const result = parseClassDiagram("classDiagram\n  Animal : +int age\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const m = result.ir.items.find((i) => i.type === "member");
      expect(m).toMatchObject({ type: "member", className: "Animal", visibility: "+", text: "int age", isMethod: false });
    });

    it("parses private method (inline form)", () => {
      const result = parseClassDiagram("classDiagram\n  Fish : -canEat()\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const m = result.ir.items.find((i) => i.type === "member");
      expect(m).toMatchObject({ type: "member", visibility: "-", isMethod: true });
    });

    it("parses member without visibility prefix", () => {
      const result = parseClassDiagram("classDiagram\n  Dog : run()\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const m = result.ir.items.find((i) => i.type === "member");
      expect(m).toMatchObject({ visibility: "", isMethod: true });
    });

    it("parses members in block form preserving order", () => {
      const src = "classDiagram\n  class Duck {\n    +String beakColor\n    +swim()\n    +quack() String\n  }\n";
      const result = parseClassDiagram(src);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const members = result.ir.items.filter((i) => i.type === "member");
      expect(members).toHaveLength(3);
      expect(members[2]).toMatchObject({ text: "quack() String", isMethod: true });
    });
  });

  // ── Relations ────────────────────────────────────────────────────────────

  describe("relations", () => {
    it("parses inheritance <|--", () => {
      const result = parseClassDiagram("classDiagram\n  Animal <|-- Duck\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items.find((i) => i.type === "relation")).toMatchObject({
        type: "relation", from: "Animal", to: "Duck", relation: "<|--",
      });
    });

    it("parses composition *--", () => {
      const result = parseClassDiagram("classDiagram\n  Car *-- Engine\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items.find((i) => i.type === "relation")).toMatchObject({
        relation: "*--", from: "Car", to: "Engine",
      });
    });

    it("parses relation with label", () => {
      const result = parseClassDiagram("classDiagram\n  Customer --> Order : places\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items.find((i) => i.type === "relation")).toMatchObject({
        from: "Customer", to: "Order", relation: "-->", label: "places",
      });
    });

    it("parses relation with cardinalities", () => {
      const result = parseClassDiagram(`classDiagram\n  Customer "1" o-- "0..*" Order : places\n`);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items.find((i) => i.type === "relation")).toMatchObject({
        from: "Customer", to: "Order", relation: "o--",
        fromCardinality: "1", toCardinality: "0..*", label: "places",
      });
    });

    it("parses all supported relation symbols", () => {
      const syms = ["<|--", "--|>", "*--", "--*", "o--", "--o", "-->", "<--", "--", "..>", "<..", "..|>", ".."];
      for (const sym of syms) {
        const result = parseClassDiagram(`classDiagram\n  A ${sym} B\n`);
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        const rel = result.ir.items.find((i) => i.type === "relation");
        expect(rel).toMatchObject({ relation: sym });
      }
    });
  });

  // ── Notes ────────────────────────────────────────────────────────────────

  describe("notes", () => {
    it("parses global note", () => {
      const result = parseClassDiagram(`classDiagram\n  note "global note text"\n`);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "note", text: "global note text" });
      expect((result.ir.items[0] as { forClass?: string }).forClass).toBeUndefined();
    });

    it("parses note for class", () => {
      const result = parseClassDiagram(`classDiagram\n  note for Duck "can fly"\n`);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "note", text: "can fly", forClass: "Duck" });
    });
  });

  // ── Raw item retention ────────────────────────────────────────────────────

  describe("raw item retention", () => {
    it("preserves unrecognised lines as raw items", () => {
      const src = "classDiagram\n  classDef someStyle fill:#f96\n  Animal <|-- Duck\n";
      const result = parseClassDiagram(src);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const raw = result.ir.items.filter((i) => i.type === "raw");
      expect(raw).toHaveLength(1);
    });

    it("preserves %% comments after header as raw", () => {
      const result = parseClassDiagram("classDiagram\n  %% inline comment\n  class Foo\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items.some((i) => i.type === "raw")).toBe(true);
    });
  });
});
