import type { MusicOption } from "../shared/types.js";
import type { PCM } from "./mixer.js";

const definitions = [
  {
    id: "paper-lanterns",
    name: "Paper Lanterns",
    mood: "Curious & playful",
    description: "Warm marimba, plucked bass, and a skipping pentatonic motif.",
    bpm: 112,
    color: "#e7ad53",
  },
  {
    id: "midnight-archive",
    name: "Midnight Archive",
    mood: "Mysterious & atmospheric",
    description: "Suspended minor chords, distant bells, and a soft heartbeat.",
    bpm: 78,
    color: "#8c8abb",
  },
  {
    id: "rival-circuit",
    name: "Rival Circuit",
    mood: "Energetic & competitive",
    description:
      "Syncopated synth arpeggios, rounded bass, and a driving beat.",
    bpm: 132,
    color: "#e97359",
  },
  {
    id: "after-the-rain",
    name: "After the Rain",
    mood: "Emotional & cinematic",
    description:
      "Slowly blooming strings, felt keys, and a hopeful rising theme.",
    bpm: 84,
    color: "#7fada2",
  },
];

export const MUSIC_LIBRARY: MusicOption[] = definitions.map((option) => ({
  ...option,
  duration: (32 * 60) / option.bpm,
  file: `/music/${option.id}.wav`,
}));

type Voice =
  "mallet" | "bell" | "pad" | "pluck" | "bass" | "kick" | "snare" | "hat";
const TAU = Math.PI * 2;
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Original eight-bar compositions. No samples, network, or external music model.
 * Every event and its short echo wraps around the complete loop, including releases.
 * This makes the music periodic rather than cutting a reverb tail at the boundary.
 */
