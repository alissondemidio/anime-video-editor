import type { Clip, Project } from "../shared/types.js";
import { projectDuration } from "../core/model.js";

/** Uncompressed, planar linear PCM; all channels have the same frame count. */
export interface PCM {
  sampleRate: number;
  channels: Float32Array[];
}
export type DuckingSettings = Project["audio"]["ducking"];
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

export function audioDuration(project: Project): number {
  return projectDuration(project);
}

/** Seconds relative to the clip's timeline start. Shared by offline and preview mixing. */
export function clipEnvelope(
  clip: Pick<Clip, "duration" | "fadeIn" | "fadeOut">,
  localTime: number,
): number {
  if (localTime < 0 || localTime >= clip.duration) return 0;
  const fadeIn = clip.fadeIn > 0 ? clamp(localTime / clip.fadeIn, 0, 1) : 1;
  const fadeOut =
    clip.fadeOut > 0
      ? clamp((clip.duration - localTime) / clip.fadeOut, 0, 1)
      : 1;
  return Math.min(fadeIn, fadeOut);
}

/** RMS speech activity (including actual silences), followed by a causal gain envelope.
 * Strength is a fractional reduction, e.g. .75 ducks music by 12 dB. Attack/release
 * are time constants in seconds. Stereo power is combined without phase cancellation.
 */
export function duckingEnvelope(
  narration: PCM,
  settings: DuckingSettings,
): Float32Array {
  const length = narration.channels[0]?.length ?? 0;
  const gains = new Float32Array(length);
  if (!settings.enabled) {
    gains.fill(1);
    return gains;
  }
  const attack = Math.exp(
    -1 / (Math.max(0.001, settings.attack) * narration.sampleRate),
  );
  const release = Math.exp(
    -1 / (Math.max(0.001, settings.release) * narration.sampleRate),
  );
  const detector = Math.exp(-1 / (0.005 * narration.sampleRate));
  const strength = clamp(settings.strength, 0, 1);
  let power = 0,
    gain = 1;
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of narration.channels) sum += channel[i]! ** 2;
    power =
      detector * power + ((1 - detector) * sum) / narration.channels.length;
    const db = 10 * Math.log10(Math.max(1e-12, power));
    const activity = clamp((db + 42) / 20, 0, 1);
    const target = 1 - strength * activity;
    const coefficient = target < gain ? attack : release;
    gain = coefficient * gain + (1 - coefficient) * target;
    gains[i] = gain;
  }
  return gains;
}

function validatePCM(pcm: PCM): void {
  if (
    !Number.isFinite(pcm.sampleRate) ||
    pcm.sampleRate <= 0 ||
    !pcm.channels.length ||
    pcm.channels.some((channel) => channel.length !== pcm.channels[0]!.length)
  ) {
    throw new Error(
      "Invalid PCM: provide a sample rate and equally sized audio channels.",
    );
  }
}

