import { describe, expect, it } from "vitest";
import {
  addDateField,
  dateFormatCapability,
  dateFormatHasSeconds,
  fieldAtCaret,
  formatDateWithFormat,
  isDateStringForFormat,
  nativeDateInput,
  parseDateWithFormat,
} from "../../src/core/gantt/date-format";

describe("parseDateWithFormat", () => {
  it("parses the default YYYY-MM-DD format", () => {
    expect(parseDateWithFormat("2026-07-14", "YYYY-MM-DD")).toBe(Date.UTC(2026, 6, 14));
  });

  it("parses a time-only format, anchoring the missing date to the Unix epoch day", () => {
    expect(parseDateWithFormat("06:30", "HH:mm")).toBe(Date.UTC(1970, 0, 1, 6, 30));
  });

  it("parses a combined date+time format", () => {
    expect(parseDateWithFormat("2026-07-14 09:00", "YYYY-MM-DD HH:mm")).toBe(Date.UTC(2026, 6, 14, 9, 0));
  });

  it("parses seconds and 2-digit years", () => {
    expect(parseDateWithFormat("09:00:30", "HH:mm:ss")).toBe(Date.UTC(1970, 0, 1, 9, 0, 30));
    expect(parseDateWithFormat("26-07-14", "YY-MM-DD")).toBe(Date.UTC(2026, 6, 14));
  });

  it("rejects strings that don't match the format's shape", () => {
    expect(parseDateWithFormat("06:30", "YYYY-MM-DD")).toBeNull();
    expect(parseDateWithFormat("2026-07-14", "HH:mm")).toBeNull();
    expect(parseDateWithFormat("not a date", "YYYY-MM-DD")).toBeNull();
  });
});

describe("formatDateWithFormat", () => {
  it("round-trips through the same format", () => {
    const time = Date.UTC(2026, 6, 14, 6, 30);
    expect(formatDateWithFormat(time, "YYYY-MM-DD")).toBe("2026-07-14");
    expect(formatDateWithFormat(time, "HH:mm")).toBe("06:30");
    expect(formatDateWithFormat(time, "YYYY-MM-DD HH:mm")).toBe("2026-07-14 06:30");
  });
});

describe("isDateStringForFormat", () => {
  it("matches values shaped like the format and rejects others", () => {
    expect(isDateStringForFormat("06:30", "HH:mm")).toBe(true);
    expect(isDateStringForFormat("2026-07-14", "HH:mm")).toBe(false);
    expect(isDateStringForFormat("9m", "HH:mm")).toBe(false);
  });
});

describe("fieldAtCaret", () => {
  it("matches the legacy YYYY-MM-DD thresholds (year <=4, month <=7, else day)", () => {
    expect(fieldAtCaret("YYYY-MM-DD", 2)).toBe("year");
    expect(fieldAtCaret("YYYY-MM-DD", 4)).toBe("year");
    expect(fieldAtCaret("YYYY-MM-DD", 6)).toBe("month");
    expect(fieldAtCaret("YYYY-MM-DD", 9)).toBe("day");
    expect(fieldAtCaret("YYYY-MM-DD", 999)).toBe("day");
  });

  it("resolves hour vs minute on a time-only format", () => {
    expect(fieldAtCaret("HH:mm", 1)).toBe("hour");
    expect(fieldAtCaret("HH:mm", 4)).toBe("minute");
    expect(fieldAtCaret("HH:mm", 999)).toBe("minute");
  });
});

describe("addDateField", () => {
  it("adjusts only the targeted field", () => {
    const time = Date.UTC(1970, 0, 1, 6, 30);
    expect(addDateField(time, "hour", 1)).toBe(Date.UTC(1970, 0, 1, 7, 30));
    expect(addDateField(time, "minute", -5)).toBe(Date.UTC(1970, 0, 1, 6, 25));
  });
});

describe("dateFormatCapability / dateFormatHasSeconds", () => {
  it("classifies date-only, time-only, and combined formats", () => {
    expect(dateFormatCapability("YYYY-MM-DD")).toBe("date");
    expect(dateFormatCapability("HH:mm")).toBe("time");
    expect(dateFormatCapability("YYYY-MM-DD HH:mm")).toBe("datetime");
  });

  it("detects a seconds token", () => {
    expect(dateFormatHasSeconds("HH:mm")).toBe(false);
    expect(dateFormatHasSeconds("HH:mm:ss")).toBe(true);
  });
});

describe("nativeDateInput", () => {
  it("picks the HTML input type and its fixed native value format", () => {
    expect(nativeDateInput("YYYY-MM-DD")).toEqual({ type: "date", nativeFormat: "YYYY-MM-DD" });
    expect(nativeDateInput("HH:mm")).toEqual({ type: "time", nativeFormat: "HH:mm" });
    expect(nativeDateInput("HH:mm:ss")).toEqual({ type: "time", nativeFormat: "HH:mm:ss" });
    expect(nativeDateInput("YYYY-MM-DD HH:mm")).toEqual({
      type: "datetime-local",
      nativeFormat: "YYYY-MM-DDTHH:mm",
    });
  });
});
