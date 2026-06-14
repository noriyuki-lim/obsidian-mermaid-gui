import { describe, it, expect } from "vitest";
import { parseGantt } from "../../src/core/gantt/parser";

describe("parseGantt", () => {
  it("rejects missing header", () => {
    const r = parseGantt("title My Chart");
    expect(r.ok).toBe(false);
  });

  it("parses minimal header", () => {
    const r = parseGantt("gantt");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.kind).toBe("gantt");
    expect(r.ir.items).toHaveLength(0);
  });

  it("parses title and dateFormat", () => {
    const src = `gantt
    title My Project
    dateFormat YYYY-MM-DD`;
    const r = parseGantt(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.title).toBe("My Project");
    expect(r.ir.dateFormat).toBe("YYYY-MM-DD");
  });

  it("parses section", () => {
    const src = `gantt
    section Phase 1`;
    const r = parseGantt(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.items[0]).toMatchObject({ type: "section", title: "Phase 1" });
  });

  it("parses task with start and duration", () => {
    const src = `gantt
    A task :2024-01-01, 30d`;
    const r = parseGantt(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const task = r.ir.items[0];
    expect(task.type).toBe("task");
    if (task.type !== "task") return;
    expect(task.label).toBe("A task");
    expect(task.start).toBe("2024-01-01");
    expect(task.end).toBe("30d");
    expect(task.modifiers).toHaveLength(0);
  });

  it("parses task with modifier, id, start, end", () => {
    const src = `gantt
    My task :done, t1, 2024-01-01, 2024-01-10`;
    const r = parseGantt(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const task = r.ir.items[0];
    if (task.type !== "task") return;
    expect(task.modifiers).toContain("done");
    expect(task.id).toBe("t1");
    expect(task.start).toBe("2024-01-01");
    expect(task.end).toBe("2024-01-10");
  });

  it("parses task with crit and active modifiers", () => {
    const src = `gantt
    Critical :crit, active, 2024-02-01, 5d`;
    const r = parseGantt(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const task = r.ir.items[0];
    if (task.type !== "task") return;
    expect(task.modifiers).toContain("crit");
    expect(task.modifiers).toContain("active");
  });

  it("parses task with after reference", () => {
    const src = `gantt
    Follow-up :after t1, 3d`;
    const r = parseGantt(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const task = r.ir.items[0];
    if (task.type !== "task") return;
    expect(task.start).toBe("after t1");
    expect(task.end).toBe("3d");
  });

  it("parses axisFormat into IR (not raw)", () => {
    const src = `gantt
    axisFormat %m/%d
    A task :2024-01-01, 5d`;
    const r = parseGantt(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.axisFormat).toBe("%m/%d");
    expect(r.ir.items.some((i) => i.type === "raw")).toBe(false);
  });

  it("parses axisFormat with weekday token", () => {
    const src = `gantt
    axisFormat %m/%d(%a)
    A task :2024-01-01, 5d`;
    const r = parseGantt(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.axisFormat).toBe("%m/%d(%a)");
  });

  it("preserves unknown lines as raw", () => {
    const src = `gantt
    excludes weekends
    A task :2024-01-01, 5d`;
    const r = parseGantt(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const raw = r.ir.items.find((i) => i.type === "raw");
    expect(raw).toBeDefined();
  });

  it("skips %% comments", () => {
    const src = `gantt
    %% comment
    title Test`;
    const r = parseGantt(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.title).toBe("Test");
    expect(r.ir.items.every((i) => i.type !== "raw")).toBe(true);
  });

  it("parses complete diagram with sections and tasks", () => {
    const src = `gantt
    title Project
    dateFormat YYYY-MM-DD
    section Phase 1
        Task A :done, t1, 2024-01-01, 7d
        Task B :active, after t1, 3d
    section Phase 2
        Task C :crit, 2024-01-15, 5d`;
    const r = parseGantt(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sections = r.ir.items.filter((i) => i.type === "section");
    const tasks = r.ir.items.filter((i) => i.type === "task");
    expect(sections).toHaveLength(2);
    expect(tasks).toHaveLength(3);
  });
});
