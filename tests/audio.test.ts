import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clipEnvelope,
  duckingEnvelope,
  encodeWav,
  mixAudio,
  waveform,
  type PCM,
} from "../src/audio/mixer.js";
import { MUSIC_LIBRARY, synthesizeMusic } from "../src/audio/music.js";
import type { Clip, Project } from "../src/shared/types.js";

function project(duration = 2): Project {
  return {
    schemaVersion: 1,
    id: "audio-test",
    title: "Audio test",
    template: "ranking",
    createdAt: "",
    updatedAt: "",
    width: 1280,
    height: 720,
    fps: 30,
    accent: "#fff",
    entries: [],
    assets: [],
    scenes: [
      {
        id: "scene",
        kind: "intro",
        title: "",
        subtitle: "",
        start: 0,
        duration,
      },
    ],
    tracks: ["music", "narration"].map((kind) => ({
      id: kind,
      kind: kind as "music" | "narration",
      name: kind,
      volume: 1,
      muted: false,
      solo: false,
    })),
    clips: [],
    audio: {
      mode: "music-narration",
      ducking: { enabled: false, strength: 0.75, attack: 0.02, release: 0.1 },
    },
    export: { outputName: "audio", quality: "standard" },
  };
}
function clip(trackId: string, overrides: Partial<Clip> = {}): Clip {
  return {
    id: trackId,
    trackId,
    assetId: trackId,
    label: trackId,
    start: 0,
    duration: 2,
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
    animation: {
      camera: "none",
      reveal: "fade",
      text: "words",
      transition: "crossfade",
      duration: 0.5,
      delay: 0,
      intensity: 1,
      easing: "linear",
      focalX: 0.5,
      focalY: 0.5,
    },
    ...overrides,
  };
}
function pcm(values: number[], sampleRate = 10): PCM {
  return { sampleRate, channels: [Float32Array.from(values)] };
}
function close(actual: number, expected: number, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
}

