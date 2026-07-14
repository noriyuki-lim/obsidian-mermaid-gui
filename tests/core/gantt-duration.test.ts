import { describe, expect, it } from "vitest";
import { parseDurationDays } from "../../src/core/gantt/duration";

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
