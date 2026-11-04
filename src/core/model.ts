import { z } from "zod";
import type {
  Animation,
  Asset,
  Clip,
  ContentEntry,
  Project,
  TemplateId,
  TrackKind,
} from "../shared/types.js";
import { TEMPLATES } from "./templates.js";
const id = () => globalThis.crypto.randomUUID();
const string = z.string().max(10000);
const identifier = z.string().min(1).max(200);
const finite = z.number().finite();
const time = finite.min(0).max(7200);
const color = z
  .string()
  .regex(/^#[a-fA-F0-9]{6}$/, "Use a six-digit hex color");
export const animationSchema = z.object({
  camera: z.enum([
    "none",
    "zoom-in",
    "zoom-out",
    "pan-x",
    "pan-y",
    "zoom-pan",
    "parallax",
    "shake",
  ]),
  reveal: z.enum(["fade", "slide", "scale", "blur", "mask", "character"]),
  text: z.enum(["words", "lines", "typewriter", "kinetic", "scale", "ranking"]),
  transition: z.enum(["crossfade", "wipe", "zoom", "blur", "match", "flash"]),
  duration: finite.min(0.01).max(20),
  delay: time,
  intensity: finite.min(0).max(3),
  easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out", "back"]),
  focalX: finite.min(0).max(1),
  focalY: finite.min(0).max(1),
});
const entrySchema = z.object({
  id: identifier,
  name: string,
  subtitle: string,
  description: string,
  quote: string,
  rank: finite.int().min(1).max(10000),
  score: finite.min(0).max(100),
  comparisonScore: finite.min(0).max(100),
  opponentName: string.optional(),
  categories: z
    .array(
      z.object({
        label: string,
        score: finite.min(0).max(100),
        comparisonScore: finite.min(0).max(100),
      }),
    )
    .max(6)
    .optional(),
  mediaId: identifier.optional(),
  secondaryMediaId: identifier.optional(),
});
const assetSchema = z.object({
  id: identifier,
  name: string,
  kind: z.enum(["image", "video", "audio"]),
  path: string,
  url: string,
  mime: string,
  duration: time,
  width: finite.int().positive().max(32768).optional(),
  height: finite.int().positive().max(32768).optional(),
  waveform: z.array(finite.min(-1).max(1)).max(100000).optional(),
  size: finite.min(0),
  builtin: z.boolean().optional(),
});
const clipSchema = z.object({
  id: identifier,
  trackId: identifier,
  sceneId: identifier.optional(),
  entryId: identifier.optional(),
  assetId: identifier.optional(),
  mediaRole: z.enum(["primary", "secondary"]).optional(),
  label: string,
  start: time,
  duration: finite.min(1 / 120).max(7200),
  trimStart: time,
  volume: finite.min(0).max(4),
  muted: z.boolean(),
  fadeIn: time,
  fadeOut: time,
  loop: z.boolean(),
  normalize: z.boolean(),
  fit: z.enum(["cover", "contain"]),
  x: finite.min(-10000).max(10000),
  y: finite.min(-10000).max(10000),
  scale: finite.min(0.05).max(10),
  opacity: finite.min(0).max(1),
  animation: animationSchema,
  text: string.optional(),
  color: color.optional(),
});
export const projectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: identifier,
    title: string,
    template: z.enum(["ranking", "analysis", "comparison"]),
    createdAt: string,
    updatedAt: string,
    width: finite.int().min(64).max(4096),
    height: finite.int().min(64).max(4096),
    fps: z.literal(30),
    accent: color,
    entries: z.array(entrySchema).max(100),
    scenes: z
      .array(
        z.object({
          id: identifier,
          kind: z.enum(["intro", "entry", "summary", "outro"]),
          title: string,
          subtitle: string,
          start: time,
          duration: finite.positive().max(7200),
          entryId: identifier.optional(),
        }),
      )
      .max(500),
    tracks: z
      .array(
        z.object({
          id: identifier,
          kind: z.enum([
            "background",
            "media",
            "text",
            "effects",
            "music",
            "narration",
          ]),
          name: string,
          muted: z.boolean(),
          solo: z.boolean(),
          volume: finite.min(0).max(4),
        }),
      )
      .length(6),
    clips: z.array(clipSchema).max(10000),
    assets: z.array(assetSchema).max(1000),
    audio: z.object({
      mode: z.enum(["music-narration", "music", "narration", "silent"]),
      ducking: z.object({
        enabled: z.boolean(),
        strength: finite.min(0).max(1),
        attack: finite.min(0.001).max(10),
        release: finite.min(0.001).max(10),
      }),
    }),
    export: z.object({
      outputName: z.string().min(1).max(200),
      quality: z.enum(["draft", "standard", "high"]),
    }),
  })
  .superRefine((p, ctx) => {
    const problem = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: "custom", message, path });
    for (const key of [
      "entries",
      "scenes",
      "tracks",
      "clips",
      "assets",
    ] as const) {
      const seen = new Set<string>();
      p[key].forEach((item, i) => {
        if (seen.has(item.id)) problem("Duplicate identifier", [key, i, "id"]);
        seen.add(item.id);
      });
    }
    if (new Set(p.tracks.map((t) => t.kind)).size !== 6)
      problem("All six track kinds are required", ["tracks"]);
    const entries = new Set(p.entries.map((x) => x.id)),
      scenes = new Set(p.scenes.map((x) => x.id)),
      tracks = new Map(p.tracks.map((x) => [x.id, x])),
      assets = new Map(p.assets.map((x) => [x.id, x]));
    p.entries.forEach((e, i) => {
      for (const key of ["mediaId", "secondaryMediaId"] as const)
        if (
          e[key] &&
          (!assets.has(e[key]!) || assets.get(e[key]!)?.kind === "audio")
        )
          problem("Entry needs an existing image or video", [
            "entries",
            i,
            key,
          ]);
    });
    p.scenes.forEach((s, i) => {
      if (s.entryId && !entries.has(s.entryId))
        problem("Unknown entry", ["scenes", i, "entryId"]);
      if (s.start + s.duration > 7200)
        problem("Project cannot exceed two hours", ["scenes", i]);
    });
    p.clips.forEach((c, i) => {
      const track = tracks.get(c.trackId);
      if (!track) problem("Unknown track", ["clips", i, "trackId"]);
      if (c.entryId && !entries.has(c.entryId))
        problem("Unknown entry", ["clips", i, "entryId"]);
      if (c.sceneId && !scenes.has(c.sceneId))
        problem("Unknown scene", ["clips", i, "sceneId"]);
      if (c.assetId && !assets.has(c.assetId))
        problem("Unknown asset", ["clips", i, "assetId"]);
      if (c.assetId && track) {
        const audio = ["music", "narration"].includes(track.kind);
        if (audio && assets.get(c.assetId)?.kind === "image")
          problem("Audio track cannot contain an image", [
            "clips",
            i,
            "assetId",
          ]);
        if (!audio && assets.get(c.assetId)?.kind === "audio")
          problem("Visual track cannot contain audio", ["clips", i, "assetId"]);
      }
      if (c.start + c.duration > 7200)
        problem("Project cannot exceed two hours", ["clips", i]);
    });
  });