export function synthesizeMusic(id: string): PCM {
  const option = MUSIC_LIBRARY.find((item) => item.id === id);
  if (!option) throw new Error(`Unknown original music composition: ${id}`);
  const sampleRate = 44100;
  const length = Math.round(option.duration * sampleRate);
  const left = new Float32Array(length),
    right = new Float32Array(length);
  const beat = 60 / option.bpm;
  let seed = 314159;
  const noise = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };

  function note(
    at: number,
    midi: number,
    beats: number,
    voice: Voice,
    gain: number,
    pan = 0,
  ) {
    const duration = beats * beat;
    const count = Math.ceil(duration * sampleRate);
    const start = Math.round(at * beat * sampleRate);
    const hz = frequency(midi);
    const lg = Math.cos(((pan + 1) * Math.PI) / 4),
      rg = Math.sin(((pan + 1) * Math.PI) / 4);
    const isPercussion =
      voice === "hat" || voice === "snare" || voice === "kick";
    const echo = !isPercussion && voice !== "bass" && voice !== "pad";
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate,
        phase = TAU * hz * t;
      const attack = Math.min(1, t / (voice === "pad" ? 0.18 : 0.006));
      const release = Math.min(
        1,
        (duration - t) / (voice === "pad" ? 0.35 : 0.035),
      );
      let value = 0;
      switch (voice) {
        case "mallet":
          value =
            (Math.sin(phase) + 0.28 * Math.sin(phase * 3) * Math.exp(-t * 12)) *
            Math.exp(-t * 5);
          break;
        case "bell":
          value =
            (Math.sin(phase) +
              0.3 * Math.sin(phase * 2) +
              0.12 * Math.sin(phase * 4)) *
            Math.exp(-t * 1.8);
          break;
        case "pad":
          value =
            (Math.sin(phase) +
              0.28 * Math.sin(phase * 2 + 0.3 * Math.sin(TAU * 0.6 * t)) +
              0.12 * Math.sin(phase * 3)) *
            0.6;
          break;
        case "pluck":
          value =
            (Math.sin(phase) +
              0.35 * Math.sin(phase * 2) +
              0.16 * Math.sin(phase * 3)) *
            Math.exp(-t * 4);
          break;
        case "bass":
          value =
            (Math.sin(phase) + 0.17 * Math.sin(phase * 2)) * Math.exp(-t * 0.7);
          break;
        case "kick":
          value =
            Math.sin(TAU * (48 * t + 5 * (1 - Math.exp(-t * 25)))) *
            Math.exp(-t * 15);
          break;
        case "snare":
          value =
            (noise() * 0.65 + Math.sin(TAU * 180 * t) * 0.35) *
            Math.exp(-t * 26);
          break;
        case "hat":
          value = noise() * Math.exp(-t * 65);
          break;
      }
      value *= attack * release * gain;
      const frame = (start + i) % length;
      left[frame]! += value * lg;
      right[frame]! += value * rg;
      if (echo) {
        const delayed = (frame + Math.round(beat * 0.75 * sampleRate)) % length;
        left[delayed]! += value * rg * 0.14;
        right[delayed]! += value * lg * 0.14;
      }
    }
  }

  if (id === "paper-lanterns") {
    const chords = [
      [60, 64, 67],
      [57, 60, 64],
      [65, 69, 72],
      [67, 71, 74],
    ];
    const motif = [0, 2, 4, 2, 1, 3, 2, 1];
    const scale = [72, 74, 76, 79, 81];
    for (let bar = 0; bar < 8; bar++) {
      const chord = chords[bar % 4]!;
      chord.forEach((midi, j) =>
        note(bar * 4 + j * 0.045, midi, 3.5, "pad", 0.065, (j - 1) * 0.5),
      );
      note(bar * 4, chord[0]! - 24, 1.5, "bass", 0.2);
      note(bar * 4 + 2.5, chord[2]! - 24, 1, "bass", 0.15);
      motif.forEach((degree, step) => {
        if (bar % 2 && step === 7) return;
        note(
          bar * 4 + step * 0.5,
          scale[(degree + (bar >= 4 ? 1 : 0)) % 5]!,
          0.85,
          "mallet",
          step % 2 ? 0.15 : 0.22,
          step % 2 ? 0.25 : -0.25,
        );
      });
      for (let pulse = 0; pulse < 4; pulse++)
        note(bar * 4 + pulse + 0.5, 60, 0.15, "hat", 0.035, 0.3);
    }
  } else if (id === "midnight-archive") {
    const chords = [
      [50, 57, 60, 64],
      [46, 53, 57, 60],
      [48, 55, 58, 62],
      [45, 52, 55, 59],
    ];
    const melody = [74, 76, 69, 72, 70, 65, 69, 73];
    for (let bar = 0; bar < 8; bar++) {
      chords[Math.floor(bar / 2)]!.forEach((midi, j) =>
        note(bar * 4, midi, 5, "pad", 0.095, (j - 1.5) * 0.35),
      );
      note(
        bar * 4 + 0.75,
        melody[bar]!,
        3.6,
        "bell",
        0.16,
        bar % 2 ? 0.5 : -0.5,
      );
      note(bar * 4, chords[Math.floor(bar / 2)]![0]! - 12, 3, "bass", 0.13);
      note(bar * 4 + 2.75, 40, 0.6, "kick", 0.075);
    }
  } else if (id === "rival-circuit") {
    const chords = [
      [52, 55, 59],
      [48, 52, 55],
      [55, 59, 62],
      [50, 54, 57],
    ];
    for (let bar = 0; bar < 8; bar++) {
      const chord = chords[bar % 4]!;
      for (let step = 0; step < 8; step++) {
        note(
          bar * 4 + step * 0.5,
          chord[[0, 1, 2, 1, 0, 2, 1, 2][step]!]! + 12,
          0.65,
          "pluck",
          0.13,
          step % 2 ? 0.35 : -0.35,
        );
        note(
          bar * 4 + step * 0.5,
          chord[0]! - 12,
          0.4,
          "bass",
          step % 2 ? 0.13 : 0.18,
        );
        note(bar * 4 + step * 0.5 + 0.25, 60, 0.13, "hat", 0.045, 0.3);
      }
      [0, 1.5, 2, 3.5].forEach((pulse) =>
        note(bar * 4 + pulse, 40, 0.6, "kick", 0.28),
      );
      [1, 3].forEach((pulse) =>
        note(bar * 4 + pulse, 60, 0.35, "snare", 0.1, -0.15),
      );
    }
  } else {
    const chords = [
      [48, 55, 60, 64],
      [43, 50, 55, 59],
      [45, 52, 57, 60],
      [41, 48, 53, 57],
    ];
    const melody = [72, 71, 67, 69, 72, 76, 74, 72];
    for (let bar = 0; bar < 8; bar++) {
      const chord = chords[Math.floor(bar / 2)]!;
      chord.forEach((midi, j) =>
        note(bar * 4, midi, 4.8, "pad", 0.11, (j - 1.5) * 0.4),
      );
      note(bar * 4 + 0.25, melody[bar]!, 3.4, "mallet", 0.24, -0.15);
      chord.forEach((midi, j) =>
        note(bar * 4 + j + 0.5, midi + 12, 1.6, "pluck", 0.075, 0.25),
      );
      note(bar * 4, chord[0]! - 12, 3.8, "bass", 0.1);
    }
  }
  let peak = 0,
    power = 0;
  for (let i = 0; i < length; i++) {
    peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!));
    power += (left[i]! ** 2 + right[i]! ** 2) / 2;
  }
  // Consistent, restrained loudness leaves headroom for narration and overlapping clips.
  const gain = Math.min(0.1 / Math.sqrt(power / length), 0.48 / peak);
  for (let i = 0; i < length; i++) {
    left[i]! *= gain;
    right[i]! *= gain;
  }
  return { sampleRate, channels: [left, right] };
}
