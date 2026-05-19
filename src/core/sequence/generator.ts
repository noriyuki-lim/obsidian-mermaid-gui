import type { SequenceIR, SequenceItem } from "./ir-types";

const renderItem = (item: SequenceItem): string => {
  switch (item.type) {
    case "participant":
      return item.label
        ? `  participant ${item.alias} as ${item.label}`
        : `  participant ${item.alias}`;
    case "actor":
      return item.label
        ? `  actor ${item.alias} as ${item.label}`
        : `  actor ${item.alias}`;
    case "message": {
      const arrow = item.arrow === "dotted-arrow" ? "-->>" : "->>";
      return `  ${item.from}${arrow}${item.to}: ${item.text}`;
    }
    case "note":
      return `  Note ${item.position} ${item.targets.join(",")}: ${item.text}`;
    case "activation":
      return `  ${item.active ? "activate" : "deactivate"} ${item.participant}`;
    case "raw":
      return item.line;
  }
};

export const generateSequence = (ir: SequenceIR): string =>
  ["sequenceDiagram", ...ir.items.map(renderItem)].join("\n") + "\n";