export function validateProject(input: unknown): Project {
  const result = projectSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid project: ${result.error.issues
        .slice(0, 5)
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ")}`,
    );
  return result.data;
}
export function defaultAnimation(): Animation {
  return {
    camera: "zoom-pan",
    reveal: "fade",
    text: "words",
    transition: "crossfade",
    duration: 0.65,
    delay: 0,
    intensity: 1,
    easing: "ease-out",
    focalX: 0.5,
    focalY: 0.4,
  };
}
export function createClip(
  trackId: string,
  start: number,
  duration: number,
  label: string,
): Clip {
  return {
    id: id(),
    trackId,
    label,
    start,
    duration,
    trimStart: 0,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    loop: false,
    normalize: false,
    fit: "cover",
    x: 0,
    y: 0,
    scale: 1,
    opacity: 1,
    animation: defaultAnimation(),
  };
}
const seedEntries: Omit<ContentEntry, "id">[] = [
  {
    name: "Akira Ren",
    subtitle: "THE LAST EMBER",
    description:
      "A quiet strategist with an unbreakable resolve. Every defeat becomes the spark for a stronger return.",
    quote: "Even a dying ember can light the sky.",
    rank: 5,
    score: 82,
    comparisonScore: 76,
  },
  {
    name: "Yuna Kaze",
    subtitle: "THE STORM WALKER",
    description:
      "Speed is only the beginning. Her instinct turns impossible odds into a perfectly timed opening.",
    quote: "The wind never asks which way to go.",
    rank: 4,
    score: 87,
    comparisonScore: 81,
  },
  {
    name: "Rin Ashida",
    subtitle: "THE SILENT BLADE",
    description:
      "Discipline sharpened into an art. Beneath the calm exterior is a promise that cannot be broken.",
    quote: "A steady hand. A restless heart.",
    rank: 3,
    score: 91,
    comparisonScore: 85,
  },
  {
    name: "Kai Sora",
    subtitle: "THE FALLEN STAR",
    description:
      "Once defined by a legacy, now driven by a choice. His greatest strength is the courage to begin again.",
    quote: "I will write my own constellation.",
    rank: 2,
    score: 95,
    comparisonScore: 89,
  },
  {
    name: "Rei Hoshino",
    subtitle: "THE INFINITE DAWN",
    description:
      "Power means nothing without someone to protect. A fearless spirit who brings light to the darkest horizon.",
    quote: "Tomorrow is a promise worth keeping.",
    rank: 1,
    score: 98,
    comparisonScore: 94,
  },
];
export function createProject(
  template: TemplateId = "ranking",
  title?: string,
): Project {
  const def = TEMPLATES[template];
  if (!def) throw new Error("Unknown template");
  const now = new Date().toISOString();
  const kinds: TrackKind[] = [
    "background",
    "media",
    "text",
    "effects",
    "music",
    "narration",
  ];
  return generateSequence({
    schemaVersion: 1,
    id: id(),
    title: title ?? def.name,
    template,
    createdAt: now,
    updatedAt: now,
    width: 1280,
    height: 720,
    fps: 30,
    accent: def.accent,
    entries: seedEntries.map((e, i) => ({
      ...e,
      id: id(),
      opponentName: seedEntries[(i + 1) % seedEntries.length]!.name,
      categories: [
        { label: "Power", score: e.score, comparisonScore: e.comparisonScore },
        {
          label: "Strategy",
          score: e.score - 7,
          comparisonScore: e.comparisonScore + 2,
        },
        {
          label: "Resolve",
          score: e.score - 14,
          comparisonScore: e.comparisonScore + 4,
        },
      ],
    })),
    scenes: [],
    tracks: kinds.map((kind) => ({
      id: kind,
      kind,
      name: kind.charAt(0).toUpperCase() + kind.slice(1),
      muted: false,
      solo: false,
      volume: 1,
    })),
    clips: [],
    assets: [],
    audio: {
      mode: "music-narration",
      ducking: { enabled: true, strength: 0.65, attack: 0.08, release: 0.35 },
    },
    export: { outputName: "kuro-studio.mp4", quality: "standard" },
  });
}
export function generateSequence(project: Project): Project {
  const p = cloneProject(project),
    def = TEMPLATES[p.template];
  const audioIds = new Set(
    p.tracks
      .filter((t) => t.kind === "music" || t.kind === "narration")
      .map((t) => t.id),
  );
  p.clips = p.clips.filter((c) => audioIds.has(c.trackId));
  p.scenes = [];
  let start = 0;
  const add = (
    kind: Project["scenes"][number]["kind"],
    duration: number,
    title: string,
    subtitle: string,
    entry?: ContentEntry,
  ) => {
    const scene = {
      id: id(),
      kind,
      start,
      duration,
      title,
      subtitle,
      entryId: entry?.id,
    };
    p.scenes.push(scene);
    for (const track of p.tracks.filter((t) => !audioIds.has(t.id))) {
      const c = createClip(
        track.id,
        start,
        duration,
        track.kind === "text" ? title : `${title} · ${track.kind}`,
      );
      c.sceneId = scene.id;
      c.entryId = entry?.id;
      c.animation = { ...c.animation, ...def.animation };
      if (track.kind === "background")
        c.animation = {
          ...c.animation,
          camera: "none",
          reveal: "fade",
          delay: 0,
        };
      if (track.kind === "media") {
        c.mediaRole = "primary";
        if (entry?.mediaId) c.assetId = entry.mediaId;
      }
      p.clips.push(c);
      if (p.template === "comparison" && track.kind === "media" && entry) {
        const second = {
          ...structuredClone(c),
          id: `${c.id}-secondary`,
          mediaRole: "secondary" as const,
          label: `${title} · challenger`,
          assetId: entry.secondaryMediaId,
        };
        p.clips.push(second);
      }
    }
    start += duration;
  };
  add("intro", def.introDuration, p.title, def.tagline);
  for (const e of p.entries)
    add("entry", def.entryDuration, e.name, e.subtitle, e);
  add(
    "summary",
    def.summaryDuration * Math.max(1, Math.ceil(p.entries.length / 6)),
    p.template === "ranking"
      ? "The final ranking"
      : p.template === "comparison"
        ? "The verdict"
        : "The story so far",
    `${p.entries.length} CHARACTERS · YOUR PERSPECTIVE`,
  );
  add(
    "outro",
    def.outroDuration,
    "Every legend has a story.",
    "WHAT IS YOURS?",
  );
  for (const c of p.clips) {
    if (!audioIds.has(c.trackId) && c.sceneId !== p.scenes.at(-1)?.id)
      c.duration += Math.min(c.animation.duration, 0.65);
  }
  p.updatedAt = new Date().toISOString();
  return p;
}
export function projectDuration(project: Project): number {
  return Math.max(0, ...project.clips.map((c) => c.start + c.duration));
}
export function cloneProject(project: Project): Project {
  return structuredClone(project);
}
export function updateClip(
  project: Project,
  clipId: string,
  partial: Partial<Clip>,
): Project {
  if (!project.clips.some((c) => c.id === clipId))
    throw new Error("Clip not found");
  return validateProject({
    ...project,
    updatedAt: new Date().toISOString(),
    clips: project.clips.map((c) =>
      c.id === clipId ? { ...c, ...partial, id: c.id } : c,
    ),
  });
}
export function replaceAsset(
  project: Project,
  oldId: string,
  newAsset: Asset,
): Project {
  if (!project.assets.some((a) => a.id === oldId))
    throw new Error("Asset not found");
  const p = cloneProject(project);
  p.assets = p.assets.filter((a) => a.id !== oldId && a.id !== newAsset.id);
  p.assets.push(newAsset);
  for (const c of p.clips) if (c.assetId === oldId) c.assetId = newAsset.id;
  for (const e of p.entries) {
    if (e.mediaId === oldId) e.mediaId = newAsset.id;
    if (e.secondaryMediaId === oldId) e.secondaryMediaId = newAsset.id;
  }
  p.updatedAt = new Date().toISOString();
  return validateProject(p);
}
