import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { extname } from "node:path";
import { waveform, type PCM } from "../audio/mixer.js";

const require = createRequire(import.meta.url ?? __filename);
const binaries = new Map<string, string>();
/** Environment overrides, installed binaries, then bundled Windows-compatible binaries. */
export function resolveBinary(name: "ffmpeg" | "ffprobe"): string {
  const override = process.env[`${name.toUpperCase()}_PATH`];
  if (override) return override;
  const cached = binaries.get(name);
  if (cached) return cached;
  let executable: string = name;
  if (
    spawnSync(name, ["-version"], { stdio: "ignore", windowsHide: true })
      .status !== 0
  ) {
    try {
      const bundled = require(`${name}-static`);
      executable = name === "ffmpeg" ? bundled : bundled.path;
      // Electron binaries are executable only outside the asar archive.
      executable = executable.replace(
        /app\.asar([/\\])/,
        "app.asar.unpacked$1",
      );
    } catch {
      throw new Error(
        `${name} is unavailable. Install FFmpeg or set ${name.toUpperCase()}_PATH.`,
      );
    }
  }
  binaries.set(name, executable);
  return executable;
}

export function abortError(): Error {
  const error = new Error("Export cancelled");
  error.name = "AbortError";
  return error;
}

export async function runMediaProcess(
  name: "ffmpeg" | "ffprobe",
  args: string[],
  options: { signal?: AbortSignal; maxBytes?: number } = {},
): Promise<Buffer> {
  if (options.signal?.aborted) throw abortError();
  return new Promise((resolve, reject) => {
    const process = spawn(resolveBinary(name), args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let length = 0;
    let stderr = "";
    let failure: Error | undefined;
    const cancel = () => {
      failure = abortError();
      process.kill("SIGKILL");
    };
    options.signal?.addEventListener("abort", cancel, { once: true });
    process.stdout.on("data", (data: Buffer) => {
      length += data.length;
      if (length > (options.maxBytes ?? 16 * 1024 * 1024)) {
        failure = new Error(
          `${name} output exceeded the supported memory budget`,
        );
        process.kill("SIGKILL");
      } else chunks.push(data);
    });
    process.stderr.on("data", (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-8192);
    });
    process.on("error", (error) => {
      failure = error;
    });
    process.on("close", (code) => {
      options.signal?.removeEventListener("abort", cancel);
      if (failure) reject(failure);
      else if (code !== 0)
        reject(new Error(`${name} failed (${code}): ${stderr.trim()}`));
      else resolve(Buffer.concat(chunks, length));
    });
  });
}

export interface ProbeResult {
  duration: number;
  width?: number;
  height?: number;
  kind: "image" | "video" | "audio";
  mime: string;
}

export async function probeMedia(
  filePath: string,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const result = JSON.parse(
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
          filePath,
        ],
        { signal },
      )
    ).toString(),
  );
  const video = result.streams?.find(
    (stream: { codec_type: string; disposition?: { attached_pic?: number } }) =>
      stream.codec_type === "video" && !stream.disposition?.attached_pic,
  );
  const audio = result.streams?.find(
    (stream: { codec_type: string }) => stream.codec_type === "audio",
  );
  const extension = extname(filePath).toLowerCase();
  const isImage =
    !!video &&
    ([".png", ".jpg", ".jpeg", ".webp", ".bmp"].includes(extension) ||
      /image2|png_pipe|jpeg_pipe|webp_pipe/.test(
        result.format?.format_name ?? "",
      ));
  if (!video && !audio)
    throw new Error("File contains no supported image, video, or audio stream");
  const kind = isImage ? "image" : video ? "video" : "audio";
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
  };
  const duration = isImage
    ? 0
    : Number(
        result.format?.duration ?? video?.duration ?? audio?.duration ?? 0,
      );
  return {
    duration: Number.isFinite(duration) ? duration : 0,
    width: video?.width,
    height: video?.height,
    kind,
    mime: mimeTypes[extension] ?? `${kind}/octet-stream`,
  };
}

export async function decodeAudio(
  filePath: string,
  signal?: AbortSignal,
): Promise<PCM> {
  const bytes = await runMediaProcess(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-i",
      filePath,
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-f",
      "f32le",
      "pipe:1",
    ],
    { signal, maxBytes: 512 * 1024 * 1024 },
  );
  const count = Math.floor(bytes.length / 8);
  const channels = [new Float32Array(count), new Float32Array(count)];
  for (let i = 0; i < count; i++) {
    channels[0][i] = bytes.readFloatLE(i * 8);
    channels[1][i] = bytes.readFloatLE(i * 8 + 4);
  }
  return { sampleRate: 48000, channels };
}

export async function readWaveform(filePath: string): Promise<number[]> {
  return waveform(await decodeAudio(filePath), 180);
}
