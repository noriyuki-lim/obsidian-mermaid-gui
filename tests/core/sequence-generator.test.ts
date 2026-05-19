import { describe, expect, it } from "vitest";
import { generateSequence } from "../../src/core/sequence/generator";
import { parseSequence } from "../../src/core/sequence/parser";
import type { SequenceIR } from "../../src/core/sequence/ir-types";

describe("generateSequence", () => {
  it("generates sequenceDiagram header for empty IR", () => {
    const ir: SequenceIR = { kind: "sequenceDiagram", items: [] };
    expect(generateSequence(ir)).toBe("sequenceDiagram\n");
  });

  it("generates participant without label", () => {
    const ir: SequenceIR = {
      kind: "sequenceDiagram",
      items: [{ type: "participant", alias: "A" }],
    };
    expect(generateSequence(ir)).toContain("  participant A\n");
  });

  it("generates participant with label", () => {
    const ir: SequenceIR = {
      kind: "sequenceDiagram",
      items: [{ type: "participant", alias: "A", label: "Alice" }],
    };
    expect(generateSequence(ir)).toContain("  participant A as Alice");
  });

  it("generates actor without label", () => {
    const ir: SequenceIR = {
      kind: "sequenceDiagram",
      items: [{ type: "actor", alias: "B" }],
    };
    expect(generateSequence(ir)).toContain("  actor B\n");
  });

  it("generates actor with label", () => {
    const ir: SequenceIR = {
      kind: "sequenceDiagram",
      items: [{ type: "actor", alias: "B", label: "Bob" }],
    };
    expect(generateSequence(ir)).toContain("  actor B as Bob");
  });

  it("generates solid arrow message", () => {
    const ir: SequenceIR = {
      kind: "sequenceDiagram",
      items: [{ type: "message", from: "A", to: "B", arrow: "solid-arrow", text: "Hello" }],
    };
    expect(generateSequence(ir)).toContain("  A->>B: Hello");
  });

  it("generates dotted arrow message", () => {
    const ir: SequenceIR = {
      kind: "sequenceDiagram",
      items: [{ type: "message", from: "A", to: "B", arrow: "dotted-arrow", text: "Reply" }],
    };
    expect(generateSequence(ir)).toContain("  A-->>B: Reply");
  });

  it("generates Note over two participants", () => {
    const ir: SequenceIR = {
      kind: "sequenceDiagram",
      items: [{ type: "note", position: "over", targets: ["A", "B"], text: "desc" }],
    };
    expect(generateSequence(ir)).toContain("  Note over A,B: desc");
  });

  it("generates Note right of", () => {
    const ir: SequenceIR = {
      kind: "sequenceDiagram",
      items: [{ type: "note", position: "right of", targets: ["Alice"], text: "hint" }],
    };
    expect(generateSequence(ir)).toContain("  Note right of Alice: hint");
  });

  it("generates activate", () => {
    const ir: SequenceIR = {
      kind: "sequenceDiagram",
      items: [{ type: "activation", participant: "A", active: true }],
    };
    expect(generateSequence(ir)).toContain("  activate A");
  });

  it("generates deactivate", () => {
    const ir: SequenceIR = {
      kind: "sequenceDiagram",
      items: [{ type: "activation", participant: "A", active: false }],
    };
    expect(generateSequence(ir)).toContain("  deactivate A");
  });

  it("outputs raw lines verbatim", () => {
    const ir: SequenceIR = {
      kind: "sequenceDiagram",
      items: [{ type: "raw", line: "  loop retry" }],
    };
    expect(generateSequence(ir)).toContain("  loop retry");
  });

  it("ends with a trailing newline", () => {
    const ir: SequenceIR = {
      kind: "sequenceDiagram",
      items: [{ type: "message", from: "A", to: "B", arrow: "solid-arrow", text: "hi" }],
    };
    expect(generateSequence(ir).endsWith("\n")).toBe(true);
  });
});

describe("parse → generate → parse round-trip", () => {
  const src = `sequenceDiagram
  participant Alice as Alice Label
  actor Bob
  Alice->>Bob: Hello Bob
  Bob-->>Alice: Hi Alice
  Note over Alice,Bob: a note
  Note right of Alice: aside
  activate Alice
  deactivate Alice
  autonumber
`;

  it("generates parseable output", () => {
    const first = parseSequence(src);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const generated = generateSequence(first.ir);
    const second = parseSequence(generated);
    expect(second.ok).toBe(true);
  });

  it("preserves item count", () => {
    const first = parseSequence(src);
    if (!first.ok) return;
    const second = parseSequence(generateSequence(first.ir));
    if (!second.ok) return;
    expect(second.ir.items.length).toBe(first.ir.items.length);
  });

  it("preserves item types in order", () => {
    const first = parseSequence(src);
    if (!first.ok) return;
    const second = parseSequence(generateSequence(first.ir));
    if (!second.ok) return;
    for (let i = 0; i < first.ir.items.length; i++) {
      expect(second.ir.items[i].type).toBe(first.ir.items[i].type);
    }
  });

  it("preserves message fields", () => {
    const first = parseSequence(src);
    if (!first.ok) return;
    const second = parseSequence(generateSequence(first.ir));
    if (!second.ok) return;
    const msgs1 = first.ir.items.filter((i) => i.type === "message");
    const msgs2 = second.ir.items.filter((i) => i.type === "message");
    expect(msgs2).toHaveLength(msgs1.length);
    for (let i = 0; i < msgs1.length; i++) {
      expect(msgs2[i]).toMatchObject({
        from: (msgs1[i] as { from: string }).from,
        to: (msgs1[i] as { to: string }).to,
        arrow: (msgs1[i] as { arrow: string }).arrow,
        text: (msgs1[i] as { text: string }).text,
      });
    }
  });

  it("preserves note fields", () => {
    const first = parseSequence(src);
    if (!first.ok) return;
    const second = parseSequence(generateSequence(first.ir));
    if (!second.ok) return;
    const notes1 = first.ir.items.filter((i) => i.type === "note");
    const notes2 = second.ir.items.filter((i) => i.type === "note");
    expect(notes2).toHaveLength(notes1.length);
  });
});
