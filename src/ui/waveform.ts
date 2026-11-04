import type { Asset, Clip } from "../shared/types.js";

/** Rebin imported source peaks onto the clip's visible time range.
 * Looping repeats only the source after trimStart, matching the audio mixer.
 * A non-looping source ends in actual silence rather than stretched peaks.
 */
export function clipWaveform(
  asset: Pick<Asset, "duration" | "waveform"> | undefined,
  clip: Pick<Clip, "trimStart" | "duration" | "loop">,
  bins = 100,
): number[] {
  if (!asset?.waveform?.length || !Number.isFinite(bins) || bins < 1) return [];
  const peaks = asset.waveform;
  const count = Math.min(1000, Math.floor(bins));
  const sourceDuration = asset.duration;
  const trim = Math.max(0, clip.trimStart);
  const usable = sourceDuration - trim;
  if (usable <= 0 || clip.duration <= 0) return Array(count).fill(0);
  const maximum = (start: number, end: number): number => {
    if (start >= sourceDuration || end <= start) return 0;
    const first = Math.max(
      0,
      Math.floor((start / sourceDuration) * peaks.length),
    );
    const last = Math.min(
      peaks.length,
      Math.ceil((end / sourceDuration) * peaks.length),
    );
    let peak = 0;
    for (let i = first; i < last; i++)
      peak = Math.max(peak, Math.abs(peaks[i]!));
    return Math.min(1, peak);
  };
  const span = clip.duration / count;
  return Array.from({ length: count }, (_, i) => {
    if (!clip.loop)
      return maximum(
        trim + i * span,
        Math.min(sourceDuration, trim + (i + 1) * span),
      );
    if (span >= usable) return maximum(trim, sourceDuration);
    const start = trim + ((i * span) % usable);
    const end = start + span;
    return end <= sourceDuration
      ? maximum(start, end)
      : Math.max(
          maximum(start, sourceDuration),
          maximum(trim, trim + end - sourceDuration),
        );
  });
}
