import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  createCanvas,
  GlobalFonts,
  ImageData,
  loadImage,
} from "@napi-rs/canvas";
import { mixAudio, encodeWav, type PCM } from "../audio/mixer.js";
import { synthesizeMusic } from "../audio/music.js";
import { projectDuration, validateProject } from "../core/model.js";
import { renderFrame } from "../core/render.js";
import type { Asset, Clip, Project } from "../shared/types.js";
import {
  abortError,
  decodeAudio,
  probeMedia,
  resolveBinary,
  runMediaProcess,
} from "./media-tools.js";

export interface RenderOptions {
  outputPath: string;
  onProgress?: (progress: number, message: string) => void;
  signal?: AbortSignal;
  resolveAsset?: (asset: Asset) => string;
  width?: number;
  height?: number;
  fps?: number;
}

export function resolveLocalAsset(asset: Asset): string {
  if (asset.builtin) {
    const resources = (process as NodeJS.Process & { resourcesPath?: string })
      .resourcesPath;
    return join(
      process.env.KURO_RESOURCE_DIR ?? resources ?? process.cwd(),
      "public",
      "music",
      `${asset.id}.wav`,
    );
  }
  if (/^[a-z]+:\/\//i.test(asset.path))
    throw new Error(`Only local media is supported: ${asset.name}`);
  return isAbsolute(asset.path) ? asset.path : resolve(asset.path);
}

/** A decoder retains one output frame and bounded pipe chunks, never the entire video. */
class VideoDecoder {
  private process: ChildProcessWithoutNullStreams;
  private iterator: AsyncIterator<Buffer>;
  private pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private index = -1;
  private ended = false;
  private stderr = "";
  private failure?: Error;
  readonly canvas;
  private context;
  private onAbort = () => this.close();

  constructor(
    file: string,
    readonly start: number,
    readonly fps: number,
    width: number,
    height: number,
    private signal?: AbortSignal,
  ) {
    this.canvas = createCanvas(width, height);
    this.context = this.canvas.getContext("2d");
    this.process = spawn(
      resolveBinary("ffmpeg"),
      [
        "-v",
        "error",
        "-nostdin",
        "-threads",
        "1",
        "-ss",
        String(start),
        "-i",
        file,
        "-map",
        "0:v:0",
        "-an",
        "-sn",
        "-vf",
        `fps=${fps},scale=${width}:${height}`,
        "-threads",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "pipe:1",
      ],
      { windowsHide: true },
    );
    this.process.stdin.end();
    this.iterator = this.process.stdout[Symbol.asyncIterator]();
    this.process.stderr.on("data", (data) => {
      this.stderr = (this.stderr + data.toString()).slice(-2048);
    });
    this.process.on("error", (error) => {
      this.failure = error;
    });
    signal?.addEventListener("abort", this.onAbort, { once: true });
  }

  async frame(time: number) {
    if (this.signal?.aborted) throw abortError();
    const target = Math.max(
      0,
      Math.floor((time - this.start) * this.fps + 0.00001),
    );
    const size = this.canvas.width * this.canvas.height * 4;
    while (this.index < target && !this.ended) {
      const frame = Buffer.allocUnsafe(size);
      let offset = 0;
      while (offset < size) {
        if (!this.pending.length) {
          const next = await this.iterator.next();
          if (next.done) {
            this.ended = true;
            break;
          }
          this.pending = next.value;
        }
        const count = Math.min(size - offset, this.pending.length);
        this.pending.copy(frame, offset, 0, count);
        this.pending = this.pending.subarray(count);
        offset += count;
      }
      if (this.signal?.aborted) throw abortError();
      if (offset === size) {
        this.context.putImageData(
          new ImageData(
            new Uint8ClampedArray(
              frame.buffer,
              frame.byteOffset,
              frame.byteLength,
            ),
            this.canvas.width,
            this.canvas.height,
          ),
          0,
          0,
        );
        this.index++;
      }
    }
    if (this.failure) throw this.failure;
    if (this.index < 0)
      throw new Error(
        `Could not decode video frame: ${this.stderr || "source is empty or trim is beyond its end"}`,
      );
    return this.canvas;
  }

  close() {
    this.signal?.removeEventListener("abort", this.onAbort);
    this.process.kill("SIGKILL");
  }
}

function mediaTime(
  clip: Clip,
  asset: Asset,
  time: number,
  fps: number,
): number {
  const elapsed = Math.max(0, time - clip.start);
  const available = Math.max(1 / fps, asset.duration - clip.trimStart);
  return (
    clip.trimStart +
    (clip.loop
      ? elapsed % available
      : Math.min(elapsed, Math.max(0, available - 1 / fps)))
  );
}

export async function renderProject(
  input: Project,
  options: RenderOptions,
): Promise<{ outputPath: string; duration: number; frames: number }> {
  const project = validateProject(input);
  // Structured callers can assign entry media after generating placeholder clips.
  // Resolve the same fallbacks as the shared renderer before preloading/decoding.
  const mediaTrackIds = new Set(
    project.tracks
      .filter((track) => track.kind === "media")
      .map((track) => track.id),
  );
  const scenes = new Map(project.scenes.map((scene) => [scene.id, scene]));
  const entries = new Map(project.entries.map((entry) => [entry.id, entry]));
  project.clips = project.clips.map((clip) => {
    if (clip.assetId || !mediaTrackIds.has(clip.trackId)) return clip;
    const scene = scenes.get(clip.sceneId ?? "");
    if (
      scene?.kind === "intro" ||
      scene?.kind === "outro" ||
      scene?.kind === "summary"
    )
      return clip;
    const entry = entries.get(clip.entryId ?? scene?.entryId ?? "");
    const secondary =
      project.template === "comparison" &&
      scene?.kind === "entry" &&
      (clip.mediaRole === "secondary" ||
        (!clip.mediaRole && clip.id.endsWith("-secondary")));
    const assetId = secondary ? entry?.secondaryMediaId : entry?.mediaId;
    return assetId ? { ...clip, assetId } : clip;
  });
  const width = options.width ?? project.width,
    height = options.height ?? project.height,
    fps = options.fps ?? project.fps;
  if (
    ![width, height].every(
      (n) => Number.isInteger(n) && n >= 16 && n <= 4096 && n % 2 === 0,
    )
  )
    throw new Error(
      "Export dimensions must be even integers between 16 and 4096",
    );
  if (!Number.isInteger(fps) || fps < 1 || fps > 60)
    throw new Error("Export frame rate must be an integer between 1 and 60");
  const duration = projectDuration(project);
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("Project must contain a non-empty timeline");
  const frames = Math.ceil(duration * fps);
  const outputPath = resolve(options.outputPath);
  const checkAbort = () => {
    if (options.signal?.aborted) throw abortError();
  };
  const report = (value: number, message: string) =>
    options.onProgress?.(Math.max(0, Math.min(1, value)), message);
  checkAbort();
  await mkdir(dirname(outputPath), { recursive: true });
  const temporary = await mkdtemp(join(dirname(outputPath), ".kuro-render-"));
  const partial = join(temporary, "render.mp4");
  const decoders = new Map<
    string,
    { decoder: VideoDecoder; lastTime: number }
  >();
  let encoder: ReturnType<typeof spawn> | undefined;
  let encodingComplete: Promise<void> | undefined;
  const cancel = () => {
    encoder?.kill("SIGKILL");
    for (const { decoder } of decoders.values()) decoder.close();
  };
  options.signal?.addEventListener("abort", cancel, { once: true });
  try {
    report(0, "Preparing local media");
    const resources = (process as NodeJS.Process & { resourcesPath?: string })
      .resourcesPath;
    const resourceDir =
      process.env.KURO_RESOURCE_DIR ?? resources ?? process.cwd();
    const font = join(resourceDir, "public", "fonts", "DejaVuSans.ttf");
    if (existsSync(font)) GlobalFonts.registerFromPath(font, "DejaVu Sans");
    const boldFont = join(
      resourceDir,
      "public",
      "fonts",
      "DejaVuSans-Bold.ttf",
    );
    if (existsSync(boldFont))
      GlobalFonts.registerFromPath(boldFont, "DejaVu Sans");
    const media = new Map<string, CanvasImageSource>();
    const paths = new Map<string, string>();
    const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
    const usedIds = new Set(
      project.clips.filter((c) => !c.muted).map((c) => c.assetId),
    );
    for (const asset of project.assets.filter(
      (a) => usedIds.has(a.id) && a.kind !== "audio",
    )) {
      checkAbort();
      const file = options.resolveAsset?.(asset) ?? resolveLocalAsset(asset);
      paths.set(asset.id, file);
      if (asset.kind === "image")
        media.set(
          asset.id,
          (await loadImage(file)) as unknown as CanvasImageSource,
        );
      else {
        const info = await probeMedia(file, options.signal);
        if (info.kind !== "video")
          throw new Error(`${asset.name} is not a video`);
        assets.set(asset.id, { ...asset, ...info });
      }
    }
    const audioFile = join(temporary, "mix.wav");
    const withAudio = project.audio.mode !== "silent";
    if (withAudio) {
      report(0.03, "Mixing music and narration");
      const sources = new Map<string, PCM>();
      const audioTracks = project.tracks.filter(
        (t) => t.kind === "music" || t.kind === "narration",
      );
      const solo = audioTracks.some((t) => t.solo && !t.muted);
      const enabled = new Set(
        audioTracks
          .filter(
            (t) =>
              !t.muted &&
              (!solo || t.solo) &&
              (project.audio.mode === "music-narration" ||
                t.kind === project.audio.mode),
          )
          .map((t) => t.id),
      );
      for (const clip of project.clips.filter(
        (c) => enabled.has(c.trackId) && !c.muted && c.assetId,
      )) {
        if (sources.has(clip.assetId!)) continue;
        checkAbort();
        const asset = assets.get(clip.assetId!);
        if (!asset) throw new Error(`Missing audio asset: ${clip.assetId}`);
        const pcm = asset.builtin
          ? synthesizeMusic(asset.id)
          : await decodeAudio(
              options.resolveAsset?.(asset) ?? resolveLocalAsset(asset),
              options.signal,
            );
        sources.set(asset.id, pcm);
      }
      checkAbort();
      await writeFile(audioFile, encodeWav(mixAudio(project, sources)));
    }
    checkAbort();
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    // A portrait override should use the shared responsive portrait composition.
    const renderModel = { ...project, width, height };
    const args = [
      "-y",
      "-v",
      "error",
      "-nostdin",
      "-f",
      "rawvideo",
      "-pixel_format",
      "rgba",
      "-video_size",
      `${width}x${height}`,
      "-framerate",
      String(fps),
      "-i",
      "pipe:0",
    ];
    if (withAudio) args.push("-i", audioFile);
    args.push("-map", "0:v:0");
    if (withAudio)
      args.push(
        "-map",
        "1:a:0",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-af",
        "apad",
      );
    else args.push("-an");
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      project.export.quality === "draft" ? "ultrafast" : "veryfast",
      "-crf",
      project.export.quality === "high"
        ? "18"
        : project.export.quality === "draft"
          ? "26"
          : "21",
      "-pix_fmt",
      "yuv420p",
      "-threads",
      "2",
      "-t",
      String(frames / fps),
      "-movflags",
      "+faststart",
      partial,
    );
    encoder = spawn(resolveBinary("ffmpeg"), args, {
      windowsHide: true,
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    encoder.stderr!.on("data", (data) => {
      stderr = (stderr + data.toString()).slice(-8192);
    });
    encodingComplete = new Promise<void>((resolve, reject) => {
      encoder!.on("error", reject);
      encoder!.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(
              options.signal?.aborted
                ? abortError()
                : new Error(`Video encoding failed (${code}): ${stderr}`),
            ),
      );
    });
    void encodingComplete.catch(() => {});
    // EPIPE also arrives as a stream event; frame writes surface it through their callback.
    encoder.stdin!.on("error", () => {});
    const visualTracks = project.tracks.filter(
      (t) => t.kind !== "music" && t.kind !== "narration",
    );
    const visualSolo = visualTracks.some((t) => t.solo && !t.muted);
    const enabledVisual = new Set(
      visualTracks
        .filter((t) => !t.muted && (!visualSolo || t.solo))
        .map((t) => t.id),
    );
    for (let frame = 0; frame < frames; frame++) {
      checkAbort();
      const time = frame / fps;
      const active = project.clips.filter(
        (c) =>
          !c.muted &&
          enabledVisual.has(c.trackId) &&
          c.start <= time &&
          c.start + c.duration > time &&
          assets.get(c.assetId ?? "")?.kind === "video",
      );
      const activeIds = new Set(active.map((c) => c.id));
      for (const [id, state] of decoders)
        if (!activeIds.has(id)) {
          state.decoder.close();
          decoders.delete(id);
          media.delete(id);
        }
      for (const clip of active) {
        const asset = assets.get(clip.assetId!)!;
        const sourceTime = mediaTime(clip, asset, time, fps);
        let state = decoders.get(clip.id);
        if (state && sourceTime < state.lastTime - 0.00001) {
          state.decoder.close();
          decoders.delete(clip.id);
          state = undefined;
        }
        if (!state) {
          const ratio = Math.min(
            1,
            width / (asset.width || width),
            height / (asset.height || height),
          );
          state = {
            decoder: new VideoDecoder(
              paths.get(asset.id)!,
              sourceTime,
              fps,
              Math.max(1, Math.round((asset.width || width) * ratio)),
              Math.max(1, Math.round((asset.height || height) * ratio)),
              options.signal,
            ),
            lastTime: sourceTime,
          };
          decoders.set(clip.id, state);
        }
        const image = await state.decoder.frame(sourceTime);
        state.lastTime = sourceTime;
        media.set(asset.id, image as unknown as CanvasImageSource);
        media.set(clip.id, image as unknown as CanvasImageSource);
      }
      context.save();
      renderFrame(
        context as unknown as CanvasRenderingContext2D,
        renderModel,
        time,
        media,
      );
      context.restore();
      const pixels = context.getImageData(0, 0, width, height).data;
      await new Promise<void>((resolve, reject) =>
        encoder!.stdin!.write(pixels, (error) =>
          error ? reject(error) : resolve(),
        ),
      );
      if (frame % Math.max(1, Math.floor(fps / 2)) === 0)
        report(
          0.08 + 0.85 * ((frame + 1) / frames),
          `Rendering frame ${frame + 1} of ${frames}`,
        );
    }
    encoder.stdin!.end();
    report(0.95, "Finalizing MP4");
    await encodingComplete;
    checkAbort();
    const verified = JSON.parse(
      (
        await runMediaProcess(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            partial,
          ],
          { signal: options.signal },
        )
      ).toString(),
    );
    const video = verified.streams.find(
      (s: { codec_type: string }) => s.codec_type === "video",
    );
    const audio = verified.streams.find(
      (s: { codec_type: string }) => s.codec_type === "audio",
    );
    const [rateNumerator, rateDenominator] = String(
      video?.avg_frame_rate ?? "0/1",
    )
      .split("/")
      .map(Number);
    if (
      !video ||
      video.codec_name !== "h264" ||
      video.pix_fmt !== "yuv420p" ||
      video.width !== width ||
      video.height !== height ||
      rateNumerator / rateDenominator !== fps ||
      Number(video.nb_frames) !== frames ||
      (withAudio && audio?.codec_name !== "aac") ||
      (!withAudio && audio) ||
      Math.abs(Number(verified.format.duration) - frames / fps) > 0.15
    )
      throw new Error("Encoded MP4 failed stream or duration verification");
    checkAbort();
    await rename(partial, outputPath);
    report(1, "Export complete");
    return { outputPath, duration: frames / fps, frames };
  } catch (error) {
    if (options.signal?.aborted) throw abortError();
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", cancel);
    cancel();
    // Windows will not remove a temporary file while FFmpeg still has it open.
    await encodingComplete?.catch(() => {});
    await rm(temporary, { recursive: true, force: true });
  }
}
