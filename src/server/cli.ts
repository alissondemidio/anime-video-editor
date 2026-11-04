#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createProject, validateProject } from "../core/model.js";
import type { AudioMode, TemplateId } from "../shared/types.js";
import { renderProject, resolveLocalAsset } from "./render.js";

const HELP = `Kuro Studio — local video renderer

Create a project:
  npm run render -- --create ranking --output project.json
Render a project:
  npm run render -- --project project.json --output video.mp4

Options:
  --create ranking|analysis|comparison  Create editable project JSON
  --project FILE                       Read project JSON
  --output FILE                        Destination JSON or MP4
  --audio music|narration|music-narration|silent
  --duration SECONDS                   Trim output timeline for a quick render
  --width PIXELS --height PIXELS       Override export size (even dimensions)
  --fps NUMBER                        Override export frame rate (default 30)
  --help                              Show this help

Relative media paths resolve beside the project JSON. FFmpeg runs locally.
Set FFMPEG_PATH and FFPROBE_PATH to override the installed/bundled binaries.
Ctrl+C cancels rendering and removes partial output.
`;

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      create: { type: "string" },
      project: { type: "string" },
      output: { type: "string" },
      audio: { type: "string" },
      duration: { type: "string" },
      width: { type: "string" },
      height: { type: "string" },
      fps: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (
    !values.output ||
    (!values.create && !values.project) ||
    (values.create && values.project)
  )
    throw new Error(
      "Provide --output and exactly one of --create or --project. Use --help for examples.",
    );
  const numeric = (key: "width" | "height" | "fps" | "duration") => {
    if (values[key] === undefined) return undefined;
    const number = Number(values[key]);
    if (!Number.isFinite(number) || number <= 0)
      throw new Error(`--${key} must be a positive number`);
    return number;
  };
  if (
    values.create &&
    !["ranking", "analysis", "comparison"].includes(values.create)
  )
    throw new Error(
      "Unknown template; choose ranking, analysis, or comparison",
    );
  const project = values.create
    ? createProject(values.create as TemplateId)
    : validateProject(
        JSON.parse(await readFile(resolve(values.project!), "utf8")),
      );
  if (values.audio) {
    if (
      !["music", "narration", "music-narration", "silent"].includes(
        values.audio,
      )
    )
      throw new Error("Unknown audio mode");
    project.audio.mode = values.audio as AudioMode;
  }
  const duration = numeric("duration");
  if (duration !== undefined) {
    project.clips = project.clips
      .filter((c) => c.start < duration)
      .map((c) => ({
        ...c,
        duration: Math.min(c.duration, duration - c.start),
      }));
    project.scenes = project.scenes
      .filter((s) => s.start < duration)
      .map((s) => ({
        ...s,
        duration: Math.min(s.duration, duration - s.start),
      }));
  }
  if (values.create) {
    if (numeric("width")) project.width = numeric("width")!;
    if (numeric("height")) project.height = numeric("height")!;
    validateProject(project);
    await mkdir(dirname(resolve(values.output)), { recursive: true });
    await writeFile(
      resolve(values.output),
      JSON.stringify(project, null, 2) + "\n",
    );
    process.stdout.write(`Created ${resolve(values.output)}\n`);
    return;
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const result = await renderProject(project, {
      outputPath: values.output,
      signal: controller.signal,
      width: numeric("width"),
      height: numeric("height"),
      fps: numeric("fps"),
      resolveAsset: (asset) =>
        asset.builtin
          ? resolveLocalAsset(asset)
          : isAbsolute(asset.path)
            ? asset.path
            : resolve(dirname(resolve(values.project!)), asset.path),
      onProgress: (progress, message) =>
        process.stderr.write(`${Math.round(progress * 100)}% ${message}\n`),
    });
    process.stdout.write(JSON.stringify(result) + "\n");
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

if (
  process.argv[1] &&
  (import.meta.url ?? pathToFileURL(resolve(__filename)).href) ===
    pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = error?.name === "AbortError" ? 130 : 1;
  });
}
