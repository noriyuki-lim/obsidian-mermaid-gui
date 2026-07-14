import { describe, expect, it } from "vitest";
import { buildTicks, paddedRange, pickTickIntervalMs } from "../../src/core/gantt/tick-scale";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

describe("pickTickIntervalMs", () => {
  it("picks a sub-minute interval for a minute-scale span", () => {
    const interval = pickTickIntervalMs(9 * MINUTE);
    expect(interval).toBeLessThan(HOUR);
    expect(interval).toBeGreaterThanOrEqual(MINUTE);
  });

  it("picks an hour-scale interval for an hour-scale span", () => {
    const interval = pickTickIntervalMs(10 * HOUR);
    expect(interval).toBeGreaterThanOrEqual(HOUR);
    expect(interval).toBeLessThan(DAY);
  });

  it("picks a day/week-scale interval for a multi-week span", () => {
    const interval = pickTickIntervalMs(60 * DAY);
    expect(interval).toBeGreaterThanOrEqual(DAY);
    expect(interval).toBeLessThanOrEqual(2 * WEEK);
  });

  it("falls back to a bounded multiple of the largest rung for spans beyond the ladder", () => {
    const tenYears = 10 * 365 * DAY;
    const interval = pickTickIntervalMs(tenYears);
    expect(interval % (365 * DAY)).toBe(0);
    const impliedTicks = tenYears / interval;
    expect(impliedTicks).toBeGreaterThan(0);
    expect(impliedTicks).toBeLessThanOrEqual(16);
  });
});

describe("buildTicks", () => {
  it("always includes both endpoints", () => {
    const ticks = buildTicks(0, 100 * MINUTE, 30 * MINUTE);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(100 * MINUTE);
  });

  it("returns just the min when max <= min", () => {
    expect(buildTicks(500, 500, MINUTE)).toEqual([500]);
  });
});

describe("paddedRange", () => {
  it("pads a 9-minute span by well under an hour, not whole days", () => {
    const rawMin = 0;
    const rawMax = 9 * MINUTE;
    const { min, max } = paddedRange(rawMin, rawMax);
    expect(rawMin - min).toBeLessThan(HOUR);
    expect(max - rawMax).toBeLessThan(HOUR);
  });
});
