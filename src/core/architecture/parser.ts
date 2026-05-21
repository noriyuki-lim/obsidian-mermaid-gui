import type { ParseOutcome } from "../adapters/types";
import type { ArchitectureIR, ArchItem, ArchEdgeDirection, ArchArrow } from "./ir-types";

// Parse `<keyword> <id>(<icon>)?[<label>]? (in <group>)?` style declarations
function parseDecl(rest: string): { id: string; icon?: string; label?: string; group?: string } | null {
  // Match: id, optional (icon), optional [label], optional `in group`
  const m = rest.match(/^(\S+?)(?:\(([^)]+)\))?(?:\[([^\]]+)\])?\s*(?:in\s+(\S+))?\s*$/);
  if (!m) return null;
  return {
    id: m[1],
    icon: m[2],
    label: m[3],
    group: m[4],
  };
}

const EDGE_RE = /^(\S+):([TBLR])\s*(--|<-->|-->|<--)\s*([TBLR]):(\S+)\s*$/;

export function parseArchitecture(source: string): ParseOutcome<ArchitectureIR> {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const items: ArchItem[] = [];
  let foundHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("%%")) continue;

    if (!foundHeader) {
      if (/^architecture-beta(\s|$)/.test(trimmed)) {
        foundHeader = true;
        continue;
      }
      return { ok: false, message: "Missing architecture-beta header", line: i + 1 };
    }

    // group
    const groupMatch = trimmed.match(/^group\s+(.+)$/);
    if (groupMatch) {
      const decl = parseDecl(groupMatch[1]);
      if (decl) {
        items.push({ type: "group", id: decl.id, icon: decl.icon, label: decl.label, parentGroup: decl.group });
        continue;
      }
    }

    // service
    const serviceMatch = trimmed.match(/^service\s+(.+)$/);
    if (serviceMatch) {
      const decl = parseDecl(serviceMatch[1]);
      if (decl) {
        items.push({ type: "service", id: decl.id, icon: decl.icon, label: decl.label, group: decl.group });
        continue;
      }
    }

    // junction
    const junctionMatch = trimmed.match(/^junction\s+(\S+)\s*(?:in\s+(\S+))?\s*$/);
    if (junctionMatch) {
      items.push({ type: "junction", id: junctionMatch[1], group: junctionMatch[2] });
      continue;
    }

    // edge
    const edgeMatch = trimmed.match(EDGE_RE);
    if (edgeMatch) {
      items.push({
        type: "edge",
        fromId: edgeMatch[1],
        fromDir: edgeMatch[2] as ArchEdgeDirection,
        arrow: edgeMatch[3] as ArchArrow,
        toDir: edgeMatch[4] as ArchEdgeDirection,
        toId: edgeMatch[5],
      });
      continue;
    }

    items.push({ type: "raw", line: raw });
  }

  if (!foundHeader) {
    return { ok: false, message: "Missing architecture-beta header" };
  }

  return { ok: true, ir: { kind: "architecture-beta", items }, warnings: [] };
}
