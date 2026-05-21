import { describe, it, expect } from "vitest";
import { parseJourney } from "../../src/core/journey/parser";
import { generateJourney } from "../../src/core/journey/generator";

describe("generateJourney — round-trip", () => {
  const roundTrip = (src: string) => {
    const out = parseJourney(src);
    if (!out.ok) throw new Error(out.message);
    const gen = generateJourney(out.ir);
    const out2 = parseJourney(gen);
    if (!out2.ok) throw new Error(`re-parse failed: ${out2.message}\n---\n${gen}`);
    return { first: out.ir, second: out2.ir };
  };

  it("title + sections + tasks round-trip", () => {
    const src = `journey
    title My working day
    section Go to work
      Make tea: 5: Me
      Do work: 1: Me, Cat
    section Go home
      Sit down: 5: Me`;
    const { first, second } = roundTrip(src);
    expect(second.title).toBe(first.title);
    expect(second.items).toHaveLength(first.items.length);
    expect(second.items[1]).toMatchObject({ type: "task", name: "Make tea", score: 5, actors: ["Me"] });
    expect(second.items[2]).toMatchObject({ type: "task", name: "Do work", score: 1, actors: ["Me", "Cat"] });
  });

  it("generated source starts with journey", () => {
    const out = parseJourney("journey\n    title T");
    if (!out.ok) throw new Error(out.message);
    expect(generateJourney(out.ir)).toMatch(/^journey/);
  });

  it("score range 1-7 is preserved", () => {
    const src = `journey
    section S
      A: 1: u
      B: 7: u`;
    const { second } = roundTrip(src);
    const tasks = second.items.filter((i) => i.type === "task");
    expect(tasks[0]).toMatchObject({ score: 1 });
    expect(tasks[1]).toMatchObject({ score: 7 });
  });
});
