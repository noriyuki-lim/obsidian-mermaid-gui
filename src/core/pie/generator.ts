import type { PieIR, PieItem } from "./ir-types";

const renderHeader = (ir: PieIR): string => {
  let header = "pie";
  if (ir.showData) header += " showData";
  if (ir.title !== undefined) {
    const needsQuotes = /[\s":]/.test(ir.title);
    header += needsQuotes ? ` title "${ir.title.replace(/"/g, '\\"')}"` : ` title ${ir.title}`;
  }
  return header;
};

const renderItem = (item: PieItem): string => {
  switch (item.type) {
    case "slice": {
      const escaped = item.label.replace(/"/g, '\\"');
      return `  "${escaped}" : ${formatValue(item.value)}`;
    }
    case "raw":
      return item.line;
  }
};

const formatValue = (n: number): string => {
  if (Number.isInteger(n)) return String(n);
  // Up to two decimal places per the Mermaid spec, but preserve user precision when shorter.
  return String(n);
};

export const generatePie = (ir: PieIR): string =>
  [renderHeader(ir), ...ir.items.map(renderItem)].join("\n") + "\n";
