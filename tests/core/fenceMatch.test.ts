import { describe, expect, it } from "vitest";
import { findMatchingMermaidBlock, findNextClosingFence } from "../../src/core/fenceMatch";

describe("findMatchingMermaidBlock", () => {
  it("finds the single fenced block whose body matches exactly", () => {
    const lines = [
      "intro text",
      "```mermaid",
      "flowchart TD",
      "  A --> B",
      "```",
      "outro text",
    ];
    const result = findMatchingMermaidBlock(lines, "flowchart TD\n  A --> B");
    expect(result).toEqual({ lineStart: 1, lineEnd: 4 });
  });

  it("picks the correct block among several distinct mermaid fences", () => {
    const lines = [
      "```mermaid",
      "pie title A",
      "  \"x\" : 1",
      "```",
      "",
      "```mermaid",
      "xychart-beta",
      "  bar [1, 2, 3]",
      "```",
    ];
    const result = findMatchingMermaidBlock(lines, "xychart-beta\n  bar [1, 2, 3]");
    expect(result).toEqual({ lineStart: 5, lineEnd: 8 });
  });

  it("returns null when no block matches", () => {
    const lines = ["```mermaid", "flowchart TD", "```"];
    expect(findMatchingMermaidBlock(lines, "something else entirely")).toBeNull();
  });

  it("returns null when multiple blocks have identical bodies (ambiguous)", () => {
    const lines = [
      "```mermaid",
      "flowchart TD",
      "  A --> B",
      "```",
      "```mermaid",
      "flowchart TD",
      "  A --> B",
      "```",
    ];
    expect(findMatchingMermaidBlock(lines, "flowchart TD\n  A --> B")).toBeNull();
  });

  it("ignores trailing blank lines in the target body", () => {
    const lines = ["```mermaid", "pie", "  \"a\" : 1", "```"];
    const result = findMatchingMermaidBlock(lines, 'pie\n  "a" : 1\n\n\n');
    expect(result).toEqual({ lineStart: 0, lineEnd: 3 });
  });

  it("recognizes fences with trailing tokens like {init: ...}", () => {
    const lines = ["```mermaid {init: {\"theme\": \"dark\"}}", "flowchart TD", "```"];
    const result = findMatchingMermaidBlock(lines, "flowchart TD");
    expect(result).toEqual({ lineStart: 0, lineEnd: 2 });
  });
});

describe("findNextClosingFence", () => {
  it("finds the closing fence immediately after the opening line", () => {
    const lines = ["```mermaid", "flowchart TD", "  A --> B", "```"];
    expect(findNextClosingFence(lines, 0)).toBe(3);
  });

  it("skips content lines that merely contain other text before the fence", () => {
    const lines = [
      "```mermaid",
      "pie title 売上構成",
      '  "製品A" : 37',
      '  "製品B" : 30',
      "```",
      "```mermaid",
      "flowchart TD",
      "```",
    ];
    // Anchored on the FIRST block's opening line — must not walk past its own
    // closing fence into the second block's.
    expect(findNextClosingFence(lines, 0)).toBe(4);
  });

  it("returns null when there is no closing fence after the opening line", () => {
    const lines = ["```mermaid", "flowchart TD", "  A --> B"];
    expect(findNextClosingFence(lines, 0)).toBeNull();
  });
});
