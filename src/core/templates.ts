import type { Animation, TemplateId } from "../shared/types.js";
export interface TemplateDefinition {
  id: TemplateId;
  name: string;
  tagline: string;
  entryDuration: number;
  introDuration: number;
  summaryDuration: number;
  outroDuration: number;
  accent: string;
  animation: Partial<Animation>;
}
export const TEMPLATES: Record<TemplateId, TemplateDefinition> = {
  ranking: {
    id: "ranking",
    name: "The power ranking",
    tagline: "FIVE STORIES. ONE LEGEND.",
    entryDuration: 5,
    introDuration: 3,
    summaryDuration: 4,
    outroDuration: 3,
    accent: "#ff6547",
    animation: {
      camera: "zoom-pan",
      reveal: "mask",
      text: "ranking",
      transition: "wipe",
    },
  },
  analysis: {
    id: "analysis",
    name: "Inside the character",
    tagline: "BEYOND THE SURFACE.",
    entryDuration: 7,
    introDuration: 3,
    summaryDuration: 4,
    outroDuration: 3,
    accent: "#a1bdff",
    animation: {
      camera: "parallax",
      reveal: "fade",
      text: "words",
      transition: "crossfade",
    },
  },
  comparison: {
    id: "comparison",
    name: "Head to head",
    tagline: "TWO SIDES. ONE VERDICT.",
    entryDuration: 6,
    introDuration: 3,
    summaryDuration: 4,
    outroDuration: 3,
    accent: "#b3f58b",
    animation: {
      camera: "zoom-in",
      reveal: "slide",
      text: "kinetic",
      transition: "flash",
    },
  },
};
