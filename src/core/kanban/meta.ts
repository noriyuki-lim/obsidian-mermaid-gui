/**
 * Structured access to a card's trailing `@{ ticket: ..., assigned: ...,
 * priority: ... }` metadata block. `KanbanCard.metaRaw` stays the source of
 * truth (verbatim, so unknown keys never get dropped); these helpers parse it
 * into an ordered key/value list, expose the three known fields, and patch a
 * single field back in place without disturbing the others — same rawLines
 * philosophy as the rest of the plugin, applied at the `@{...}` granularity.
 */

export const KANBAN_PRIORITIES = ["Very High", "High", "Low", "Very Low"] as const;
export type KanbanPriority = (typeof KANBAN_PRIORITIES)[number];

export interface KanbanCardFields {
  ticket?: string;
  assigned?: string;
  priority?: KanbanPriority;
}

interface MetaEntry {
  key: string;
  rawValue: string;
}

const META_ENTRY_RE = /([A-Za-z_][\w-]*)\s*:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[^,}]+)/g;

const parseMetaEntries = (metaRaw: string | undefined): MetaEntry[] => {
  if (!metaRaw) return [];
  const inner = metaRaw.trim().replace(/^@\{/, "").replace(/\}$/, "");
  const entries: MetaEntry[] = [];
  META_ENTRY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = META_ENTRY_RE.exec(inner))) {
    entries.push({ key: m[1], rawValue: m[2].trim() });
  }
  return entries;
};

const serializeMetaEntries = (entries: MetaEntry[]): string | undefined => {
  if (entries.length === 0) return undefined;
  return `@{ ${entries.map((e) => `${e.key}: ${e.rawValue}`).join(", ")} }`;
};

const unquote = (raw: string): string => {
  const m = raw.match(/^'([\s\S]*)'$|^"([\s\S]*)"$/);
  if (m) return (m[1] ?? m[2] ?? "").replace(/\\(['"])/g, "$1");
  return raw;
};

const quote = (value: string): string => `'${value.replace(/'/g, "\\'")}'`;

const isPriority = (v: string): v is KanbanPriority =>
  (KANBAN_PRIORITIES as readonly string[]).includes(v);

/** Read the known fields out of a card's raw `@{...}` metadata. */
export const readCardFields = (metaRaw: string | undefined): KanbanCardFields => {
  const fields: KanbanCardFields = {};
  for (const e of parseMetaEntries(metaRaw)) {
    if (e.key === "ticket") fields.ticket = unquote(e.rawValue);
    else if (e.key === "assigned") fields.assigned = unquote(e.rawValue);
    else if (e.key === "priority") {
      const v = unquote(e.rawValue);
      if (isPriority(v)) fields.priority = v;
    }
  }
  return fields;
};

const upsertEntry = (entries: MetaEntry[], key: string, rawValue: string | undefined): MetaEntry[] => {
  const idx = entries.findIndex((e) => e.key === key);
  if (rawValue === undefined) {
    if (idx === -1) return entries;
    return [...entries.slice(0, idx), ...entries.slice(idx + 1)];
  }
  if (idx === -1) return [...entries, { key, rawValue }];
  return entries.map((e, i) => (i === idx ? { key, rawValue } : e));
};

/**
 * Patch one or more known fields into a card's raw metadata, leaving any
 * other keys (and the exact formatting of untouched values) as they were.
 * Passing `undefined` (or `""`) for a field removes it from the block.
 */
export const writeCardFields = (
  metaRaw: string | undefined,
  patch: Partial<Record<keyof KanbanCardFields, string | undefined>>,
): string | undefined => {
  let entries = parseMetaEntries(metaRaw);
  for (const key of Object.keys(patch) as (keyof KanbanCardFields)[]) {
    const value = patch[key];
    entries = upsertEntry(entries, key, value ? quote(value) : undefined);
  }
  return serializeMetaEntries(entries);
};
