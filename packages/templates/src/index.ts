export type EditingTemplate = { id: string; name: string; description: string; aspectRatio: "16:9" | "9:16"; defaultEffect: "none" | "slow-zoom" | "shake" | "fade"; accent: string };
export const templates: EditingTemplate[] = [
  { id: "character-analysis", name: "Character Analysis", description: "Narrative commentary with dramatic chapter cards", aspectRatio: "16:9", defaultEffect: "slow-zoom", accent: "#8b5cf6" },
  { id: "character-comparison", name: "Character Comparison", description: "Side-by-side thematic comparisons", aspectRatio: "16:9", defaultEffect: "fade", accent: "#06b6d4" },
  { id: "ranking", name: "Top Ranking", description: "Countdowns and tier-based analysis", aspectRatio: "16:9", defaultEffect: "shake", accent: "#f59e0b" }
];
