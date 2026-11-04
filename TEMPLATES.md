# Templates and programmatic projects

All templates compile into the same `Project` schema and six tracks. `src/core/templates.ts` defines pacing and animation defaults; `src/core/model.ts` generates scenes/clips; `src/core/render.ts` implements responsive layouts. Modify content in the Story panel, then **Generate sequence** after structural changes. Visual timeline adjustments are intentionally rebuilt by generation; music and narration are preserved.

## Character ranking

An introduction, any number of ranked entries (schema limit 100), an automatically paginated ranking summary, and outro. Each entry supports a name, rank, subtitle, description, quote, score, and image/video. Camera movement, animated rank numbers, staged text, transitions, and a power index all use shared deterministic calculations. Entries play in their listed order; the rank field controls the displayed rank. The default is a five-to-one countdown.

## Character analysis

An opening hook and editorial character-study layout with a large portrait, multiple chapters, description, emphasized quote/fact, conclusion, and outro. Each structured entry can represent a chapter of the same character: use the chapter title as `name`, the theme as `subtitle`, and reuse the same `mediaId`. Different media clips can be placed on the media track to form sequences within chapters. This uses the same flexible entry schema as the other templates rather than a separate document format.

## Character comparison

Side-by-side primary and opponent media, independent named opponent, editable comparison category names and scores, animated bars, and a final result determined by the category totals (ties are explicit). Each entry represents a comparison segment. `secondaryMediaId` supplies opponent media. `mediaRole` on generated clips preserves the opponent side when clips are moved, split, or duplicated. Portrait output adapts the arrangement rather than stretching landscape pixels.

## Programmatic example

Run a TypeScript script with `node --import tsx your-script.ts` from the repository:

```ts
import { writeFile } from "node:fs/promises";
import {
  createProject,
  generateSequence,
  createClip,
  validateProject,
} from "./src/core/model.js";
import { renderProject } from "./src/server/render.js";
import { probeMedia } from "./src/server/media-tools.js";
import { MUSIC_LIBRARY } from "./src/audio/music.js";

let project = createProject("ranking", "Five unforgettable heroes");
project.entries[0].name = "Your first character";
project.entries[0].description = "Your narration-aligned description.";

const imagePath = "/absolute/path/to/hero.png";
const metadata = await probeMedia(imagePath);
project.assets.push({
  id: "hero-image",
  name: "Hero",
  path: imagePath,
  url: "",
  ...metadata,
  size: 0,
});
project.entries[0].mediaId = "hero-image";
project = generateSequence(project);

const music = MUSIC_LIBRARY[0];
project.assets.push({
  id: music.id,
  name: music.name,
  kind: "audio",
  builtin: true,
  path: `public/music/${music.id}.wav`,
  url: music.file,
  mime: "audio/wav",
  duration: music.duration,
  size: 0,
});
const musicClip = createClip("music", 0, 35, music.name);
Object.assign(musicClip, {
  assetId: music.id,
  loop: true,
  volume: 0.25,
  fadeIn: 0.5,
  fadeOut: 1,
});
project.clips.push(musicClip);

const voicePath = "/absolute/path/to/narration.wav";
const voiceMetadata = await probeMedia(voicePath);
project.assets.push({
  id: "voice",
  name: "My narration",
  path: voicePath,
  url: "",
  ...voiceMetadata,
  size: 0,
});
const voiceClip = createClip(
  "narration",
  2,
  voiceMetadata.duration,
  "My narration",
);
Object.assign(voiceClip, {
  assetId: "voice",
  normalize: true,
  fadeIn: 0.05,
  fadeOut: 0.2,
});
project.clips.push(voiceClip);
project.audio.ducking = {
  enabled: true,
  strength: 0.7,
  attack: 0.08,
  release: 0.35,
};
project = validateProject(project);
await writeFile("episode.json", JSON.stringify(project, null, 2));
await renderProject(project, {
  outputPath: "episode.mp4",
  onProgress: (progress, message) => console.log(progress, message),
});
```

The CLI trusts explicitly supplied local asset paths; the browser API accepts only imported assets in its managed registry. A project created for the CLI therefore cannot simply be PUT into the UI API without importing/registering its media first. This boundary prevents arbitrary filesystem reads from HTTP requests.

## Timing and effects

Times are seconds and preview/export evaluate the same functions. Clips are active on `[start,start+duration)`; `trimStart` offsets the source independently of timeline position. Audio loops repeat the source region after the trim point. Video without looping freezes its final available frame when a clip is longer than its source. Audio beyond a non-looped source becomes silence. Overall duration is the latest clip end, including audio.

`animation.duration` controls reveal/transition duration, `animation.delay` delays entry and camera motion, and `animation.easing` shapes progress. Camera traversal spans the remaining clip duration. `intensity` scales motion, while `focalX/focalY` are normalized focal positions. Clip X/Y positions are pixels in the internal 1280-wide layout coordinate space. `fit` is `cover` (fill/crop) or `contain` (fit).

Export audio modes affect audio only. Muted tracks and clip gain/fades are respected, with visual solo and audio solo groups independent. A muted solo track does not silence other enabled tracks. Scene transitions overlap generated visual clips; all subsequent manual trim/move changes are rendered as edited.
