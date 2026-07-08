import { describe, it, expect } from "vitest";
import { splitFrontmatter, readTicketBaseUrl, writeTicketBaseUrl } from "../../src/core/kanban/frontmatter";

describe("splitFrontmatter", () => {
  it("splits a leading --- block off the rest", () => {
    const src = "---\nconfig:\n  kanban:\n    ticketBaseUrl: 'x'\n---\nkanban\n  a[A]";
    const { frontmatterRaw, rest } = splitFrontmatter(src);
    expect(frontmatterRaw).toBe("---\nconfig:\n  kanban:\n    ticketBaseUrl: 'x'\n---");
    expect(rest).toBe("kanban\n  a[A]");
  });

  it("returns null frontmatter when the source has none", () => {
    const src = "kanban\n  a[A]";
    expect(splitFrontmatter(src)).toEqual({ frontmatterRaw: null, rest: src });
  });

  it("returns null when the opening --- is never closed", () => {
    const src = "---\nconfig: x\nkanban\n  a[A]";
    expect(splitFrontmatter(src)).toEqual({ frontmatterRaw: null, rest: src });
  });
});

describe("readTicketBaseUrl", () => {
  it("reads a quoted value", () => {
    expect(readTicketBaseUrl("---\nconfig:\n  kanban:\n    ticketBaseUrl: 'https://x/#TICKET#'\n---")).toBe(
      "https://x/#TICKET#",
    );
  });

  it("returns empty string when absent", () => {
    expect(readTicketBaseUrl("---\ntheme: dark\n---")).toBe("");
    expect(readTicketBaseUrl(undefined)).toBe("");
  });
});

describe("writeTicketBaseUrl", () => {
  it("creates a fresh frontmatter block when there is none", () => {
    expect(writeTicketBaseUrl(undefined, "https://x/#TICKET#")).toBe(
      "---\nconfig:\n  kanban:\n    ticketBaseUrl: 'https://x/#TICKET#'\n---",
    );
  });

  it("does nothing when there is no frontmatter and the value is empty", () => {
    expect(writeTicketBaseUrl(undefined, "")).toBeUndefined();
  });

  it("replaces an existing value in place, keeping unrelated lines untouched", () => {
    const before = "---\ntheme: dark\nconfig:\n  kanban:\n    ticketBaseUrl: 'old'\n---";
    const after = writeTicketBaseUrl(before, "new");
    expect(after).toBe("---\ntheme: dark\nconfig:\n  kanban:\n    ticketBaseUrl: 'new'\n---");
  });

  it("nests under an existing config: block without duplicating it", () => {
    const before = "---\nconfig:\n  theme: base\n---";
    const after = writeTicketBaseUrl(before, "https://x/#TICKET#");
    expect(after).toBe(
      "---\nconfig:\n  kanban:\n    ticketBaseUrl: 'https://x/#TICKET#'\n  theme: base\n---",
    );
  });

  it("adds a config block when the frontmatter has unrelated content only", () => {
    const before = "---\ntitle: My board\n---";
    const after = writeTicketBaseUrl(before, "https://x/#TICKET#");
    expect(after).toBe(
      "---\ntitle: My board\nconfig:\n  kanban:\n    ticketBaseUrl: 'https://x/#TICKET#'\n---",
    );
  });

  it("clears the value and drops the whole block once empty", () => {
    const before = "---\nconfig:\n  kanban:\n    ticketBaseUrl: 'x'\n---";
    expect(writeTicketBaseUrl(before, "")).toBeUndefined();
  });

  it("clears the value, cascading away the now-empty config/kanban shell but keeping unrelated content", () => {
    const before = "---\ntheme: dark\nconfig:\n  kanban:\n    ticketBaseUrl: 'x'\n---";
    expect(writeTicketBaseUrl(before, "")).toBe("---\ntheme: dark\n---");
  });
});
