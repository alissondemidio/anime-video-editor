import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { createProject, defaultAnimation } from "../src/core/model.js";
import { renderProject } from "../src/server/render.js";
import {
  decodeAudio,
  probeMedia,
  readWaveform,
  runMediaProcess,
} from "../src/server/media-tools.js";
import { encodeWav, type PCM } from "../src/audio/mixer.js";
import { main } from "../src/server/cli.js";
import type { Asset, AudioMode, Clip, Project } from "../src/shared/types.js";

function tone(frequency: number): PCM {
  return {
    sampleRate: 48000,
    channels: [
      Float32Array.from(
        { length: 48000 },
        (_, i) => 0.18 * Math.sin((2 * Math.PI * frequency * i) / 48000),
      ),
    ],
  };
}
function clip(trackId: string, assetId: string, duration = 0.8): Clip {
  return {
    id: `${trackId}-fixture`,
    trackId,
    assetId,
    label: "Fixture",
    start: 0,
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
function shortProject(duration = 0.8): Project {
  const project = createProject("ranking");
  project.scenes = [{ ...project.scenes[0]!, duration }];
  project.clips = project.clips
    .filter((c) => c.sceneId === project.scenes[0]!.id)
    .map((c) => ({ ...c, duration }));
  project.width = 320;
  project.height = 180;
  project.export.quality = "draft";
  return project;
}
function magnitude(
  pcm: PCM,
  frequency: number,
  start = 0.35,
  end = 0.65,
): number {
  const channel = pcm.channels[0]!;
  let real = 0,
    imaginary = 0;
  const begin = Math.floor(start * pcm.sampleRate),
    finish = Math.floor(end * pcm.sampleRate);
  for (let i = begin; i < finish; i++) {
    const phase = (2 * Math.PI * frequency * i) / pcm.sampleRate;
    real += channel[i]! * Math.cos(phase);
    imaginary += channel[i]! * Math.sin(phase);
  }
  return Math.hypot(real, imaginary) / (finish - begin);
}

test(
  "real MP4 export streams video, preserves visuals across four audio modes, and verifies codecs and audio timing",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "kuro-render-test-"));
    try {
      const source = join(directory, "source.mp4");
      await runMediaProcess("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=96x64:rate=30",
        "-t",
        "0.5",
        "-c:v",
        "libx264",
        "-threads",
        "1",
        "-pix_fmt",
        "yuv420p",
        source,
      ]);
      const project = shortProject();
      for (const [id, frequency] of [
        ["music", 330],
        ["narration", 880],
      ] as const) {
        const file = join(directory, `${id}.wav`);
        await writeFile(file, encodeWav(tone(frequency)));
        project.assets.push({
          id,
          name: id,
          path: file,
          url: "",
          kind: "audio",
          mime: "audio/wav",
          duration: 1,
          size: 0,
        });
        project.clips.push({
          ...clip(id, id),
          ...(id === "narration" ? { start: 0.25, duration: 0.55 } : {}),
        });
      }
      const video: Asset = {
        id: "video",
        name: "Video fixture",
        kind: "video",
        path: source,
        url: "",
        mime: "video/mp4",
        duration: 0.5,
        width: 96,
        height: 64,
        size: 0,
      };
      project.assets.push(video);
      const mediaClip = project.clips.find((c) => c.trackId === "media")!;
      mediaClip.assetId = video.id;
      mediaClip.trimStart = 0.1;
      mediaClip.loop = true;
      assert.equal((await probeMedia(source)).kind, "video");
      assert.equal((await readWaveform(project.assets[0]!.path)).length, 180);
      const hashes: string[] = [];
      for (const mode of [
        "music",
        "narration",
        "music-narration",
        "silent",
      ] as AudioMode[]) {
        project.audio.mode = mode;
        const progress: number[] = [];
        const output = join(directory, `${mode}.mp4`);
        const result = await renderProject(project, {
          outputPath: output,
          onProgress: (value) => progress.push(value),
        });
        assert.equal(result.frames, 24);
        assert.equal(result.duration, 0.8);
        assert.equal(progress.at(-1), 1);
        assert(
          progress.every(
            (value, index) => index === 0 || value >= progress[index - 1]!,
          ),
        );
        const metadata = JSON.parse(
          (
            await runMediaProcess("ffprobe", [
              "-v",
              "error",
              "-show_streams",
              "-show_format",
              "-of",
              "json",
              output,
            ])
          ).toString(),
        );
        const v = metadata.streams.find(
          (s: { codec_type: string }) => s.codec_type === "video",
        );
        const a = metadata.streams.find(
          (s: { codec_type: string }) => s.codec_type === "audio",
        );
        assert.equal(v.codec_name, "h264");
        assert.equal(v.pix_fmt, "yuv420p");
        assert.equal(v.width, 320);
        assert.equal(v.height, 180);
        assert.equal(v.avg_frame_rate, "30/1");
        assert(Math.abs(Number(metadata.format.duration) - 0.8) < 0.06);
        assert.equal(a?.codec_name, mode === "silent" ? undefined : "aac");
        if (a) {
          assert.equal(Number(a.sample_rate), 48000);
          assert(Math.abs(Number(a.duration) - 0.8) < 0.06);
          const decoded = await decodeAudio(output);
          const music = magnitude(decoded, 330),
            speech = magnitude(decoded, 880);
          if (mode === "music") {
            assert(music > 0.03);
            assert(speech < 0.001);
          }
          if (mode === "narration") {
            assert(speech > 0.03);
            assert(music < 0.001);
            assert(magnitude(decoded, 880, 0.04, 0.18) < 0.001);
          }
          if (mode === "music-narration") {
            assert(music > 0.005);
            assert(speech > 0.03);
          }
        }
        const digest = await runMediaProcess("ffmpeg", [
          "-v",
          "error",
          "-i",
          output,
          "-map",
          "0:v:0",
          "-f",
          "framemd5",
          "pipe:1",
        ]);
        hashes.push(digest.toString());
      }
      assert(
        hashes.every((hash) => hash === hashes[0]),
        "Audio mode must not change visual frames",
      );
      assert.deepEqual(
        (await readdir(directory)).filter((name) =>
          name.startsWith(".kuro-render-"),
        ),
        [],
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "entry image and secondary video fallbacks match explicit clip assignments in real exports",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "kuro-entry-media-test-"));
    try {
      const imagePath = join(directory, "image.png");
      const canvas = createCanvas(96, 64);
      const context = canvas.getContext("2d");
      context.fillStyle = "#22ee88";
      context.fillRect(0, 0, 96, 64);
      await writeFile(imagePath, canvas.toBuffer("image/png"));
      const videoPath = join(directory, "video.mp4");
      await runMediaProcess("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=96x64:rate=30",
        "-t",
        "0.5",
        "-c:v",
        "libx264",
        "-threads",
        "1",
        "-pix_fmt",
        "yuv420p",
        videoPath,
      ]);
      const project = createProject("comparison");
      const scene = project.scenes.find((scene) => scene.kind === "entry")!;
      project.scenes = [{ ...scene, start: 0, duration: 0.4 }];
      project.clips = project.clips
        .filter((c) => c.sceneId === scene.id)
        .map((c) => ({
          ...c,
          start: 0,
          duration: 0.4,
          animation: { ...c.animation, duration: 0.05 },
        }));
      project.width = 320;
      project.height = 180;
      project.audio.mode = "silent";
      project.export.quality = "draft";
      project.assets = [
        {
          id: "image",
          name: "Entry image",
          kind: "image",
          path: imagePath,
          url: "",
          mime: "image/png",
          duration: 0,
          width: 96,
          height: 64,
          size: 0,
        },
        {
          id: "video",
          name: "Entry video",
          kind: "video",
          path: videoPath,
          url: "",
          mime: "video/mp4",
          duration: 0.5,
          width: 96,
          height: 64,
          size: 0,
        },
      ];
      const entry = project.entries.find(
        (entry) => entry.id === scene.entryId,
      )!;
      entry.mediaId = "image";
      entry.secondaryMediaId = "video";
      const mediaClips = project.clips.filter((c) => c.trackId === "media");
      assert.equal(mediaClips.length, 2);
      assert(mediaClips.every((c) => !c.assetId));
      const digest = async (filename: string) =>
        (
          await runMediaProcess("ffmpeg", [
            "-v",
            "error",
            "-i",
            filename,
            "-map",
            "0:v:0",
            "-f",
            "framemd5",
            "pipe:1",
          ])
        ).toString();
      const fallback = join(directory, "fallback.mp4");
      await renderProject(project, { outputPath: fallback });
      assert(
        mediaClips.every((c) => !c.assetId),
        "Rendering must not mutate caller clips",
      );
      for (const c of mediaClips)
        c.assetId = c.mediaRole === "secondary" ? "video" : "image";
      const explicit = join(directory, "explicit.mp4");
      await renderProject(project, { outputPath: explicit });
      assert.equal(await digest(fallback), await digest(explicit));
      // Establish that matching outputs actually include media rather than placeholders.
      for (const c of mediaClips) delete c.assetId;
      delete entry.mediaId;
      delete entry.secondaryMediaId;
      const placeholder = join(directory, "placeholder.mp4");
      await renderProject(project, { outputPath: placeholder });
      assert.notEqual(await digest(fallback), await digest(placeholder));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "renders all required output orientations and dimensions",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "kuro-resolution-test-"));
    try {
      const project = shortProject(0.1);
      project.audio.mode = "silent";
      for (const [width, height] of [
        [1280, 720],
        [1920, 1080],
        [1080, 1920],
      ]) {
        const result = await renderProject(project, {
          outputPath: join(directory, `${width}.mp4`),
          width,
          height,
        });
        const metadata = await probeMedia(result.outputPath);
        assert.equal(metadata.width, width);
        assert.equal(metadata.height, height);
        assert.equal(result.frames, 3);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "cancellation and missing media errors clean partials and preserve existing exports",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "kuro-cancel-test-"));
    try {
      const project = shortProject(2);
      project.audio.mode = "silent";
      const output = join(directory, "keep.mp4");
      await writeFile(output, "existing output");
      const controller = new AbortController();
      await assert.rejects(
        renderProject(project, {
          outputPath: output,
          signal: controller.signal,
          onProgress: (progress) => {
            if (progress > 0.08) controller.abort();
          },
        }),
        { name: "AbortError" },
      );
      assert.equal(await readFile(output, "utf8"), "existing output");
      assert.deepEqual(await readdir(directory), ["keep.mp4"]);
      project.assets.push({
        id: "missing",
        name: "Missing",
        path: join(directory, "missing.mp4"),
        url: "",
        kind: "video",
        mime: "video/mp4",
        duration: 1,
        size: 0,
      });
      project.clips.find((c) => c.trackId === "media")!.assetId = "missing";
      await assert.rejects(
        renderProject(project, { outputPath: output }),
        /ffprobe failed/,
      );
      assert.deepEqual(await readdir(directory), ["keep.mp4"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "CLI creates editable JSON and renders relative media paths",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "kuro-cli-test-"));
    try {
      const json = join(directory, "project.json");
      await main([
        "--create",
        "comparison",
        "--output",
        json,
        "--duration",
        ".1",
      ]);
      const project = JSON.parse(await readFile(json, "utf8")) as Project;
      assert.equal(project.template, "comparison");
      await writeFile(join(directory, "tone.wav"), encodeWav(tone(440)));
      project.assets.push({
        id: "tone",
        name: "Tone",
        kind: "audio",
        path: "tone.wav",
        url: "",
        mime: "audio/wav",
        duration: 1,
        size: 0,
      });
      project.clips.push(clip("music", "tone", 0.1));
      await writeFile(json, JSON.stringify(project));
      const output = join(directory, "cli.mp4");
      await main([
        "--project",
        json,
        "--output",
        output,
        "--audio",
        "music",
        "--width",
        "320",
        "--height",
        "180",
      ]);
      assert.equal((await probeMedia(output)).kind, "video");
      await assert.rejects(
        main(["--create", "wrong", "--output", json]),
        /Unknown template/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
