import type { ClassDiagramIR, ClassMember } from "./ir-types";

/**
 * Generate Mermaid classDiagram source from ClassDiagramIR.
 *
 * Output order: relations, then class blocks (with members inline),
 * then notes, then raw lines — all in the order they appear in `ir.items`.
 * Members are rendered inside their class block; standalone member items
 * in the list are skipped (they were already emitted inside the block).
 */
export const generateClassDiagram = (ir: ClassDiagramIR): string => {
  const lines: string[] = ["classDiagram"];

  // Pre-collect all members per class and annotations
  const classMembers = new Map<string, ClassMember[]>();
  const classAnnotations = new Map<string, string>();
  const classesRendered = new Set<string>();

  for (const item of ir.items) {
    if (item.type === "member") {
      if (!classMembers.has(item.className)) classMembers.set(item.className, []);
      classMembers.get(item.className)!.push(item);
    }
    if (item.type === "class" && item.annotation) {
      classAnnotations.set(item.name, item.annotation);
    }
  }

  for (const item of ir.items) {
    switch (item.type) {
      case "class": {
        if (classesRendered.has(item.name)) break;
        classesRendered.add(item.name);
        const members = classMembers.get(item.name) ?? [];
        const annotation = item.annotation ?? classAnnotations.get(item.name);
        if (members.length > 0 || annotation) {
          lines.push(`  class ${item.name} {`);
          if (annotation) lines.push(`    <<${annotation}>>`);
          for (const m of members) {
            lines.push(`    ${m.visibility}${m.text}`);
          }
          lines.push(`  }`);
        } else {
          lines.push(`  class ${item.name}`);
        }
        break;
      }

      case "member":
        // Already rendered inside class block above
        break;

      case "relation": {
        let r = `  ${item.from}`;
        if (item.fromCardinality) r += ` "${item.fromCardinality}"`;
        r += ` ${item.relation} `;
        if (item.toCardinality) r += `"${item.toCardinality}" `;
        r += item.to;
        if (item.label) r += ` : ${item.label}`;
        lines.push(r);
        break;
      }

      case "note":
        if (item.forClass) {
          lines.push(`  note for ${item.forClass} "${item.text}"`);
        } else {
          lines.push(`  note "${item.text}"`);
        }
        break;

      case "raw":
        lines.push(item.line);
        break;
    }
  }

  // Emit any classes that appeared only as members (no explicit class decl in items)
  for (const [className, members] of classMembers.entries()) {
    if (!classesRendered.has(className)) {
      const annotation = classAnnotations.get(className);
      if (members.length > 0 || annotation) {
        lines.push(`  class ${className} {`);
        if (annotation) lines.push(`    <<${annotation}>>`);
        for (const m of members) lines.push(`    ${m.visibility}${m.text}`);
        lines.push(`  }`);
      }
    }
  }

  return lines.join("\n") + "\n";
};
