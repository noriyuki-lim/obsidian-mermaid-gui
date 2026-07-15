import { describe, expect, it } from "vitest";
import {
  buildAbsoluteTicks,
  buildTicks,
  paddedRange,
  parseTickInterval,
  pickTickIntervalMs,
} from "../../src/core/gantt/tick-scale";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

describe("parseTickInterval", () => {
  it("parses Mermaid tickInterval tokens to milliseconds", () => {
    expect(parseTickInterval("1day")).toBe(DAY);
    expect(parseTickInterval("1week")).toBe(WEEK);
    expect(parseTickInterval("6hour")).toBe(6 * HOUR);
    expect(parseTickInterval("15minute")).toBe(15 * MINUTE);
    expect(parseTickInterval("1month")).toBe(30 * DAY);
  });

  it("tolerates a plural unit on read", () => {
    expect(parseTickInterval("2weeks")).toBe(2 * WEEK);
  });

  it("returns null for empty or unrecognized tokens", () => {
    expect(parseTickInterval(undefined)).toBeNull();
    expect(parseTickInterval("")).toBeNull();
    expect(parseTickInterval("1year")).toBeNull();
    expect(parseTickInterval("day")).toBeNull();
  });
});

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

describe("buildAbsoluteTicks", () => {
  it("phase-locks ticks to multiples of the interval from the epoch", () => {
    const ticks = buildAbsoluteTicks(DAY + HOUR, 3 * DAY + HOUR, DAY);
    expect(ticks).toEqual([2 * DAY, 3 * DAY]);
  });

  it("keeps a given instant's tick fixed as the window shifts (pan/zoom stable)", () => {
    const wide = buildAbsoluteTicks(0, 10 * DAY, 2 * DAY);
    const zoomed = buildAbsoluteTicks(3 * DAY, 7 * DAY, 2 * DAY);
    // 4*DAY and 6*DAY are absolute multiples present in both windows.
    expect(wide).toContain(4 * DAY);
    expect(zoomed).toContain(4 * DAY);
    expect(zoomed).toContain(6 * DAY);
  });

  it("falls back to [min] for a non-positive interval or empty range", () => {
    expect(buildAbsoluteTicks(100, 200, 0)).toEqual([100]);
    expect(buildAbsoluteTicks(100, 100, DAY)).toEqual([100]);
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
