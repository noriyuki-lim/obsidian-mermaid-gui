import { describe, expect, it } from "vitest";
import { parsePie } from "../../src/core/pie/parser";

describe("parsePie", () => {
  it("returns ok for minimal pie header", () => {
    const result = parsePie("pie\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.kind).toBe("pie");
    expect(result.ir.showData).toBe(false);
    expect(result.ir.title).toBeUndefined();
    expect(result.ir.items).toHaveLength(0);
  });

  it("returns error when header is missing", () => {
    expect(parsePie("flowchart TD\n").ok).toBe(false);
    expect(parsePie("").ok).toBe(false);
  });

  it("skips blank lines and %% comments before header", () => {
    const result = parsePie('\n%% comment\npie title "x"\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.title).toBe("x");
  });

  describe("header parsing", () => {
    it("parses showData flag", () => {
      const result = parsePie("pie showData\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.showData).toBe(true);
    });

    it("parses quoted title", () => {
      const result = parsePie('pie title "Sales 2024"\n');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.title).toBe("Sales 2024");
    });

    it("parses bare title", () => {
      const result = parsePie("pie title Sales\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.title).toBe("Sales");
    });

    it("parses showData + title in either order", () => {
      const a = parsePie('pie showData title "x"\n');
      const b = parsePie('pie title "x" showData\n');
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.ir.showData).toBe(true);
      expect(a.ir.title).toBe("x");
      expect(b.ir.showData).toBe(true);
      expect(b.ir.title).toBe("x");
    });
  });

  describe("slice parsing", () => {
    it("parses integer value", () => {
      const result = parsePie('pie\n  "A" : 42\n');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "slice", label: "A", value: 42 });
    });

    it("parses decimal value", () => {
      const result = parsePie('pie\n  "B" : 30.5\n');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "slice", label: "B", value: 30.5 });
    });

    it("parses multiple slices in order", () => {
      const src = 'pie\n  "A" : 10\n  "B" : 20\n  "C" : 30\n';
      const result = parsePie(src);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const slices = result.ir.items.filter((i) => i.type === "slice");
      expect(slices).toHaveLength(3);
      expect((slices[1] as { label: string }).label).toBe("B");
    });
  });

  describe("raw item retention", () => {
    it("preserves %% comments after header as raw items", () => {
      const result = parsePie('pie\n  %% inline\n  "A" : 1\n');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const raws = result.ir.items.filter((i) => i.type === "raw");
      expect(raws).toHaveLength(1);
    });

    it("preserves unsupported lines as raw items", () => {
      const result = parsePie('pie\n  unknownDirective\n  "A" : 1\n');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const raws = result.ir.items.filter((i) => i.type === "raw");
      expect(raws).toHaveLength(1);
    });

    it("preserves relative order between raw and slice items", () => {
      const src = 'pie\n  "A" : 1\n  %% mid\n  "B" : 2\n';
      const result = parsePie(src);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items.map((i) => i.type)).toEqual(["slice", "raw", "slice"]);
    });
  });
});
