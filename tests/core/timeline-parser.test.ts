import { describe, it, expect } from "vitest";
import { parseTimeline } from "../../src/core/timeline/parser";

describe("parseTimeline", () => {
  it("rejects missing header", () => {
    const r = parseTimeline("title My Timeline");
    expect(r.ok).toBe(false);
  });

  it("parses minimal header", () => {
    const r = parseTimeline("timeline");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.kind).toBe("timeline");
    expect(r.ir.items).toHaveLength(0);
  });

  it("parses title", () => {
    const src = `timeline\n    title History of Social Media`;
    const r = parseTimeline(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.title).toBe("History of Social Media");
  });

  it("parses period with single event", () => {
    const src = `timeline\n    2002 : LinkedIn`;
    const r = parseTimeline(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.ir.items[0];
    expect(p.type).toBe("period");
    if (p.type !== "period") return;
    expect(p.label).toBe("2002");
    expect(p.events).toEqual(["LinkedIn"]);
  });

  it("merges continuation events into same period", () => {
    const src = `timeline\n    2004 : Facebook\n         : Google`;
    const r = parseTimeline(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.items).toHaveLength(1);
    const p = r.ir.items[0];
    if (p.type !== "period") return;
    expect(p.events).toEqual(["Facebook", "Google"]);
  });

  it("parses section", () => {
    const src = `timeline\n    section Early 2000s\n    2002 : LinkedIn`;
    const r = parseTimeline(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.items[0]).toMatchObject({ type: "section", title: "Early 2000s" });
    expect(r.ir.items[1]).toMatchObject({ type: "period", label: "2002" });
  });

  it("skips %% comments", () => {
    const src = `timeline\n    %% comment\n    title Test`;
    const r = parseTimeline(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.title).toBe("Test");
    expect(r.ir.items).toHaveLength(0);
  });

  it("parses full example", () => {
    const src = `timeline
    title History of Social Media Platform
    2002 : LinkedIn
    2004 : Facebook
         : Google
    2005 : Youtube
    2006 : Twitter`;
    const r = parseTimeline(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.title).toBe("History of Social Media Platform");
    expect(r.ir.items).toHaveLength(4);
    const p2004 = r.ir.items[1];
    if (p2004.type !== "period") return;
    expect(p2004.events).toHaveLength(2);
  });

  it("parses period with no events", () => {
    const src = `timeline\n    2024 :`;
    const r = parseTimeline(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.ir.items[0];
    if (p.type !== "period") return;
    expect(p.events).toHaveLength(0);
  });
});
