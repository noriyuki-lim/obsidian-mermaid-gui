import { describe, it, expect } from "vitest";
import { parseErDiagram } from "../../src/core/er/parser";
import { generateErDiagram } from "../../src/core/er/generator";

describe("generateErDiagram — round-trip", () => {
  const roundTrip = (src: string) => {
    const out = parseErDiagram(src);
    if (!out.ok) throw new Error(out.message);
    const generated = generateErDiagram(out.ir);
    const out2 = parseErDiagram(generated);
    if (!out2.ok) throw new Error(out2.message);
    return { first: out.ir, second: out2.ir };
  };

  it("entity with attributes round-trips", () => {
    const src = `erDiagram
    CUSTOMER {
        string name
        string id PK
    }`;
    const { first, second } = roundTrip(src);
    expect(second.entities).toHaveLength(first.entities.length);
    expect(second.entities[0].name).toBe(first.entities[0].name);
    expect(second.entities[0].attributes).toEqual(first.entities[0].attributes);
  });

  it("relationship round-trips", () => {
    const src = `erDiagram
    CUSTOMER ||--o{ ORDER : "places"
    ORDER ||--|{ LINE-ITEM : "contains"`;
    const { first, second } = roundTrip(src);
    expect(second.items).toHaveLength(first.items.length);
    const r1 = first.items[0];
    const r2 = second.items[0];
    if (r1.type !== "relationship" || r2.type !== "relationship") throw new Error("expected relationship");
    expect(r2.leftEntity).toBe(r1.leftEntity);
    expect(r2.rightCard).toBe(r1.rightCard);
    expect(r2.label).toBe(r1.label);
  });

  it("generated source starts with erDiagram", () => {
    const src = `erDiagram\n    A ||--|| B : "link"`;
    const out = parseErDiagram(src);
    if (!out.ok) throw new Error(out.message);
    expect(generateErDiagram(out.ir)).toMatch(/^erDiagram/);
  });
});
