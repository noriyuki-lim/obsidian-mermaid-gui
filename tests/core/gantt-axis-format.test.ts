import { describe, expect, it } from "vitest";
import { formatGanttAxisTick } from "../../src/core/gantt/axis-format";

describe("formatGanttAxisTick", () => {
  const time = Date.UTC(2026, 5, 14);

  it("formats month/day tokens", () => {
    expect(formatGanttAxisTick(time, "%m/%d")).toBe("06/14");
  });

  it("formats year, week, and weekday tokens used by the preview UI", () => {
    expect(formatGanttAxisTick(time, "%Y-W%W(%a)")).toBe("2026-W23(Sun)");
  });
});
