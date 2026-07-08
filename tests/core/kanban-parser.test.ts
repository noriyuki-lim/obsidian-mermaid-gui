import { describe, it, expect } from "vitest";
import { parseKanban } from "../../src/core/kanban/parser";
import type { KanbanColumn } from "../../src/core/kanban/ir-types";

const firstColumn = (src: string): KanbanColumn => {
  const out = parseKanban(src);
  if (!out.ok) throw new Error("parse failed: " + out.message);
  const col = out.ir.items.find((i) => i.type === "column");
  if (!col || col.type !== "column") throw new Error("no column");
  return col;
};

describe("parseKanban", () => {
  it("parses header-only", () => {
    const out = parseKanban("kanban");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.items.filter((i) => i.type === "column")).toHaveLength(0);
  });

  it("fails on missing header", () => {
    expect(parseKanban("todo[To Do]").ok).toBe(false);
  });

  it("parses a column with bracketed id+title", () => {
    const col = firstColumn("kanban\n  todo[To Do]");
    expect(col).toMatchObject({ id: "todo", title: "To Do", bracketed: true });
  });

  it("parses a bare column title", () => {
    const col = firstColumn("kanban\n  Backlog");
    expect(col).toMatchObject({ title: "Backlog", bracketed: false });
    expect(col.id).toBeUndefined();
  });

  it("nests deeper-indented lines as cards of the current column", () => {
    const col = firstColumn("kanban\n  todo[To Do]\n    t1[Draft]\n    t2[Review]");
    expect(col.cards).toHaveLength(2);
    expect(col.cards[0]).toMatchObject({ id: "t1", text: "Draft", bracketed: true });
    expect(col.cards[1]).toMatchObject({ id: "t2", text: "Review" });
  });

  it("captures trailing @{...} card metadata verbatim", () => {
    const col = firstColumn("kanban\n  doing[Doing]\n    t1[Build]@{ assigned: 'kn', priority: 'High' }");
    expect(col.cards[0].metaRaw).toBe("@{ assigned: 'kn', priority: 'High' }");
    expect(col.cards[0].text).toBe("Build");
  });

  it("starts a new column when indentation returns to the column level", () => {
    const out = parseKanban("kanban\n  a[A]\n    c1[card]\n  b[B]");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const cols = out.ir.items.filter((i) => i.type === "column");
    expect(cols).toHaveLength(2);
  });

  it("parses the `column <id>[<title>]` keyword form", () => {
    const col = firstColumn("kanban\n  column todo[TODO]");
    expect(col).toMatchObject({ id: "todo", title: "TODO", bracketed: true, keyword: true });
  });

  it("treats a bare title starting with the word column as plain text (no brackets = ambiguous)", () => {
    const col = firstColumn("kanban\n  column of items");
    expect(col).toMatchObject({ title: "column of items", bracketed: false, keyword: false });
  });

  it("strips and preserves a leading frontmatter block", () => {
    const src = "---\nconfig:\n  kanban:\n    ticketBaseUrl: 'https://x/#TICKET#'\n---\nkanban\n  todo[To Do]";
    const out = parseKanban(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.frontmatterRaw).toBe(
      "---\nconfig:\n  kanban:\n    ticketBaseUrl: 'https://x/#TICKET#'\n---",
    );
    expect(out.ir.items.filter((i) => i.type === "column")).toHaveLength(1);
  });

  it("has no frontmatterRaw when the source has none", () => {
    const out = parseKanban("kanban\n  todo[To Do]");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.frontmatterRaw).toBeUndefined();
  });
});
