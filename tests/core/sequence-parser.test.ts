import { describe, expect, it } from "vitest";
import { parseSequence } from "../../src/core/sequence/parser";

describe("parseSequence", () => {
  it("returns ok for valid sequenceDiagram header", () => {
    const result = parseSequence("sequenceDiagram\n  A->>B: hello\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.kind).toBe("sequenceDiagram");
  });

  it("returns error when header is missing", () => {
    expect(parseSequence("flowchart TD\n").ok).toBe(false);
    expect(parseSequence("").ok).toBe(false);
  });

  it("skips blank lines", () => {
    const result = parseSequence("sequenceDiagram\n\n  A->>B: hello\n\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.items).toHaveLength(1);
    expect(result.ir.items[0].type).toBe("message");
  });

  it("skips %% comments before header", () => {
    const result = parseSequence("%% comment\nsequenceDiagram\n  A->>B: hi\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.items).toHaveLength(1);
  });

  it("preserves %% comments after header as raw items", () => {
    const result = parseSequence("sequenceDiagram\n  %% inline comment\n  A->>B: hi\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raw = result.ir.items.filter((i) => i.type === "raw");
    expect(raw).toHaveLength(1);
  });

  describe("participant", () => {
    it("parses participant without label", () => {
      const result = parseSequence("sequenceDiagram\n  participant Alice\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "participant", alias: "Alice" });
      expect((result.ir.items[0] as { label?: string }).label).toBeUndefined();
    });

    it("parses participant with label", () => {
      const result = parseSequence("sequenceDiagram\n  participant A as Alice Label\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({
        type: "participant",
        alias: "A",
        label: "Alice Label",
      });
    });
  });

  describe("actor", () => {
    it("parses actor without label", () => {
      const result = parseSequence("sequenceDiagram\n  actor Bob\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "actor", alias: "Bob" });
    });

    it("parses actor with label", () => {
      const result = parseSequence("sequenceDiagram\n  actor B as Bob Label\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({
        type: "actor",
        alias: "B",
        label: "Bob Label",
      });
    });
  });

  describe("messages", () => {
    it("parses solid arrow ->>", () => {
      const result = parseSequence("sequenceDiagram\n  Alice->>Bob: Hello\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({
        type: "message",
        from: "Alice",
        to: "Bob",
        arrow: "solid-arrow",
        text: "Hello",
      });
    });

    it("parses dotted arrow -->>", () => {
      const result = parseSequence("sequenceDiagram\n  Alice-->>Bob: Reply\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({
        type: "message",
        from: "Alice",
        to: "Bob",
        arrow: "dotted-arrow",
        text: "Reply",
      });
    });

    it("preserves empty message text", () => {
      const result = parseSequence("sequenceDiagram\n  A->>B:\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "message", text: "" });
    });
  });

  describe("note", () => {
    it("parses Note over two participants", () => {
      const result = parseSequence("sequenceDiagram\n  Note over A,B: some text\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({
        type: "note",
        position: "over",
        targets: ["A", "B"],
        text: "some text",
      });
    });

    it("parses Note right of", () => {
      const result = parseSequence("sequenceDiagram\n  Note right of Alice: reminder\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({
        type: "note",
        position: "right of",
        targets: ["Alice"],
        text: "reminder",
      });
    });

    it("parses Note left of", () => {
      const result = parseSequence("sequenceDiagram\n  Note left of Bob: info\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({
        type: "note",
        position: "left of",
        targets: ["Bob"],
        text: "info",
      });
    });

    it("parses lowercase note keyword", () => {
      const result = parseSequence("sequenceDiagram\n  note over A: lowercase\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "note", position: "over" });
    });
  });

  describe("activation", () => {
    it("parses activate", () => {
      const result = parseSequence("sequenceDiagram\n  activate A\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({
        type: "activation",
        participant: "A",
        active: true,
      });
    });

    it("parses deactivate", () => {
      const result = parseSequence("sequenceDiagram\n  deactivate A\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({
        type: "activation",
        participant: "A",
        active: false,
      });
    });
  });

  describe("raw item retention", () => {
    it("preserves unsupported lines as raw items", () => {
      const src = "sequenceDiagram\n  autonumber\n  A->B: sync\n";
      const result = parseSequence(src);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items).toHaveLength(2);
      expect(result.ir.items.every((i) => i.type === "raw")).toBe(true);
    });

    it("does not drop unsupported loop/end constructs", () => {
      const src = "sequenceDiagram\n  loop retry\n  A->>B: hello\n  end\n";
      const result = parseSequence(src);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const rawItems = result.ir.items.filter((i) => i.type === "raw");
      expect(rawItems.length).toBeGreaterThanOrEqual(2);
    });

    it("preserves original indentation in raw items", () => {
      const src = "sequenceDiagram\n  loop retry\n  A->>B: hello\n  end\n";
      const result = parseSequence(src);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const rawItems = result.ir.items.filter(
        (i): i is { type: "raw"; line: string } => i.type === "raw",
      );
      expect(rawItems.some((i) => i.line.startsWith("  "))).toBe(true);
    });
  });

  it("preserves order: participants before messages in items array", () => {
    const src = `sequenceDiagram
  participant Alice
  Alice->>Bob: Hello
  participant Bob
`;
    const result = parseSequence(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.items[0]).toMatchObject({ type: "participant", alias: "Alice" });
    expect(result.ir.items[1]).toMatchObject({ type: "message" });
    expect(result.ir.items[2]).toMatchObject({ type: "participant", alias: "Bob" });
  });
});
