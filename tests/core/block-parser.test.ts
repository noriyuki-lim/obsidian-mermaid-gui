import { describe, it, expect } from "vitest";
import { parseBlock } from "../../src/core/block/parser";

describe("parseBlock", () => {
  it("parses header-only", () => {
    const out = parseBlock("block-beta");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.items).toHaveLength(0);
  });

  it("parses columns directive", () => {
    const out = parseBlock("block-beta\n    columns 3");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.items[0]).toMatchObject({ type: "columns", count: "3" });
  });

  it("parses block with label and shape", () => {
    const out = parseBlock(`block-beta\n    A["Client"]`);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.items[0]).toMatchObject({
      type: "block", id: "A", label: "Client", shapeOpen: "[", shapeClose: "]",
    });
  });

  it("parses block with span", () => {
    const out = parseBlock(`block-beta\n    A["X"]:3`);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.items[0]).toMatchObject({ type: "block", id: "A", label: "X", span: 3 });
  });

  it("parses bare id block", () => {
    const out = parseBlock(`block-beta\n    Plain`);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.items[0]).toMatchObject({ type: "block", id: "Plain" });
  });

  it("preserves nested block constructs as raw", () => {
    const src = `block-beta
    block:web:2
        columns 2
    end`;
    const out = parseBlock(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // nested-block lines preserved as raw
    expect(out.ir.items.some((i) => i.type === "raw")).toBe(true);
  });

  it("fails on missing header", () => {
    expect(parseBlock("columns 3").ok).toBe(false);
  });
});
