import { describe, expect, it } from "vitest";
import { defaultAxisFormat, formatGanttAxisTick } from "../../src/core/gantt/axis-format";

describe("formatGanttAxisTick", () => {
  const time = Date.UTC(2026, 5, 14);

  it("formats month/day tokens", () => {
    expect(formatGanttAxisTick(time, "%m/%d")).toBe("06/14");
  });

  it("formats year, week, and weekday tokens used by the preview UI", () => {
    expect(formatGanttAxisTick(time, "%Y-W%W(%a)")).toBe("2026-W23(Sun)");
  });

  it("formats hour and minute tokens", () => {
    const t = Date.UTC(2026, 5, 14, 9, 5);
    expect(formatGanttAxisTick(t, "%H:%M")).toBe("09:05");
  });

  it("formats hour, minute, and second tokens", () => {
    const t = Date.UTC(2026, 5, 14, 23, 6, 7);
    expect(formatGanttAxisTick(t, "%H:%M:%S")).toBe("23:06:07");
  });
});

describe("defaultAxisFormat", () => {
  it("matches the axis pattern to the dateFormat granularity", () => {
    expect(defaultAxisFormat("date")).toBe("%m/%d");
    expect(defaultAxisFormat("time")).toBe("%H:%M");
    expect(defaultAxisFormat("datetime")).toBe("%m/%d %H:%M");
  });
});
