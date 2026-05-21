import { describe, it, expect } from "vitest";
import { parseTimeline } from "../../src/core/timeline/parser";
import { generateTimeline } from "../../src/core/timeline/generator";

function roundtrip(src: string) {
  const r1 = parseTimeline(src);
  if (!r1.ok) throw new Error(r1.message);
  const out = generateTimeline(r1.ir);
  const r2 = parseTimeline(out);
  if (!r2.ok) throw new Error(r2.message);
  return { ir1: r1.ir, ir2: r2.ir, out };
}

describe("generateTimeline", () => {
  it("emits timeline header", () => {
    const out = generateTimeline({ kind: "timeline", items: [] });
    expect(out).toMatch(/^timeline/);
  });

  it("emits title", () => {
    const out = generateTimeline({ kind: "timeline", title: "My Timeline", items: [] });
    expect(out).toContain("title My Timeline");
  });

  it("emits section", () => {
    const out = generateTimeline({
      kind: "timeline",
      items: [{ type: "section", title: "Early 2000s" }],
    });
    expect(out).toContain("section Early 2000s");
  });

  it("emits period with single event", () => {
    const out = generateTimeline({
      kind: "timeline",
      items: [{ type: "period", label: "2002", events: ["LinkedIn"] }],
    });
    expect(out).toContain("2002 : LinkedIn");
  });

  it("emits period with multiple events as continuations", () => {
    const out = generateTimeline({
      kind: "timeline",
      items: [{ type: "period", label: "2004", events: ["Facebook", "Google"] }],
    });
    expect(out).toContain("2004 : Facebook");
    expect(out).toContain(": Google");
  });

  it("round-trips minimal source", () => {
    const src = `timeline\n    title Test\n    2002 : LinkedIn\n`;
    const { ir1, ir2 } = roundtrip(src);
    expect(ir2.title).toBe(ir1.title);
    expect(ir2.items.length).toBe(ir1.items.length);
  });

  it("round-trips multiple events per period", () => {
    const src = `timeline\n    2004 : Facebook\n         : Google\n`;
    const { ir1, ir2 } = roundtrip(src);
    const p1 = ir1.items[0];
    const p2 = ir2.items[0];
    if (p1.type !== "period" || p2.type !== "period") throw new Error("expected periods");
    expect(p2.events).toEqual(p1.events);
  });

  it("round-trips sections and periods", () => {
    const src = `timeline\n    title History\n    section Old\n    2002 : LinkedIn\n    section New\n    2020 : TikTok\n`;
    const { ir1, ir2 } = roundtrip(src);
    expect(ir2.items.length).toBe(ir1.items.length);
    expect(ir2.items.filter((i) => i.type === "section").length).toBe(2);
  });
});
