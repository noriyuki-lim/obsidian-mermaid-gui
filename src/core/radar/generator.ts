import type { RadarAxis, RadarCurve, RadarIR } from "./ir-types";

const renderAxis = (axis: RadarAxis): string =>
  axis.label !== undefined ? `${axis.id}["${axis.label.replace(/"/g, '\\"')}"]` : axis.id;

const renderCurve = (curve: RadarCurve): string => {
  const label = curve.label !== undefined ? `["${curve.label.replace(/"/g, '\\"')}"]` : "";
  return `  curve ${curve.id}${label}{${curve.values.join(", ")}}`;
};

export const generateRadar = (ir: RadarIR): string => {
  const lines: string[] = ["radar-beta"];

  if (ir.title !== undefined) lines.push(`  title ${ir.title}`);

  for (const axis of ir.axes) lines.push(`  axis ${renderAxis(axis)}`);
  for (const curve of ir.curves) lines.push(renderCurve(curve));

  if (ir.options.showLegend !== undefined) {
    lines.push(`  showLegend ${ir.options.showLegend ? "true" : "false"}`);
  }
  if (ir.options.max !== undefined) lines.push(`  max ${ir.options.max}`);
  if (ir.options.min !== undefined) lines.push(`  min ${ir.options.min}`);
  if (ir.options.ticks !== undefined) lines.push(`  ticks ${ir.options.ticks}`);
  if (ir.options.graticule !== undefined) lines.push(`  graticule ${ir.options.graticule}`);

  for (const raw of ir.rawLines) lines.push(raw.line);

  return lines.join("\n") + "\n";
};
