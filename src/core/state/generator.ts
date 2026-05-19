import type { StateDiagramIR, StateDiagramItem } from "./ir-types";

const renderItem = (item: StateDiagramItem): string => {
  switch (item.type) {
    case "state":
      if (item.description) return `  state "${item.description}" as ${item.name}`;
      if (item.annotation) return `  state ${item.name} <<${item.annotation}>>`;
      return `  state ${item.name}`;

    case "state-desc":
      return `  ${item.name} : ${item.description}`;

    case "transition": {
      const base = `  ${item.from} --> ${item.to}`;
      return item.label ? `${base} : ${item.label}` : base;
    }

    case "note": {
      const text = item.text;
      if (text.includes("\n")) {
        const indented = text.split("\n").map((l) => `    ${l}`).join("\n");
        return `  note ${item.position} ${item.state}\n${indented}\n  end note`;
      }
      return `  note ${item.position} ${item.state} : ${text}`;
    }

    case "raw":
      return item.line;
  }
};

export const generateStateDiagram = (ir: StateDiagramIR): string =>
  ["stateDiagram-v2", ...ir.items.map(renderItem)].join("\n") + "\n";
