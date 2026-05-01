import type { NodeShape } from "./ir-types";

/**
 * Mermaid flowchart node-shape token mapping.
 * Order matters: longer / more specific opening sequences must be tried first
 * so that e.g. `[[` is not misread as `[`.
 */
export interface ShapeBracket {
  shape: NodeShape;
  open: string;
  close: string;
  /** Display label shown in the palette */
  display: string;
}

export const SHAPE_BRACKETS: ShapeBracket[] = [
  { shape: "subroutine", open: "[[", close: "]]", display: "Subroutine" },
  { shape: "cylinder", open: "[(", close: ")]", display: "Cylinder" },
  { shape: "circle", open: "((", close: "))", display: "Circle" },
  { shape: "trapezoid", open: "[/", close: "\\]", display: "Trapezoid" },
  { shape: "trapezoid_alt", open: "[\\", close: "/]", display: "Trapezoid alt" },
  { shape: "parallelogram", open: "[/", close: "/]", display: "Parallelogram" },
  { shape: "parallelogram_alt", open: "[\\", close: "\\]", display: "Parallelogram alt" },
  { shape: "hexagon", open: "{{", close: "}}", display: "Hexagon" },
  { shape: "stadium", open: "([", close: "])", display: "Stadium" },
  { shape: "rect", open: "[", close: "]", display: "Rectangle" },
  { shape: "round", open: "(", close: ")", display: "Rounded" },
  { shape: "rhombus", open: "{", close: "}", display: "Rhombus" },
  { shape: "asymmetric", open: ">", close: "]", display: "Asymmetric" },
];

export const SHAPE_BY_KEY: Record<NodeShape, ShapeBracket> = SHAPE_BRACKETS.reduce(
  (acc, b) => {
    // First-wins for shapes that appear twice (open/close ambiguity is intentional in the table above).
    if (!acc[b.shape]) acc[b.shape] = b;
    return acc;
  },
  {} as Record<NodeShape, ShapeBracket>,
);

export const PALETTE_SHAPES: NodeShape[] = [
  "rect",
  "round",
  "stadium",
  "subroutine",
  "cylinder",
  "circle",
  "rhombus",
  "hexagon",
  "asymmetric",
  "parallelogram",
  "trapezoid",
];
