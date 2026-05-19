import { describe, expect, it } from "vitest";
import { parseStateDiagram } from "../../src/core/state/parser";
import { generateStateDiagram } from "../../src/core/state/generator";
import type { StateDiagramIR } from "../../src/core/state/ir-types";

const roundTrip = (source: string): StateDiagramIR | null => {
  const r1 = parseStateDiagram(source);
  if (!r1.ok) return null;
  const generated = generateStateDiagram(r1.ir);
  const r2 = parseStateDiagram(generated);
  return r2.ok ? r2.ir : null;
};

describe("generateStateDiagram", () => {
  it("outputs stateDiagram-v2 header", () => {
    const ir: StateDiagramIR = { kind: "stateDiagram-v2", items: [] };
    expect(generateStateDiagram(ir)).toMatch(/^stateDiagram-v2/);
  });

  it("outputs transitions", () => {
    const ir: StateDiagramIR = {
      kind: "stateDiagram-v2",
      items: [
        { type: "transition", from: "[*]", to: "Idle" },
        { type: "transition", from: "Idle", to: "Running", label: "start" },
        { type: "transition", from: "Running", to: "[*]" },
      ],
    };
    const out = generateStateDiagram(ir);
    expect(out).toContain("[*] --> Idle");
    expect(out).toContain("Idle --> Running : start");
    expect(out).toContain("Running --> [*]");
  });

  it("outputs state declaration with description", () => {
    const ir: StateDiagramIR = {
      kind: "stateDiagram-v2",
      items: [{ type: "state", name: "NotEval", description: "Not Evaluated" }],
    };
    expect(generateStateDiagram(ir)).toContain('state "Not Evaluated" as NotEval');
  });

  it("outputs state annotation", () => {
    const ir: StateDiagramIR = {
      kind: "stateDiagram-v2",
      items: [{ type: "state", name: "fork_state", annotation: "fork" }],
    };
    expect(generateStateDiagram(ir)).toContain("state fork_state <<fork>>");
  });

  it("outputs state-desc item", () => {
    const ir: StateDiagramIR = {
      kind: "stateDiagram-v2",
      items: [{ type: "state-desc", name: "s1", description: "waiting for input" }],
    };
    expect(generateStateDiagram(ir)).toContain("s1 : waiting for input");
  });

  it("outputs single-line note", () => {
    const ir: StateDiagramIR = {
      kind: "stateDiagram-v2",
      items: [{ type: "note", position: "right of", state: "Idle", text: "waiting" }],
    };
    expect(generateStateDiagram(ir)).toContain("note right of Idle : waiting");
  });

  it("outputs multi-line note as block", () => {
    const ir: StateDiagramIR = {
      kind: "stateDiagram-v2",
      items: [{ type: "note", position: "left of", state: "Run", text: "line1\nline2" }],
    };
    const out = generateStateDiagram(ir);
    expect(out).toContain("note left of Run");
    expect(out).toContain("end note");
    expect(out).toContain("line1");
    expect(out).toContain("line2");
  });

  it("preserves raw lines verbatim", () => {
    const raw = "  direction LR";
    const ir: StateDiagramIR = {
      kind: "stateDiagram-v2",
      items: [{ type: "raw", line: raw }],
    };
    expect(generateStateDiagram(ir)).toContain(raw);
  });

  // ── Round-trip ───────────────────────────────────────────────────────────

  describe("round-trip", () => {
    it("transitions with labels", () => {
      const src = `stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start
  Running --> Idle : stop
  Running --> [*] : terminate
`;
      const ir2 = roundTrip(src);
      expect(ir2).not.toBeNull();
      if (!ir2) return;
      const transitions = ir2.items.filter((i) => i.type === "transition");
      expect(transitions).toHaveLength(4);
    });

    it("state declarations survive round-trip", () => {
      const src = `stateDiagram-v2
  state "Not Evaluated" as NotEval
  [*] --> NotEval
`;
      const ir2 = roundTrip(src);
      expect(ir2).not.toBeNull();
      if (!ir2) return;
      const decl = ir2.items.find((i) => i.type === "state") as { name: string; description?: string } | undefined;
      expect(decl?.name).toBe("NotEval");
      expect(decl?.description).toBe("Not Evaluated");
    });

    it("single-line note survives round-trip", () => {
      const src = "stateDiagram-v2\n  [*] --> Idle\n  note right of Idle : initial state\n";
      const ir2 = roundTrip(src);
      expect(ir2).not.toBeNull();
      if (!ir2) return;
      const note = ir2.items.find((i) => i.type === "note") as { text: string } | undefined;
      expect(note?.text).toBe("initial state");
    });

    it("composite state raw lines are preserved", () => {
      const src = `stateDiagram-v2
  [*] --> First
  state First {
    [*] --> second
    second --> [*]
  }
`;
      const ir2 = roundTrip(src);
      expect(ir2).not.toBeNull();
      if (!ir2) return;
      expect(ir2.items.some((i) => i.type === "raw")).toBe(true);
    });
  });
});
