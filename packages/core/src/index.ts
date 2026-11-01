export type Effect = "none" | "slow-zoom" | "shake" | "fade";
export type MediaAsset = { id: string; name: string; kind: "video" | "image"; path?: string; tags: string[]; license: string; source: string };
export type Scene = { id: string; start: number; end: number; title: string; narration: string; mediaId: string | null; effect: Effect; accent: string };
export type Timeline = { version: 1; title: string; fps: number; width: number; height: number; templateId: string; scenes: Scene[]; media: MediaAsset[] };
export const duration = (timeline: Timeline) => Math.max(0, ...timeline.scenes.map((scene) => scene.end));
export function validateTimeline(t: Timeline): string[] {
  const errors: string[] = [];
  if (t.version !== 1) errors.push("Unsupported timeline version");
  if (!(t.fps > 0 && t.width > 0 && t.height > 0)) errors.push("Invalid video dimensions or FPS");
  const ids = new Set<string>();
  let previousEnd = 0;
  for (const scene of t.scenes) {
    if (ids.has(scene.id)) errors.push(`Duplicate scene: ${scene.id}`);
    ids.add(scene.id);
    if (scene.start < 0 || scene.end <= scene.start) errors.push(`Invalid times: ${scene.id}`);
    if (scene.start < previousEnd - 0.001) errors.push(`Overlapping scene: ${scene.id}`);
    if (scene.mediaId && !t.media.some((asset) => asset.id === scene.mediaId)) errors.push(`Unknown media: ${scene.id}`);
    previousEnd = scene.end;
  }
  return errors;
}
export const sampleTimeline: Timeline = {
  version: 1, title: "Character Analysis", fps: 30, width: 1920, height: 1080, templateId: "character-analysis",
  media: [], scenes: [
    { id: "intro", start: 0, end: 5, title: "The Introduction", narration: "Every legendary character has an origin story.", mediaId: null, effect: "slow-zoom", accent: "#8b5cf6" },
    { id: "abilities", start: 5, end: 11, title: "Signature Abilities", narration: "Let's analyze what makes their abilities unique.", mediaId: null, effect: "fade", accent: "#06b6d4" },
    { id: "legacy", start: 11, end: 17, title: "The Legacy", narration: "And why their impact lasts beyond the story.", mediaId: null, effect: "none", accent: "#f59e0b" }
  ]
};
