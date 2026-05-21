import { describe, it, expect } from "vitest";
import { parseBlock } from "../../src/core/block/parser";
import { generateBlock } from "../../src/core/block/generator";

describe("generateBlock — round-trip", () => {
  const roundTrip = (src: string) => {
    const out = parseBlock(src);
    if (!out.ok) throw new Error(out.message);
    const gen = generateBlock(out.ir);
    const out2 = parseBlock(gen);
    if (!out2.ok) throw new Error(`re-parse: ${out2.message}\n---\n${gen}`);
    return { first: out.ir, second: out2.ir };
  };

  it("simple 3-column grid round-trips", () => {
    const src = `block-beta
    columns 3
    A["Client"]
    B["Server"]
    C["DB"]`;
    const { first, second } = roundTrip(src);
    expect(second.items).toHaveLength(first.items.length);
    expect(second.items[0]).toMatchObject({ type: "columns", count: "3" });
    expect(second.items[1]).toMatchObject({ type: "block", id: "A", label: "Client" });
  });

  it("span is preserved", () => {
    const src = `block-beta\n    columns 4\n    A["Big"]:2`;
    const { second } = roundTrip(src);
    const block = second.items[1];
    if (block.type !== "block") throw new Error("expected block");
    expect(block.span).toBe(2);
  });

  it("generated source starts with block-beta", () => {
    const out = parseBlock("block-beta\n    A");
    if (!out.ok) throw new Error(out.message);
    expect(generateBlock(out.ir)).toMatch(/^block-beta/);
  });
});
