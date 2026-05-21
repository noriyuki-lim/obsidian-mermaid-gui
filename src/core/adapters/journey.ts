import type { DiagramAdapter } from "./types";
import type { JourneyIR } from "../journey/ir-types";
import { parseJourney } from "../journey/parser";
import { generateJourney } from "../journey/generator";

export const journeyAdapter: DiagramAdapter<JourneyIR> = {
  kind: "journey",
  supportsGui: true,
  parse: parseJourney,
  generate: generateJourney,
};
