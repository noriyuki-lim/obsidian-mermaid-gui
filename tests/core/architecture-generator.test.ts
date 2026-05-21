import { describe, it, expect } from "vitest";
import { parseArchitecture } from "../../src/core/architecture/parser";
import { generateArchitecture } from "../../src/core/architecture/generator";

describe("generateArchitecture — round-trip", () => {
  const roundTrip = (src: string) => {
    const out = parseArchitecture(src);
    if (!out.ok) throw new Error(out.message);
    const gen = generateArchitecture(out.ir);
    const out2 = parseArchitecture(gen);
    if (!out2.ok) throw new Error(`re-parse: ${out2.message}\n---\n${gen}`);
    return { first: out.ir, second: out2.ir };
  };

  it("full diagram round-trips", () => {
    const src = `architecture-beta
    group api(cloud)[API]
    service db(database)[Database] in api
    service server(server)[Server] in api
    db:L -- R:server`;
    const { first, second } = roundTrip(src);
    expect(second.items).toHaveLength(first.items.length);
    expect(second.items[0]).toMatchObject({ type: "group", id: "api", icon: "cloud", label: "API" });
    expect(second.items[3]).toMatchObject({ type: "edge", fromId: "db", arrow: "--", toId: "server" });
  });

  it("generated source starts with architecture-beta", () => {
    const out = parseArchitecture("architecture-beta\n    service x");
    if (!out.ok) throw new Error(out.message);
    expect(generateArchitecture(out.ir)).toMatch(/^architecture-beta/);
  });
});
