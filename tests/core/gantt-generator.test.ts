import { describe, it, expect } from "vitest";
import { parseGantt } from "../../src/core/gantt/parser";
import { generateGantt } from "../../src/core/gantt/generator";

function roundtrip(src: string) {
  const r1 = parseGantt(src);
  if (!r1.ok) throw new Error(r1.message);
  const out = generateGantt(r1.ir);
  const r2 = parseGantt(out);
  if (!r2.ok) throw new Error(r2.message);
  return { ir1: r1.ir, ir2: r2.ir, out };
}

describe("generateGantt", () => {
  it("emits gantt header", () => {
    const out = generateGantt({ kind: "gantt", items: [] });
    expect(out).toMatch(/^gantt/);
  });

  it("emits title and dateFormat", () => {
    const out = generateGantt({
      kind: "gantt",
      title: "My Project",
      dateFormat: "YYYY-MM-DD",
      items: [],
    });
    expect(out).toContain("title My Project");
    expect(out).toContain("dateFormat YYYY-MM-DD");
  });

  it("emits section", () => {
    const out = generateGantt({
      kind: "gantt",
      items: [{ type: "section", title: "Phase 1" }],
    });
    expect(out).toContain("section Phase 1");
  });

  it("emits task with full spec", () => {
    const out = generateGantt({
      kind: "gantt",
      items: [
        {
          type: "task",
          label: "My task",
          modifiers: ["done"],
          id: "t1",
          start: "2024-01-01",
          end: "7d",
        },
      ],
    });
    expect(out).toContain("My task :done, t1, 2024-01-01, 7d");
  });

  it("round-trips minimal source", () => {
    const src = `gantt\n    title Test\n    section S1\n    A task :2024-01-01, 5d\n`;
    const { ir1, ir2 } = roundtrip(src);
    expect(ir2.title).toBe(ir1.title);
    expect(ir2.items.length).toBe(ir1.items.length);
  });

  it("round-trips modifiers and id", () => {
    const src = `gantt\n    My task :crit, done, t1, 2024-01-01, 3d\n`;
    const { ir1, ir2 } = roundtrip(src);
    const t1 = ir1.items[0];
    const t2 = ir2.items[0];
    if (t1.type !== "task" || t2.type !== "task") throw new Error("expected tasks");
    expect(t2.modifiers).toEqual(t1.modifiers);
    expect(t2.id).toBe(t1.id);
    expect(t2.start).toBe(t1.start);
    expect(t2.end).toBe(t1.end);
  });

  it("preserves raw lines through round-trip", () => {
    const src = `gantt\n    excludes weekends\n    A task :2024-01-01, 5d\n`;
    const { ir1, ir2 } = roundtrip(src);
    const raw1 = ir1.items.filter((i) => i.type === "raw");
    const raw2 = ir2.items.filter((i) => i.type === "raw");
    expect(raw2.length).toBe(raw1.length);
  });

  it("emits axisFormat after dateFormat", () => {
    const out = generateGantt({
      kind: "gantt",
      dateFormat: "YYYY-MM-DD",
      axisFormat: "%m/%d",
      items: [],
    });
    expect(out).toContain("axisFormat %m/%d");
    expect(out.indexOf("dateFormat")).toBeLessThan(out.indexOf("axisFormat"));
  });

  it("emits tickInterval after axisFormat", () => {
    const out = generateGantt({
      kind: "gantt",
      axisFormat: "%m/%d",
      tickInterval: "1week",
      items: [],
    });
    expect(out).toContain("tickInterval 1week");
    expect(out.indexOf("axisFormat")).toBeLessThan(out.indexOf("tickInterval"));
  });

  it("round-trips axisFormat (incl. weekday token)", () => {
    const src = `gantt\n    dateFormat YYYY-MM-DD\n    axisFormat %m/%d(%a)\n    A task :2024-01-01, 5d\n`;
    const { ir1, ir2 } = roundtrip(src);
    expect(ir1.axisFormat).toBe("%m/%d(%a)");
    expect(ir2.axisFormat).toBe("%m/%d(%a)");
  });

  it("round-trips after-reference and milestone tasks", () => {
    const src = `gantt\n    section S\n    Design :t2, after t1, 3w\n    Launch :milestone, m1, after t2, 0d\n`;
    const { ir1, ir2 } = roundtrip(src);
    const a1 = ir1.items.find((i) => i.type === "task" && i.id === "t2");
    const a2 = ir2.items.find((i) => i.type === "task" && i.id === "t2");
    if (a1?.type !== "task" || a2?.type !== "task") throw new Error("expected tasks");
    expect(a2.start).toBe("after t1");
    expect(a2.end).toBe("3w");
    const m1 = ir1.items.find((i) => i.type === "task" && i.id === "m1");
    const m2 = ir2.items.find((i) => i.type === "task" && i.id === "m1");
    if (m1?.type !== "task" || m2?.type !== "task") throw new Error("expected milestone");
    expect(m2.modifiers).toEqual(["milestone"]);
    expect(m2.start).toBe("after t2");
    expect(m2.end).toBe("0d");
  });
});
