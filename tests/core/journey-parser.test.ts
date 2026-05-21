import { describe, it, expect } from "vitest";
import { parseJourney } from "../../src/core/journey/parser";

describe("parseJourney", () => {
  it("parses header-only source", () => {
    const out = parseJourney("journey");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.kind).toBe("journey");
    expect(out.ir.items).toHaveLength(0);
  });

  it("parses title", () => {
    const out = parseJourney("journey\n    title My day");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.title).toBe("My day");
  });

  it("parses sections and tasks", () => {
    const src = `journey
    title My working day
    section Go to work
      Make tea: 5: Me
      Do work: 1: Me, Cat`;
    const out = parseJourney(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.title).toBe("My working day");
    expect(out.ir.items).toHaveLength(3);
    expect(out.ir.items[0]).toMatchObject({ type: "section", title: "Go to work" });
    expect(out.ir.items[1]).toMatchObject({ type: "task", name: "Make tea", score: 5, actors: ["Me"] });
    expect(out.ir.items[2]).toMatchObject({ type: "task", name: "Do work", score: 1, actors: ["Me", "Cat"] });
  });

  it("preserves unrecognised lines as raw", () => {
    const src = `journey
    unknown syntax here`;
    const out = parseJourney(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.items[0].type).toBe("raw");
  });

  it("returns failure for missing header", () => {
    const out = parseJourney("section foo");
    expect(out.ok).toBe(false);
  });

  it("ignores comments", () => {
    const out = parseJourney("journey\n%% comment\n    title T");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.title).toBe("T");
  });
});
