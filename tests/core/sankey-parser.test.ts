import { describe, expect, it } from "vitest";
import { parseSankey } from "../../src/core/sankey/parser";

describe("parseSankey", () => {
  it("returns ok for minimal sankey-beta header", () => {
    const result = parseSankey("sankey-beta\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.kind).toBe("sankey-beta");
    expect(result.ir.hasHeaderRow).toBe(false);
    expect(result.ir.items).toHaveLength(0);
  });

  it("returns error when header is missing", () => {
    expect(parseSankey("flowchart TD\n").ok).toBe(false);
  });

  it("parses unquoted CSV links", () => {
    const result = parseSankey("sankey-beta\nA,B,100\nB,C,80\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.items).toHaveLength(2);
    expect(result.ir.items[0]).toMatchObject({ type: "link", source: "A", target: "B", value: 100 });
  });

  it("recognises optional header row", () => {
    const result = parseSankey("sankey-beta\nsource,target,value\nA,B,1\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.hasHeaderRow).toBe(true);
    expect(result.ir.items).toHaveLength(1);
  });

  it("handles quoted field with comma", () => {
    const result = parseSankey('sankey-beta\n"Node, A",B,5\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.items[0]).toMatchObject({ source: "Node, A", target: "B", value: 5 });
  });

  it("handles escaped double quotes", () => {
    const result = parseSankey('sankey-beta\n"with ""q""",B,5\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.items[0]).toMatchObject({ source: 'with "q"' });
  });

  it("preserves decimal values", () => {
    const result = parseSankey("sankey-beta\nA,B,2.5\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.items[0]).toMatchObject({ value: 2.5 });
  });

  it("preserves %% comments and malformed lines as raw items", () => {
    const result = parseSankey("sankey-beta\n%% note\nA,B\nA,B,5\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raws = result.ir.items.filter((i) => i.type === "raw");
    expect(raws).toHaveLength(2);
  });

  it("skips blank lines", () => {
    const result = parseSankey("sankey-beta\nA,B,1\n\nB,C,2\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.items.filter((i) => i.type === "link")).toHaveLength(2);
  });
});