export function mixAudio(
  project: Project,
  sources: Map<string, PCM>,
  sampleRate = 48000,
): PCM {
  if (!Number.isFinite(sampleRate) || sampleRate < 1)
    throw new Error("Invalid output sample rate.");
  const length = Math.ceil(audioDuration(project) * sampleRate);
  const music = [new Float32Array(length), new Float32Array(length)];
  const narration = [new Float32Array(length), new Float32Array(length)];
  const mode = project.audio.mode;
  if (mode === "silent") return { sampleRate, channels: music };
  const tracks = project.tracks.filter(
    (track) => track.kind === "music" || track.kind === "narration",
  );
  const solo = tracks.some((track) => track.solo && !track.muted);
  for (const track of tracks) {
    if (
      track.muted ||
      (solo && !track.solo) ||
      (mode === "music" && track.kind !== "music") ||
      (mode === "narration" && track.kind !== "narration")
    )
      continue;
    const target = track.kind === "music" ? music : narration;
    for (const clip of project.clips) {
      if (
        clip.trackId !== track.id ||
        clip.muted ||
        !clip.assetId ||
        clip.duration <= 0
      )
        continue;
      const source = sources.get(clip.assetId);
      if (!source) continue;
      validatePCM(source);
      const sourceLength = source.channels[0]!.length;
      const trimFrame = Math.max(0, clip.trimStart * source.sampleRate);
      const usableFrames = sourceLength - trimFrame;
      if (usableFrames <= 0) continue;
      let normalize = 1;
      if (clip.normalize) {
        let peak = 0;
        const last = clip.loop
          ? sourceLength
          : Math.min(
              sourceLength,
              Math.ceil(trimFrame + clip.duration * source.sampleRate),
            );
        for (const channel of source.channels) {
          for (let i = Math.floor(trimFrame); i < last; i++)
            peak = Math.max(peak, Math.abs(channel[i]!));
        }
        if (peak > 1e-8) normalize = 0.89125094 / peak; // -1 dBFS peak normalization.
      }
      const gain =
        Math.max(0, clip.volume) * Math.max(0, track.volume) * normalize;
      const start = Math.max(0, Math.ceil(clip.start * sampleRate));
      const end = Math.min(
        length,
        Math.ceil((clip.start + clip.duration) * sampleRate),
      );
      for (let i = start; i < end; i++) {
        const localTime = i / sampleRate - clip.start;
        let offset = localTime * source.sampleRate;
        if (clip.loop) offset %= usableFrames;
        else if (offset >= usableFrames) break;
        const position = trimFrame + offset;
        const first = Math.floor(position);
        const fraction = position - first;
        const second =
          first + 1 < sourceLength
            ? first + 1
            : clip.loop
              ? Math.floor(trimFrame)
              : first;
        const volume = gain * clipEnvelope(clip, localTime);
        for (let channel = 0; channel < 2; channel++) {
          const input =
            source.channels[Math.min(channel, source.channels.length - 1)]!;
          const value =
            input[first]! + (input[second]! - input[first]!) * fraction;
          target[channel]![i]! += (Number.isFinite(value) ? value : 0) * volume;
        }
      }
    }
  }
  // Music-only exports are not ducked by narration that isn't audible in that mode.
  const duck =
    mode === "music-narration"
      ? duckingEnvelope(
          { sampleRate, channels: narration },
          project.audio.ducking,
        )
      : null;
  let peak = 0;
  for (let channel = 0; channel < 2; channel++) {
    for (let i = 0; i < length; i++) {
      music[channel]![i] =
        music[channel]![i]! * (duck?.[i] ?? 1) + narration[channel]![i]!;
      peak = Math.max(peak, Math.abs(music[channel]![i]!));
    }
  }
  // Transparent whole-program attenuation prevents digital clipping without pumping.
  if (peak > 0.98)
    for (const channel of music)
      for (let i = 0; i < length; i++) channel[i]! *= 0.98 / peak;
  return { sampleRate, channels: music };
}

/** Peak bins preserve brief transients and work for mono, stereo, or multichannel input. */
export function waveform(pcm: PCM, bins = 160): number[] {
  validatePCM(pcm);
  bins = Math.max(1, Math.min(10000, Math.floor(bins)));
  const length = pcm.channels[0]!.length;
  return Array.from({ length: bins }, (_, bin) => {
    let peak = 0;
    const begin = Math.floor((bin * length) / bins);
    const end = Math.floor(((bin + 1) * length) / bins);
    for (const channel of pcm.channels)
      for (let i = begin; i < end; i++)
        peak = Math.max(peak, Math.abs(channel[i]!));
    return clamp(peak, 0, 1);
  });
}

/** Standard interleaved signed 16-bit little-endian WAV, usable without FFmpeg. */
export function encodeWav(pcm: PCM): Uint8Array {
  validatePCM(pcm);
  const channels = pcm.channels.length;
  const length = pcm.channels[0]!.length;
  const bytes = length * channels * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, pcm.sampleRate, true);
  view.setUint32(28, pcm.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, bytes, true);
  let offset = 44;
  for (let i = 0; i < length; i++)
    for (const channel of pcm.channels) {
      const sample = clamp(
        Number.isFinite(channel[i]) ? channel[i]! : 0,
        -1,
        1,
      );
      view.setInt16(
        offset,
        Math.round(sample * (sample < 0 ? 32768 : 32767)),
        true,
      );
      offset += 2;
    }
  return new Uint8Array(buffer);
}
