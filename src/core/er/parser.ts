import type { ParseOutcome } from "../adapters/types";
import type { ErDiagramIR, ErEntity, ErAttribute, ErRelationship, ErItem } from "./ir-types";

// Relationship: ENTITY1 LEFTCARD(--|..)RIGHTCARD ENTITY2 : "label"
// leftCard uses |, }, o e.g. "||", "|o", "}|", "}o"
// rightCard uses |, {, o e.g. "||", "o|", "|{", "o{"
const REL_RE = /^(\S+)\s+([\|}{o]+)(--|\.\.)([\|{o}]+)\s+(\S+)\s*:\s*"([^"]*)"\s*$/;

// Attribute inside {}: type name [PK|FK|UK]... ["comment"]
const ATTR_RE = /^(\S+)\s+(\S+)((?:\s+(?:PK|FK|UK))*)?(?:\s+"([^"]*)")?\s*$/;

export function parseErDiagram(source: string): ParseOutcome<ErDiagramIR> {
  try {
    const lines = source.replace(/\r\n/g, "\n").split("\n");
    const entities: ErEntity[] = [];
    const items: ErItem[] = [];

    let i = 0;
    let foundHeader = false;

    while (i < lines.length) {
      const raw = lines[i];
      const trimmed = raw.trim();
      i++;

      if (!trimmed || trimmed.startsWith("%%")) continue;

      if (!foundHeader) {
        if (/^erDiagram(\s|$)/.test(trimmed)) {
          foundHeader = true;
          continue;
        }
        return { ok: false, message: "Missing erDiagram header" };
      }

      // entity block start: NAME { or NAME{
      // Must not also match a relationship line
      const entityBlockMatch = trimmed.match(/^([A-Za-z_][\w-]*)\s*\{/);
      if (entityBlockMatch && !REL_RE.test(trimmed)) {
        const entityName = entityBlockMatch[1];
        const attributes: ErAttribute[] = [];
        while (i < lines.length) {
          const attrRaw = lines[i].trim();
          i++;
          if (attrRaw === "}") break;
          if (!attrRaw || attrRaw.startsWith("%%")) continue;
          const m = attrRaw.match(ATTR_RE);
          if (m) {
            const keysStr = (m[3] ?? "").trim();
            const keys = keysStr ? keysStr.split(/\s+/).filter(Boolean) : [];
            attributes.push({ type: m[1], name: m[2], keys, comment: m[4] });
          }
        }
        entities.push({ name: entityName, attributes });
        continue;
      }

      const relMatch = trimmed.match(REL_RE);
      if (relMatch) {
        items.push({
          type: "relationship",
          leftEntity: relMatch[1],
          leftCard: relMatch[2],
          lineStyle: relMatch[3] as "--" | "..",
          rightCard: relMatch[4],
          rightEntity: relMatch[5],
          label: relMatch[6],
        } satisfies ErRelationship);
        continue;
      }

      items.push({ type: "raw", line: raw });
    }

    if (!foundHeader) {
      return { ok: false, message: "Missing erDiagram header" };
    }

    return { ok: true, ir: { kind: "erDiagram", entities, items }, warnings: [] };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}
