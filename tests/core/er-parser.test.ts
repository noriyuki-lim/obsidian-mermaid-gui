import { describe, it, expect } from "vitest";
import { parseErDiagram } from "../../src/core/er/parser";

describe("parseErDiagram", () => {
  it("parses header-only source", () => {
    const out = parseErDiagram("erDiagram");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.kind).toBe("erDiagram");
    expect(out.ir.entities).toHaveLength(0);
    expect(out.ir.items).toHaveLength(0);
  });

  it("parses entity with attributes", () => {
    const src = `erDiagram
    CUSTOMER {
        string name
        string customerId PK
        string sector FK "the sector"
    }`;
    const out = parseErDiagram(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.entities).toHaveLength(1);
    const e = out.ir.entities[0];
    expect(e.name).toBe("CUSTOMER");
    expect(e.attributes).toHaveLength(3);
    expect(e.attributes[0]).toMatchObject({ type: "string", name: "name", keys: [] });
    expect(e.attributes[1]).toMatchObject({ type: "string", name: "customerId", keys: ["PK"] });
    expect(e.attributes[2]).toMatchObject({ type: "string", name: "sector", keys: ["FK"], comment: "the sector" });
  });

  it("parses relationship line", () => {
    const src = `erDiagram
    CUSTOMER ||--o{ ORDER : "places"`;
    const out = parseErDiagram(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.items).toHaveLength(1);
    const rel = out.ir.items[0];
    expect(rel.type).toBe("relationship");
    if (rel.type !== "relationship") return;
    expect(rel.leftEntity).toBe("CUSTOMER");
    expect(rel.leftCard).toBe("||");
    expect(rel.lineStyle).toBe("--");
    expect(rel.rightCard).toBe("o{");
    expect(rel.rightEntity).toBe("ORDER");
    expect(rel.label).toBe("places");
  });

  it("parses dotted relationship", () => {
    const src = `erDiagram
    A }|..|| B : "rel"`;
    const out = parseErDiagram(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const rel = out.ir.items[0];
    if (rel.type !== "relationship") return;
    expect(rel.lineStyle).toBe("..");
  });

  it("preserves unrecognised lines as raw items", () => {
    const src = `erDiagram
    %% a comment
    UNKNOWN_SYNTAX HERE`;
    const out = parseErDiagram(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // comment is skipped; unknown syntax becomes raw
    expect(out.ir.items.some((i) => i.type === "raw")).toBe(true);
  });

  it("returns failure for missing header", () => {
    const out = parseErDiagram("CUSTOMER ||--|| ORDER : \"rel\"");
    expect(out.ok).toBe(false);
  });
});
