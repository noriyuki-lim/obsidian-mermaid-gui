/**
 * Mermaid's optional leading `---\n...\n---` frontmatter block is a generic
 * YAML mechanism shared across diagram kinds (theme, title, per-kind config).
 * We don't pull in a YAML dependency just to expose one kanban field
 * (`config.kanban.ticketBaseUrl`): the block is preserved verbatim end to
 * end, and only the `ticketBaseUrl` line is read/patched with a targeted
 * text match. Any other content already in the block — theme, title, other
 * config — survives untouched, matching the project's rawLines philosophy.
 */

export interface SplitFrontmatter {
  frontmatterRaw: string | null;
  rest: string;
}

/** Split a leading `---`-delimited block off `source`, if present. */
export const splitFrontmatter = (source: string): SplitFrontmatter => {
  const normalized = source.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "---") return { frontmatterRaw: null, rest: source };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      return {
        frontmatterRaw: lines.slice(0, i + 1).join("\n"),
        rest: lines.slice(i + 1).join("\n"),
      };
    }
  }
  return { frontmatterRaw: null, rest: source };
};

const TICKET_BASE_URL_LINE_RE = /^(\s*)ticketBaseUrl\s*:\s*(.*)$/;
const CONFIG_KEY_RE = /^(\s*)config\s*:\s*$/;
const KANBAN_KEY_RE = /^(\s*)kanban\s*:\s*$/;

const unquoteYamlScalar = (raw: string): string => {
  const m = raw.match(/^'([\s\S]*)'$|^"([\s\S]*)"$/);
  if (m) return m[1] ?? m[2] ?? "";
  return raw;
};

const quoteYamlScalar = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const BARE_KEY_RE = /^(\s*)\S.*:\s*$/;

/**
 * Remove now-childless `key:` lines (a mapping key with no value and no more
 * deeply indented line after it) from a frontmatter body, cascading upward —
 * clearing the one leaf value we manage (`ticketBaseUrl`) can leave `kanban:`
 * and then `config:` as empty shells, and those should disappear too rather
 * than linger as dead YAML.
 */
const dropEmptyKeyLines = (lines: string[]): string[] => {
  const result = lines.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < result.length - 1; i++) {
      const m = result[i].match(BARE_KEY_RE);
      if (!m) continue;
      const indent = m[1].length;
      const nextIndent = result[i + 1].match(/^(\s*)/)?.[1].length ?? 0;
      const hasChild = i + 1 < result.length - 1 && nextIndent > indent;
      if (!hasChild) {
        result.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return result;
};

/** Read `config.kanban.ticketBaseUrl` out of a frontmatter block. Empty string if absent. */
export const readTicketBaseUrl = (frontmatterRaw: string | undefined): string => {
  if (!frontmatterRaw) return "";
  for (const line of frontmatterRaw.split("\n")) {
    const m = line.match(TICKET_BASE_URL_LINE_RE);
    if (m) return unquoteYamlScalar(m[2].trim());
  }
  return "";
};

/**
 * Write `config.kanban.ticketBaseUrl`, touching only that one line. Nests a
 * fresh `config: / kanban:` block under an existing `config:` section when
 * present (so we never emit a duplicate top-level `config:` key), and drops
 * the whole frontmatter block if clearing the value leaves it empty.
 */
export const writeTicketBaseUrl = (
  frontmatterRaw: string | undefined,
  value: string,
): string | undefined => {
  const trimmedValue = value.trim();

  if (!frontmatterRaw) {
    if (!trimmedValue) return undefined;
    return [
      "---",
      "config:",
      "  kanban:",
      `    ticketBaseUrl: ${quoteYamlScalar(trimmedValue)}`,
      "---",
    ].join("\n");
  }

  const lines = frontmatterRaw.split("\n");
  const existingIdx = lines.findIndex((l) => TICKET_BASE_URL_LINE_RE.test(l));

  if (existingIdx !== -1) {
    if (!trimmedValue) {
      const cleaned = dropEmptyKeyLines([...lines.slice(0, existingIdx), ...lines.slice(existingIdx + 1)]);
      const bodyLines = cleaned.slice(1, -1);
      if (bodyLines.every((l) => l.trim() === "")) return undefined;
      return cleaned.join("\n");
    }
    const indent = lines[existingIdx].match(TICKET_BASE_URL_LINE_RE)?.[1] ?? "    ";
    lines[existingIdx] = `${indent}ticketBaseUrl: ${quoteYamlScalar(trimmedValue)}`;
    return lines.join("\n");
  }

  if (!trimmedValue) return frontmatterRaw;

  const kanbanIdx = lines.findIndex((l) => KANBAN_KEY_RE.test(l));
  if (kanbanIdx !== -1) {
    const indent = (lines[kanbanIdx].match(KANBAN_KEY_RE)?.[1] ?? "  ") + "  ";
    lines.splice(kanbanIdx + 1, 0, `${indent}ticketBaseUrl: ${quoteYamlScalar(trimmedValue)}`);
    return lines.join("\n");
  }

  const configIdx = lines.findIndex((l) => CONFIG_KEY_RE.test(l));
  if (configIdx !== -1) {
    const indent = (lines[configIdx].match(CONFIG_KEY_RE)?.[1] ?? "") + "  ";
    lines.splice(configIdx + 1, 0, `${indent}kanban:`, `${indent}  ticketBaseUrl: ${quoteYamlScalar(trimmedValue)}`);
    return lines.join("\n");
  }

  const closingIdx = lines.length - 1;
  lines.splice(closingIdx, 0, "config:", "  kanban:", `    ticketBaseUrl: ${quoteYamlScalar(trimmedValue)}`);
  return lines.join("\n");
};