test("narration is trimmed and positioned at exact sample offsets; linear resampling preserves sync", () => {
  const p = project();
  p.clips = [
    clip("visual", { duration: 2 }),
    clip("narration", { start: 0.3, trimStart: 0.2, duration: 0.4 }),
  ];
  const source = pcm([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
  const result = mixAudio(p, new Map([["narration", source]]), 20);
  assert.equal(result.channels[0]!.length, 40);
  assert.deepEqual(
    Array.from(result.channels[0]!.slice(0, 6)),
    [0, 0, 0, 0, 0, 0],
  );
  close(result.channels[0]![6]!, 0.2);
  close(result.channels[0]![7]!, 0.25);
  close(result.channels[0]![13]!, 0.55);
  close(result.channels[0]![14]!, 0);
  assert.deepEqual(result.channels[0], result.channels[1]);
});

test("looping repeats only the source region after trim and respects clip and track gains", () => {
  const p = project(1);
  p.tracks[0]!.volume = 0.5;
  p.clips = [
    clip("music", { duration: 1, trimStart: 0.2, loop: true, volume: 0.5 }),
  ];
  const result = mixAudio(
    p,
    new Map([["music", pcm([0.9, 0.8, 0.2, 0.4])]]),
    10,
  );
  Array.from(result.channels[0]!).forEach((sample, index) =>
    close(sample, index % 2 ? 0.1 : 0.05),
  );
});

test("clip fades and normalization are applied to audible source samples", () => {
  const p = project(1);
  p.clips = [
    clip("narration", {
      duration: 1,
      fadeIn: 0.2,
      fadeOut: 0.2,
      normalize: true,
      volume: 0.5,
    }),
  ];
  const result = mixAudio(
    p,
    new Map([["narration", pcm(Array(10).fill(0.1))]]),
    10,
  );
  close(result.channels[0]![0]!, 0);
  close(result.channels[0]![1]!, 0.89125094 * 0.25);
  close(result.channels[0]![5]!, 0.89125094 * 0.5);
  close(result.channels[0]![9]!, 0.89125094 * 0.25);
  close(clipEnvelope(p.clips[0]!, 1), 0);
});

test("four export modes preserve duration; music-only is not ducked by excluded speech", () => {
  const p = project(1);
  p.clips = [
    clip("music", { duration: 1 }),
    clip("narration", { duration: 1 }),
  ];
  const sources = new Map([
    ["music", pcm(Array(10).fill(0.1))],
    ["narration", pcm(Array(10).fill(0.2))],
  ]);
  for (const [mode, expected] of [
    ["music-narration", 0.3],
    ["music", 0.1],
    ["narration", 0.2],
    ["silent", 0],
  ] as const) {
    p.audio.mode = mode;
    const result = mixAudio(p, sources, 10);
    assert.equal(result.channels[0]!.length, 10);
    close(result.channels[0]![5]!, expected);
  }
  p.audio.mode = "music";
  p.audio.ducking.enabled = true;
  close(mixAudio(p, sources, 10).channels[0]![5]!, 0.1);
});

test("mute and solo isolate audio independently of visual solo tracks", () => {
  const p = project(1);
  p.clips = [
    clip("music", { duration: 1 }),
    clip("narration", { duration: 1 }),
  ];
  p.tracks.push({
    id: "visual",
    kind: "text",
    name: "Text",
    volume: 1,
    solo: true,
    muted: false,
  });
  const sources = new Map([
    ["music", pcm(Array(10).fill(0.1))],
    ["narration", pcm(Array(10).fill(0.2))],
  ]);
  close(mixAudio(p, sources, 10).channels[0]![5]!, 0.3);
  p.tracks[1]!.solo = true;
  close(mixAudio(p, sources, 10).channels[0]![5]!, 0.2);
  p.tracks[1]!.muted = true;
  close(mixAudio(p, sources, 10).channels[0]![5]!, 0.1);
  p.clips[0]!.muted = true;
  close(mixAudio(p, sources, 10).channels[0]![5]!, 0);
});

test("RMS ducking follows speech amplitude, stays up through silence, and recovers smoothly", () => {
  const sampleRate = 1000;
  const narration = new Float32Array(2000);
  for (let i = 500; i < 1000; i++)
    narration[i] = 0.25 * Math.sin((2 * Math.PI * 50 * i) / sampleRate);
  const settings = {
    enabled: true,
    strength: 0.75,
    attack: 0.03,
    release: 0.15,
  };
  const envelope = duckingEnvelope(
    { sampleRate, channels: [narration] },
    settings,
  );
  close(envelope[499]!, 1);
  assert.ok(envelope[520]! > envelope[600]!);
  assert.ok(envelope[900]! < 0.26);
  assert.ok(envelope[1100]! > envelope[1000]! && envelope[1100]! < 0.8);
  assert.ok(envelope[1900]! > 0.99);
  for (let i = 1; i < envelope.length; i++)
    assert.ok(Math.abs(envelope[i]! - envelope[i - 1]!) < 0.03);
  const slower = duckingEnvelope(
    { sampleRate, channels: [narration] },
    { ...settings, attack: 0.2 },
  );
  assert.ok(slower[600]! > envelope[600]! + 0.2);
  const opposite = Float32Array.from(narration, (value) => -value);
  const stereo = duckingEnvelope(
    { sampleRate, channels: [narration, opposite] },
    settings,
  );
  close(stereo[900]!, envelope[900]!);
});

test("mixed music ducks only during positioned narration and loud mixes cannot clip", () => {
  const p = project(2);
  p.audio.ducking.enabled = true;
  p.clips = [clip("music"), clip("narration", { start: 0.5, duration: 0.5 })];
  const sources = new Map([
    ["music", pcm(Array(2000).fill(0.2), 1000)],
    ["narration", pcm(Array(500).fill(0.1), 1000)],
  ]);
  const output = mixAudio(p, sources, 1000).channels[0]!;
  close(output[400]!, 0.2);
  assert.ok(output[900]! < 0.16); // .05 ducked music + .1 narration.
  assert.ok(output[1500]! > 0.19);
  p.clips[0]!.volume = 10;
  const loud = mixAudio(p, sources, 1000).channels[0]!;
  assert.ok(
    loud.every(
      (value) => Number.isFinite(value) && Math.abs(value) <= 0.980001,
    ),
  );
});

test("WAV encoding produces a standards-compatible interleaved stereo header and samples", () => {
  const bytes = encodeWav({
    sampleRate: 48000,
    channels: [Float32Array.of(-1, 1), Float32Array.of(0.5, -0.5)],
  });
  const view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(view.getUint32(4, true), 44);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 48000);
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(46, true), 16384);
  assert.equal(view.getInt16(48, true), 32767);
});

test("waveform includes peaks from either stereo channel and handles empty audio", () => {
  assert.deepEqual(
    waveform(
      {
        sampleRate: 10,
        channels: [
          Float32Array.of(0, 0.25, 0, 0),
          Float32Array.of(0, 0, 0, -0.5),
        ],
      },
      2,
    ),
    [0.25, 0.5],
  );
  assert.deepEqual(waveform(pcm([]), 3), [0, 0, 0]);
});

test("four original compositions are distinct, non-silent, deterministic stereo and have clean loop boundaries", () => {
  assert.equal(MUSIC_LIBRARY.length, 4);
  const signatures = new Set<string>();
  for (const item of MUSIC_LIBRARY) {
    const audio = synthesizeMusic(item.id);
    assert.equal(audio.sampleRate, 44100);
    assert.equal(audio.channels.length, 2);
    close(
      audio.channels[0]!.length / audio.sampleRate,
      item.duration,
      1 / audio.sampleRate,
    );
    let peak = 0,
      energy = 0;
    for (const channel of audio.channels) {
      for (const sample of channel) {
        assert.ok(Number.isFinite(sample));
        peak = Math.max(peak, Math.abs(sample));
        energy += sample * sample;
      }
      assert.ok(
        Math.abs(channel[0]! - channel[channel.length - 1]!) < 0.025,
        `${item.id} boundary click`,
      );
    }
    assert.ok(peak > 0.1 && peak <= 0.48001);
    assert.ok(Math.sqrt(energy / (2 * audio.channels[0]!.length)) > 0.04);
    signatures.add(Array.from(audio.channels[0]!.slice(2000, 2010)).join(","));
  }
  assert.equal(signatures.size, 4);
  const a = synthesizeMusic(MUSIC_LIBRARY[0]!.id),
    b = synthesizeMusic(MUSIC_LIBRARY[0]!.id);
  assert.deepEqual(a, b);
});
