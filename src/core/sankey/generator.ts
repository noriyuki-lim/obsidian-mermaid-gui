import type { SankeyIR, SankeyItem } from "./ir-types";

const needsCsvQuoting = (field: string): boolean => /[",\r\n]/.test(field);

const csvField = (field: string): string => {
  if (!needsCsvQuoting(field)) return field;
  return `"${field.replace(/"/g, '""')}"`;
};

const renderItem = (item: SankeyItem): string => {
  switch (item.type) {
    case "link":
      return `${csvField(item.source)},${csvField(item.target)},${formatValue(item.value)}`;
    case "raw":
      return item.line;
  }
};

const formatValue = (n: number): string => (Number.isInteger(n) ? String(n) : String(n));

export const generateSankey = (ir: SankeyIR): string => {
  const lines: string[] = ["sankey-beta"];
  if (ir.hasHeaderRow) lines.push("source,target,value");
  for (const item of ir.items) lines.push(renderItem(item));
  return lines.join("\n") + "\n";
};
