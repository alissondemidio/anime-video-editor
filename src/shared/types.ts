export type TemplateId = "ranking" | "analysis" | "comparison";
export type TrackKind =
  "background" | "media" | "text" | "effects" | "music" | "narration";
export type AudioMode = "music-narration" | "music" | "narration" | "silent";
export type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "back";
export type CameraEffect =
  | "none"
  | "zoom-in"
  | "zoom-out"
  | "pan-x"
  | "pan-y"
  | "zoom-pan"
  | "parallax"
  | "shake";
export type RevealEffect =
  "fade" | "slide" | "scale" | "blur" | "mask" | "character";
export type TextEffect =
  "words" | "lines" | "typewriter" | "kinetic" | "scale" | "ranking";
export type TransitionEffect =
  "crossfade" | "wipe" | "zoom" | "blur" | "match" | "flash";
export interface Animation {
  camera: CameraEffect;
  reveal: RevealEffect;
  text: TextEffect;
  transition: TransitionEffect;
  duration: number;
  delay: number;
  intensity: number;
  easing: Easing;
  focalX: number;
  focalY: number;
}
export interface ContentEntry {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  quote: string;
  rank: number;
  score: number;
  comparisonScore: number;
  opponentName?: string;
  categories?: { label: string; score: number; comparisonScore: number }[];
  mediaId?: string;
  secondaryMediaId?: string;
}
export interface Scene {
  id: string;
  kind: "intro" | "entry" | "summary" | "outro";
  title: string;
  subtitle: string;
  start: number;
  duration: number;
  entryId?: string;
}
export interface Asset {
  id: string;
  name: string;
  kind: "image" | "video" | "audio";
  path: string;
  url: string;
  mime: string;
  duration: number;
  width?: number;
  height?: number;
  waveform?: number[];
  size: number;
  builtin?: boolean;
}
export interface Clip {
  id: string;
  trackId: string;
  mediaRole?: "primary" | "secondary";
  sceneId?: string;
  entryId?: string;
  assetId?: string;
  label: string;
  start: number;
  duration: number;
  trimStart: number;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
  normalize: boolean;
  fit: "cover" | "contain";
  x: number;
  y: number;
  scale: number;
  opacity: number;
  animation: Animation;
  text?: string;
  color?: string;
}
export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  solo: boolean;
  volume: number;
}
export interface Project {
  schemaVersion: 1;
  id: string;
  title: string;
  template: TemplateId;
  createdAt: string;
  updatedAt: string;
  width: number;
  height: number;
  fps: 30;
  accent: string;
  entries: ContentEntry[];
  scenes: Scene[];
  tracks: Track[];
  clips: Clip[];
  assets: Asset[];
  audio: {
    mode: AudioMode;
    ducking: {
      enabled: boolean;
      strength: number;
      attack: number;
      release: number;
    };
  };
  export: { outputName: string; quality: "draft" | "standard" | "high" };
}
export interface ProjectSummary {
  id: string;
  title: string;
  template: TemplateId;
  updatedAt: string;
  duration: number;
}
export interface ExportJob {
  id: string;
  status: "queued" | "rendering" | "complete" | "cancelled" | "error";
  progress: number;
  message: string;
  outputPath?: string;
  downloadUrl?: string;
  error?: string;
}
export interface MusicOption {
  id: string;
  name: string;
  mood: string;
  description: string;
  bpm: number;
  duration: number;
  file: string;
  color: string;
}
