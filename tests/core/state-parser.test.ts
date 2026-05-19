import { describe, expect, it } from "vitest";
import { parseStateDiagram } from "../../src/core/state/parser";

describe("parseStateDiagram", () => {
  it("returns ok for valid stateDiagram-v2 header", () => {
    const result = parseStateDiagram("stateDiagram-v2\n  [*] --> Idle\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.kind).toBe("stateDiagram-v2");
  });

  it("returns ok for stateDiagram (v1) header", () => {
    const result = parseStateDiagram("stateDiagram\n  [*] --> Idle\n");
    expect(result.ok).toBe(true);
  });

  it("returns error when header is missing", () => {
    expect(parseStateDiagram("classDiagram\n").ok).toBe(false);
    expect(parseStateDiagram("").ok).toBe(false);
  });

  it("skips blank lines", () => {
    const result = parseStateDiagram("stateDiagram-v2\n\n  [*] --> Idle\n\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.items).toHaveLength(1);
  });

  // ── Transitions ────────────────────────────────────────────────────────

  describe("transitions", () => {
    it("parses initial transition [*] --> State", () => {
      const result = parseStateDiagram("stateDiagram-v2\n  [*] --> Idle\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "transition", from: "[*]", to: "Idle" });
    });

    it("parses final transition State --> [*]", () => {
      const result = parseStateDiagram("stateDiagram-v2\n  Running --> [*]\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "transition", from: "Running", to: "[*]" });
    });

    it("parses transition without label", () => {
      const result = parseStateDiagram("stateDiagram-v2\n  Idle --> Running\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "transition", from: "Idle", to: "Running" });
      expect((result.ir.items[0] as { label?: string }).label).toBeUndefined();
    });

    it("parses transition with label", () => {
      const result = parseStateDiagram("stateDiagram-v2\n  Idle --> Running : start\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({
        type: "transition", from: "Idle", to: "Running", label: "start",
      });
    });
  });

  // ── State declarations ────────────────────────────────────────────────

  describe("state declarations", () => {
    it("parses state with description", () => {
      const result = parseStateDiagram(`stateDiagram-v2\n  state "Not Evaluated" as NotEval\n`);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({
        type: "state", name: "NotEval", description: "Not Evaluated",
      });
    });

    it("parses state with annotation <<fork>>", () => {
      const result = parseStateDiagram("stateDiagram-v2\n  state fork_state <<fork>>\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "state", name: "fork_state", annotation: "fork" });
    });
  });

  // ── State descriptions ────────────────────────────────────────────────

  describe("state-desc items", () => {
    it("parses State : description text", () => {
      const result = parseStateDiagram("stateDiagram-v2\n  s1 : This is a state description\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({
        type: "state-desc", name: "s1", description: "This is a state description",
      });
    });
  });

  // ── Notes ────────────────────────────────────────────────────────────────

  describe("notes", () => {
    it("parses single-line note right of", () => {
      const result = parseStateDiagram("stateDiagram-v2\n  note right of Idle : waiting\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({
        type: "note", position: "right of", state: "Idle", text: "waiting",
      });
    });

    it("parses single-line note left of", () => {
      const result = parseStateDiagram("stateDiagram-v2\n  note left of Running : active\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "note", position: "left of" });
    });

    it("parses multi-line note block", () => {
      const src = `stateDiagram-v2
  note right of Idle
    line one
    line two
  end note
`;
      const result = parseStateDiagram(src);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items[0]).toMatchObject({ type: "note", position: "right of", state: "Idle" });
      expect((result.ir.items[0] as { text: string }).text).toContain("line one");
      expect((result.ir.items[0] as { text: string }).text).toContain("line two");
    });
  });

  // ── Composite state (raw) ────────────────────────────────────────────────

  describe("composite state blocks", () => {
    it("preserves composite state block as raw lines", () => {
      const src = `stateDiagram-v2
  state First {
    [*] --> second
    second --> [*]
  }
`;
      const result = parseStateDiagram(src);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const raw = result.ir.items.filter((i) => i.type === "raw");
      expect(raw.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ── Raw item retention ────────────────────────────────────────────────────

  describe("raw item retention", () => {
    it("preserves %% comments as raw", () => {
      const result = parseStateDiagram("stateDiagram-v2\n  %% comment\n  [*] --> Idle\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items.some((i) => i.type === "raw")).toBe(true);
    });

    it("preserves direction command as raw", () => {
      const result = parseStateDiagram("stateDiagram-v2\n  direction LR\n  [*] --> Idle\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items.some((i) => i.type === "raw")).toBe(true);
    });
  });
});
