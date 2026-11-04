import type { Animation, Clip, Easing } from "../shared/types.js";
export const clamp = (value: number, min = 0, max = 1): number =>
  Math.max(min, Math.min(max, value));
export const lerp = (from: number, to: number, progress: number): number =>
  from + (to - from) * progress;
export function ease(progress: number, easing: Easing = "ease-out"): number {
  const t = clamp(progress);
  switch (easing) {
    case "linear":
      return t;
    case "ease-in":
      return t * t * t;
    case "ease-out":
      return 1 - (1 - t) ** 3;
    case "ease-in-out":
      return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    case "back":
      return 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
  }
}
export function progressAt(
  time: number,
  start: number,
  duration: number,
  easing: Easing = "linear",
): number {
  return ease(
    duration <= 0 ? (time >= start ? 1 : 0) : (time - start) / duration,
    easing,
  );
}
export function cameraTransform(
  animation: Animation,
  time: number,
  duration: number,
  width: number,
  height: number,
): {
  x: number;
  y: number;
  scale: number;
  rotation: number;
} {
  const t = ease(
      (time - animation.delay) / Math.max(0.001, duration - animation.delay),
      animation.easing,
    ),
    i = animation.intensity;
  let x = 0,
    y = 0,
    scale = 1,
    rotation = 0;
  switch (animation.camera) {
    case "zoom-in":
      scale = 1 + 0.15 * t * i;
      break;
    case "zoom-out":
      scale = 1 + 0.15 * (1 - t) * i;
      break;
    case "pan-x":
      scale = 1 + 0.12 * i;
      x = (t - 0.5) * width * 0.09 * i;
      break;
    case "pan-y":
      scale = 1 + 0.12 * i;
      y = (t - 0.5) * height * 0.09 * i;
      break;
    case "zoom-pan":
      scale = 1 + 0.08 * i + 0.12 * t * i;
      x = (t - 0.5) * width * 0.05 * i;
      y = (0.5 - t) * height * 0.025 * i;
      break;
    case "parallax":
      scale = 1 + 0.08 * i;
      x = Math.sin(t * Math.PI) * width * 0.03 * i;
      y = (t - 0.5) * height * 0.02 * i;
      break;
    case "shake":
      scale = 1 + 0.03 * i;
      x = Math.sin(time * 41) * Math.sin(time * 17) * width * 0.004 * i;
      y = Math.cos(time * 37) * height * 0.004 * i;
      rotation = Math.sin(time * 29) * 0.004 * i;
      break;
  }
  return {
    x: x + (0.5 - animation.focalX) * (scale - 1) * width,
    y: y + (0.5 - animation.focalY) * (scale - 1) * height,
    scale,
    rotation,
  };
}
export interface RevealState {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  blur: number;
  mask: number;
  progress: number;
}
export function revealState(
  animation: Animation,
  localTime: number,
  clipDuration: number,
): RevealState {
  const entering = progressAt(
      localTime,
      animation.delay,
      animation.duration,
      animation.easing,
    ),
    exiting = progressAt(
      clipDuration - localTime,
      0,
      Math.min(animation.duration, clipDuration / 2),
      animation.easing,
    );
  const p = Math.min(entering, exiting),
    safe = clamp(p),
    i = animation.intensity;
  const result: RevealState = {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    blur: 0,
    mask: 1,
    progress: safe,
  };
  switch (animation.reveal) {
    case "fade":
      result.opacity = safe;
      break;
    case "slide":
      result.x = (1 - p) * 90 * i;
      result.opacity = safe;
      break;
    case "scale":
      result.scale = 1 - (1 - p) * 0.22 * i;
      result.opacity = safe;
      break;
    case "blur":
      result.blur = (1 - safe) * 22 * i;
      result.opacity = safe;
      break;
    case "mask":
      result.mask = safe;
      break;
    case "character":
      result.mask = safe;
      result.x = (1 - p) * 35 * i;
      result.blur = (1 - safe) * 8 * i;
      break;
  }
  return result;
}
export function transitionState(
  animation: Animation,
  localTime: number,
  duration: number,
): RevealState {
  const p = clamp(
      progressAt(localTime, 0, animation.duration, animation.easing),
    ),
    out = clamp(
      progressAt(
        duration - localTime,
        0,
        Math.min(animation.duration, duration / 2),
        animation.easing,
      ),
    ),
    result: RevealState = {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      blur: 0,
      mask: 1,
      progress: p,
    };
  switch (animation.transition) {
    case "crossfade":
      result.opacity = Math.min(p, out);
      break;
    case "wipe":
      result.mask = p;
      break;
    case "zoom":
      result.scale = 1 + (1 - p) * 0.25 * animation.intensity;
      result.opacity = p;
      break;
    case "blur":
      result.blur = (1 - p) * 24 * animation.intensity;
      result.opacity = p;
      break;
    case "match":
      result.x = (1 - p) * -80 * animation.intensity;
      result.opacity = p;
      break;
    case "flash":
      result.opacity = p;
      break;
  }
  return result;
}
export function visibleText(
  text: string,
  effect: Animation["text"],
  progress: number,
): string {
  const p = clamp(progress);
  if (effect === "typewriter")
    return [...text].slice(0, Math.ceil([...text].length * p)).join("");
  if (effect === "words") {
    const words = text.split(/\s+/);
    return words.slice(0, Math.ceil(words.length * p)).join(" ");
  }
  if (effect === "lines") {
    const lines = text.split("\n");
    return lines.slice(0, Math.ceil(lines.length * p)).join("\n");
  }
  return text;
}
export function clipIsActive(clip: Clip, time: number): boolean {
  return !clip.muted && time >= clip.start && time < clip.start + clip.duration;
}
