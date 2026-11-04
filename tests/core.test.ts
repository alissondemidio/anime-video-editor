import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import {
  createProject,
  generateSequence,
  projectDuration,
  validateProject,
  updateClip,
  replaceAsset,
  createClip,
  defaultAnimation,
} from "../src/core/model.js";
import {
  cameraTransform,
  ease,
  progressAt,
  revealState,
  visibleText,
} from "../src/core/animation.js";
import { renderFrame } from "../src/core/render.js";
import type {
  Asset,
  Project,
  TemplateId,
  Animation,
} from "../src/shared/types.js";
GlobalFonts.registerFromPath("public/fonts/DejaVuSans.ttf", "DejaVu Sans");
GlobalFonts.registerFromPath("public/fonts/DejaVuSans-Bold.ttf", "DejaVu Sans");
function frame(
  project: Project,
  time: number,
  media: Map<string, CanvasImageSource> = new Map(),
) {
  const canvas = createCanvas(project.width, project.height);
  renderFrame(
    canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
    project,
    time,
    media,
  );
  return canvas;
}
const hash = (canvas: ReturnType<typeof frame>) =>
  createHash("sha256").update(canvas.data()).digest("hex");
const imageAsset = (id: string): Asset => ({
  id,
  name: id + ".png",
  kind: "image",
  path: id + ".png",
  url: "/api/assets/" + id + "/file",
  mime: "image/png",
  duration: 0,
  size: 100,
  width: 100,
  height: 100,
});
test("all templates generate complete editable six-track projects with distinct pacing and layouts", () => {
  const hashes = new Set<string>();
  for (const template of [
    "ranking",
    "analysis",
    "comparison",
  ] as TemplateId[]) {
    const p = createProject(template);
    assert.equal(
      validateProject(JSON.parse(JSON.stringify(p))).template,
      template,
    );
    assert.equal(p.entries.length, 5);
    assert.equal(p.tracks.length, 6);
    assert.deepEqual(
      p.scenes.map((s) => s.kind),
      [
        "intro",
        "entry",
        "entry",
        "entry",
        "entry",
        "entry",
        "summary",
        "outro",
      ],
    );
    assert.ok(projectDuration(p) > 30);
    assert.equal(p.scenes.filter((s) => s.kind === "entry").length, 5);
    hashes.add(hash(frame(p, 4.5)));
  }
  assert.equal(hashes.size, 3);
});
test("generation handles variable ranking lengths and preserves independent narration and media", () => {
  const p = createProject();
  p.entries = p.entries.slice(0, 2);
  const voice: Asset = {
    ...imageAsset("voice"),
    kind: "audio",
    mime: "audio/wav",
    duration: 60,
  };
  p.assets.push(voice);
  const narration = {
    ...createClip("narration", 6, 42, "My narration"),
    assetId: "voice",
    trimStart: 2,
    fadeIn: 0.5,
  };
  p.clips.push(narration);
  const generated = generateSequence(p);
  assert.deepEqual(
    generated.clips.find((c) => c.id === narration.id),
    narration,
  );
  assert.deepEqual(generated.assets, p.assets);
  assert.equal(generated.scenes.filter((s) => s.kind === "entry").length, 2);
  assert.equal(projectDuration(generated), 48);
  assert.equal(p.scenes.filter((s) => s.kind === "entry").length, 5);
  validateProject(generated);
});
test("timeline edits update actual timing and are immutable; invalid references and values fail", () => {
  const p = createProject(),
    original = p.clips[0]!;
  const edited = updateClip(p, original.id, {
    start: 2,
    duration: 9,
    scale: 1.4,
  });
  assert.equal(edited.clips[0]!.start, 2);
  assert.equal(p.clips[0]!.start, 0);
  assert.equal(edited.clips[0]!.scale, 1.4);
  assert.throws(() => updateClip(p, original.id, { duration: -1 }), /duration/);
  assert.throws(
    () => updateClip(p, original.id, { trackId: "missing" }),
    /Unknown track/,
  );
  assert.throws(
    () => validateProject({ ...p, schemaVersion: 2 }),
    /schemaVersion/,
  );
  assert.throws(() => validateProject({ ...p, width: NaN }), /width/);
  assert.throws(
    () =>
      validateProject({
        ...p,
        tracks: p.tracks.map((t) => ({ ...t, kind: "music" })),
      }),
    /six track/,
  );
  assert.throws(
    () => validateProject({ ...p, clips: [...p.clips, p.clips[0]] }),
    /Duplicate identifier/,
  );
});
test("replacing media remaps primary and secondary entry references and clips without losing timing", () => {
  let p = createProject("comparison");
  const old = imageAsset("old"),
    replacement = imageAsset("replacement");
  p.assets = [old];
  p.entries[0]!.mediaId = old.id;
  p.entries[0]!.secondaryMediaId = old.id;
  p = generateSequence(p);
  const before = p.clips.filter((c) => c.assetId === old.id);
  assert.equal(before.length, 2);
  const after = replaceAsset(p, old.id, replacement);
  assert.equal(after.entries[0]!.mediaId, replacement.id);
  assert.equal(after.entries[0]!.secondaryMediaId, replacement.id);
  assert.equal(
    after.clips.filter((c) => c.assetId === replacement.id).length,
    2,
  );
  assert.deepEqual(
    after.clips.map((c) => [c.id, c.start, c.duration]),
    p.clips.map((c) => [c.id, c.start, c.duration]),
  );
  assert.equal(p.assets[0]!.id, "old");
  assert.throws(
    () => replaceAsset(p, old.id, { ...replacement, kind: "audio" }),
    /Entry needs/,
  );
});
test("interpolation clamps endpoints, preserves easing, and camera effects are deterministic", () => {
  assert.equal(ease(-1, "linear"), 0);
  assert.equal(ease(2, "ease-in"), 1);
  assert.equal(ease(0.5, "ease-in-out"), 0.5);
  assert.ok(ease(0.5, "ease-out") > ease(0.5, "ease-in"));
  assert.equal(progressAt(2, 1, 2), 0.5);
  assert.equal(progressAt(0, 1, 0), 0);
  const base = defaultAnimation();
  for (const camera of [
    "none",
    "zoom-in",
    "zoom-out",
    "pan-x",
    "pan-y",
    "zoom-pan",
    "parallax",
    "shake",
  ] as Animation["camera"][]) {
    const a = { ...base, camera };
    const value = cameraTransform(a, 0.5, 5, 1280, 720);
    assert.deepEqual(value, cameraTransform(a, 0.5, 5, 1280, 720));
    assert.ok(Object.values(value).every(Number.isFinite));
    if (camera !== "none")
      assert.notDeepEqual(value, { x: 0, y: 0, scale: 1, rotation: 0 });
  }
  assert.notDeepEqual(
    cameraTransform({ ...base, focalX: 0 }, 3, 5, 1280, 720),
    cameraTransform({ ...base, focalX: 1 }, 3, 5, 1280, 720),
  );
});
test("content and text reveals expose real staged states including exit animation", () => {
  const a = defaultAnimation();
  assert.equal(revealState(a, 0, 5).opacity, 0);
  assert.equal(revealState(a, 2, 5).opacity, 1);
  assert.ok(revealState(a, 4.9, 5).opacity < 1);
  assert.equal(visibleText("one two three four", "words", 0.5), "one two");
  assert.equal(visibleText("abc def", "typewriter", 0.4), "abc");
  assert.equal(visibleText("a\nb\nc", "lines", 0.5), "a\nb");
  for (const reveal of [
    "fade",
    "slide",
    "scale",
    "blur",
    "mask",
    "character",
  ] as Animation["reveal"][]) {
    const s = revealState({ ...a, reveal }, 0.2, 5);
    assert.ok(Object.values(s).every(Number.isFinite));
    assert.notDeepEqual(s, revealState({ ...a, reveal }, 2, 5));
  }
});
test("render is deterministic, visual mute/solo/order are real and audio solo does not hide visuals", () => {
  const p = createProject();
  const baseline = hash(frame(p, 4.5));
  assert.equal(hash(frame(p, 4.5)), baseline);
  const narrationSolo = structuredClone(p);
  narrationSolo.tracks.find((t) => t.kind === "narration")!.solo = true;
  assert.equal(hash(frame(narrationSolo, 4.5)), baseline);
  const hidden = structuredClone(p);
  hidden.tracks.find((t) => t.kind === "media")!.muted = true;
  assert.notEqual(hash(frame(hidden, 4.5)), baseline);
  const reordered = structuredClone(p);
  reordered.tracks.push(reordered.tracks.shift()!);
  assert.notEqual(hash(frame(reordered, 4.5)), baseline);
  const solo = structuredClone(p);
  solo.tracks.find((t) => t.kind === "effects")!.solo = true;
  assert.notEqual(hash(frame(solo, 4.5)), baseline);
});
test("media clips prefer individually decoded frames over shared asset sources", () => {
  const p = createProject();
  const clip = p.clips.find((c) => c.trackId === "media" && c.entryId)!;
  clip.assetId = "image";
  const red = createCanvas(20, 20),
    blue = createCanvas(20, 20);
  red.getContext("2d").fillStyle = "red";
  red.getContext("2d").fillRect(0, 0, 20, 20);
  blue.getContext("2d").fillStyle = "blue";
  blue.getContext("2d").fillRect(0, 0, 20, 20);
  const shared = new Map([["image", red as unknown as CanvasImageSource]]);
  const distinct = new Map(shared);
  distinct.set(clip.id, blue as unknown as CanvasImageSource);
  assert.notEqual(hash(frame(p, 4.5, shared)), hash(frame(p, 4.5, distinct)));
});
test("every transition and typography mode renders distinct deterministic frames and portrait works", () => {
  const p = createProject();
  const states = new Set<string>();
  for (const transition of [
    "crossfade",
    "wipe",
    "zoom",
    "blur",
    "match",
    "flash",
  ] as Animation["transition"][]) {
    const v = structuredClone(p);
    for (const c of v.clips)
      c.animation = { ...c.animation, transition, reveal: "fade" };
    states.add(hash(frame(v, 3.2)));
  }
  assert.equal(states.size, 6);
  for (const text of [
    "words",
    "lines",
    "typewriter",
    "kinetic",
    "scale",
    "ranking",
  ] as Animation["text"][]) {
    const v = structuredClone(p);
    for (const c of v.clips) c.animation.text = text;
    assert.doesNotThrow(() => frame(v, 3.3));
  }
  for (const template of [
    "ranking",
    "analysis",
    "comparison",
  ] as TemplateId[]) {
    const portrait = createProject(template);
    portrait.width = 1080;
    portrait.height = 1920;
    assert.doesNotThrow(() => frame(portrait, 4.5));
  }
});
test("generated transitions have overlapping live clips and camera honors delay and easing", () => {
  const p = createProject("analysis");
  const scene = p.scenes[1]!;
  const active = p.clips.filter(
    (c) =>
      c.trackId === "media" &&
      c.start <= scene.start + 0.2 &&
      c.start + c.duration > scene.start + 0.2,
  );
  assert.equal(active.length, 2);
  const a = { ...defaultAnimation(), camera: "zoom-in" as const, delay: 1 };
  assert.equal(cameraTransform(a, 0.5, 5, 1280, 720).scale, 1);
  assert.ok(cameraTransform(a, 2, 5, 1280, 720).scale > 1);
  assert.notEqual(
    cameraTransform({ ...a, easing: "ease-in" }, 2, 5, 1280, 720).scale,
    cameraTransform({ ...a, easing: "ease-out" }, 2, 5, 1280, 720).scale,
  );
});
test("comparison categories and opponent are validated, preserved, and change rendered result", () => {
  const p = createProject("comparison"),
    e = p.entries[0]!;
  e.opponentName = "Custom challenger";
  e.categories = [
    { label: "Empathy", score: 1, comparisonScore: 99 },
    { label: "Wisdom", score: 5, comparisonScore: 95 },
  ];
  const validated = validateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(validated.entries[0]!.categories, e.categories);
  const before = hash(frame(p, 4.5));
  const changed = structuredClone(p);
  changed.entries[0]!.categories![0]!.score = 80;
  assert.notEqual(hash(frame(changed, 4.5)), before);
  const summary = p.scenes.find((s) => s.kind === "summary")!;
  const firstSummary = hash(frame(p, summary.start + 1.5));
  changed.entries[0]!.categories = [
    { label: "Empathy", score: 99, comparisonScore: 1 },
  ];
  assert.notEqual(hash(frame(changed, summary.start + 1.5)), firstSummary);
  changed.entries[0]!.categories![0]!.score = 101;
  assert.throws(() => validateProject(changed), /categories/);
});
test("comparison media role survives clip ID changes made by duplicate and split operations", () => {
  const p = createProject("comparison");
  const secondary = p.clips.find(
    (c) => c.entryId && c.mediaRole === "secondary",
  )!;
  assert.ok(secondary);
  const original = hash(frame(p, 4.5));
  secondary.id = "new-independent-clip-id";
  const valid = validateProject(p);
  assert.equal(
    valid.clips.find((c) => c.id === secondary.id)!.mediaRole,
    "secondary",
  );
  assert.equal(hash(frame(valid, 4.5)), original);
});
