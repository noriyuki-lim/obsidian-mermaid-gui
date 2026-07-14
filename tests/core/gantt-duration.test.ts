import { describe, expect, it } from "vitest";
import {
  formatDurationToken,
  oneUnitMs,
  parseDurationDays,
  parseDurationToken,
} from "../../src/core/gantt/duration";

describe("parseDurationDays", () => {
  it("converts seconds to a fraction of a day", () => {
    expect(parseDurationDays("30s")).toBeCloseTo(30 / 86400);
  });

  it("converts minutes to a fraction of a day", () => {
    expect(parseDurationDays("9m")).toBeCloseTo(9 / 1440);
  });

  it("converts hours to a fraction of a day", () => {
    expect(parseDurationDays("6h")).toBeCloseTo(0.25);
  });

  it("keeps days as whole numbers", () => {
    expect(parseDurationDays("7d")).toBe(7);
  });

  it("converts weeks to days", () => {
    expect(parseDurationDays("3w")).toBe(21);
  });

  it("rejects uppercase unit letters (not valid Mermaid syntax)", () => {
    expect(parseDurationDays("9M")).toBeNull();
    expect(parseDurationDays("3D")).toBeNull();
  });

  it("rejects invalid or missing input", () => {
    expect(parseDurationDays(undefined)).toBeNull();
    expect(parseDurationDays("")).toBeNull();
    expect(parseDurationDays("abc")).toBeNull();
    expect(parseDurationDays("0d")).toBeNull();
    expect(parseDurationDays("-3d")).toBeNull();
  });
});

describe("parseDurationToken", () => {
  it("preserves the original amount and unit alongside the day-equivalent value", () => {
    expect(parseDurationToken("9m")).toEqual({ amount: 9, unit: "m", days: 9 / 1440 });
    expect(parseDurationToken("7d")).toEqual({ amount: 7, unit: "d", days: 7 });
  });

  it("rejects the same inputs parseDurationDays rejects", () => {
    expect(parseDurationToken(undefined)).toBeNull();
    expect(parseDurationToken("9M")).toBeNull();
    expect(parseDurationToken("abc")).toBeNull();
  });
});

describe("formatDurationToken", () => {
  it("round-trips a duration through its own unit", () => {
    expect(formatDurationToken(9 / 1440, "m")).toBe("9m");
    expect(formatDurationToken(0.25, "h")).toBe("6h");
    expect(formatDurationToken(21, "w")).toBe("3w");
    expect(formatDurationToken(7, "d")).toBe("7d");
  });

  it("rounds to the nearest whole amount in the target unit (Mermaid tokens are integers)", () => {
    expect(formatDurationToken(9.6 / 1440, "m")).toBe("10m");
  });

  it("clamps to a minimum of 1 rather than emitting 0 or negative amounts", () => {
    expect(formatDurationToken(0, "d")).toBe("1d");
    expect(formatDurationToken(-5, "h")).toBe("1h");
  });
});

describe("oneUnitMs", () => {
  it("returns the ms value of a single unit, not a full amount", () => {
    // A 9-minute task's resize floor should be 1 minute, not 9.
    expect(oneUnitMs("m")).toBe(60_000);
    expect(oneUnitMs("s")).toBe(1_000);
    expect(oneUnitMs("h")).toBe(3_600_000);
    expect(oneUnitMs("d")).toBe(86_400_000);
    expect(oneUnitMs("w")).toBe(7 * 86_400_000);
  });
});
