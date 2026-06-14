import { describe, expect, it } from "vitest";
import { DIAGRAM_TEMPLATES, getTemplate, templateSource } from "../../src/core/templates";
import { detectDiagramKind } from "../../src/core/diagram-kind";
import { getAdapter } from "../../src/core/adapters";

describe("DIAGRAM_TEMPLATES", () => {
  it("every template's source detects as the declared kind", () => {
    for (const tpl of DIAGRAM_TEMPLATES) {
      const detected = detectDiagramKind(templateSource(tpl));
      expect(detected, `template "${tpl.label}"`).toBe(tpl.kind);
    }
  });

  it("every template parses cleanly through its adapter", () => {
    for (const tpl of DIAGRAM_TEMPLATES) {
      const adapter = getAdapter(tpl.kind);
      expect(adapter, `adapter for ${tpl.kind}`).toBeTruthy();
      if (!adapter || !adapter.supportsGui) continue;
      const outcome = adapter.parse(templateSource(tpl));
      expect(
        outcome.ok,
        `parse "${tpl.label}" — ${outcome.ok ? "" : outcome.message}`,
      ).toBe(true);
    }
  });

  it("getTemplate returns the entry matching the kind", () => {
    for (const tpl of DIAGRAM_TEMPLATES) {
      expect(getTemplate(tpl.kind)).toBe(tpl);
    }
    expect(getTemplate("unknown")).toBeUndefined();
  });
});
