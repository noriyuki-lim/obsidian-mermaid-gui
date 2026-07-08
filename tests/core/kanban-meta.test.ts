import { describe, it, expect } from "vitest";
import { readCardFields, writeCardFields } from "../../src/core/kanban/meta";

describe("readCardFields", () => {
  it("reads quoted and bare values", () => {
    const fields = readCardFields("@{ ticket: MC-2038, assigned: 'K.Sveidqvist', priority: 'High' }");
    expect(fields).toEqual({ ticket: "MC-2038", assigned: "K.Sveidqvist", priority: "High" });
  });

  it("ignores an unrecognised priority value", () => {
    const fields = readCardFields("@{ priority: 'Medium' }");
    expect(fields.priority).toBeUndefined();
  });

  it("returns an empty object for undefined metaRaw", () => {
    expect(readCardFields(undefined)).toEqual({});
  });
});

describe("writeCardFields", () => {
  it("adds a field to an empty card", () => {
    expect(writeCardFields(undefined, { priority: "High" })).toBe("@{ priority: 'High' }");
  });

  it("updates one field while preserving the others verbatim", () => {
    const before = "@{ ticket: MC-2038, assigned: 'kn', priority: 'Low' }";
    const after = writeCardFields(before, { priority: "Very High" });
    expect(after).toBe("@{ ticket: MC-2038, assigned: 'kn', priority: 'Very High' }");
  });

  it("preserves an unrecognised extra key", () => {
    const before = "@{ custom: 'value', ticket: MC-1 }";
    const after = writeCardFields(before, { ticket: "MC-2" });
    expect(after).toBe("@{ custom: 'value', ticket: 'MC-2' }");
  });

  it("removes a field when cleared to undefined", () => {
    const before = "@{ ticket: MC-2038, priority: 'High' }";
    expect(writeCardFields(before, { priority: undefined })).toBe("@{ ticket: MC-2038 }");
  });

  it("drops the whole block once the last field is removed", () => {
    expect(writeCardFields("@{ priority: 'High' }", { priority: undefined })).toBeUndefined();
  });
});
