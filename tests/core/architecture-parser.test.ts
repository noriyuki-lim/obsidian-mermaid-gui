import { describe, it, expect } from "vitest";
import { parseArchitecture } from "../../src/core/architecture/parser";

describe("parseArchitecture", () => {
  it("parses header-only", () => {
    const out = parseArchitecture("architecture-beta");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.items).toHaveLength(0);
  });

  it("parses group with icon and label", () => {
    const src = `architecture-beta
    group api(cloud)[API]`;
    const out = parseArchitecture(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.items[0]).toMatchObject({
      type: "group", id: "api", icon: "cloud", label: "API",
    });
  });

  it("parses service in group", () => {
    const src = `architecture-beta
    service db(database)[Database] in api`;
    const out = parseArchitecture(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.items[0]).toMatchObject({
      type: "service", id: "db", icon: "database", label: "Database", group: "api",
    });
  });

  it("parses edge with directions", () => {
    const src = `architecture-beta
    db:L -- R:server`;
    const out = parseArchitecture(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.items[0]).toMatchObject({
      type: "edge", fromId: "db", fromDir: "L", arrow: "--", toDir: "R", toId: "server",
    });
  });

  it("parses arrow variants", () => {
    const arrows = ["--", "-->", "<--", "<-->"];
    for (const arrow of arrows) {
      const src = `architecture-beta\n    a:T ${arrow} B:b`;
      const out = parseArchitecture(src);
      expect(out.ok).toBe(true);
      if (!out.ok) continue;
      const item = out.ir.items[0];
      if (item.type !== "edge") continue;
      expect(item.arrow).toBe(arrow);
    }
  });

  it("preserves unknown lines as raw", () => {
    const src = `architecture-beta
    weird unknown syntax`;
    const out = parseArchitecture(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.items[0].type).toBe("raw");
  });

  it("fails on missing header", () => {
    const out = parseArchitecture("service x");
    expect(out.ok).toBe(false);
  });
});
