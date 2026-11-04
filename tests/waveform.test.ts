import { test } from "node:test";
import assert from "node:assert/strict";
import { clipWaveform } from "../src/ui/waveform.js";

const asset = { duration: 4, waveform: [0.1, 0.2, 0.5, 0.9] };
test("timeline waveform removes trimmed source and shows trailing silence", () => {
  assert.deepEqual(
    clipWaveform(asset, { trimStart: 2, duration: 4, loop: false }, 4),
    [0.5, 0.9, 0, 0],
  );
});
test("looping repeats the trimmed range rather than the entire recording", () => {
  assert.deepEqual(
    clipWaveform(asset, { trimStart: 2, duration: 6, loop: true }, 6),
    [0.5, 0.9, 0.5, 0.9, 0.5, 0.9],
  );
});
test("peak rebinning preserves transients within wide display bins", () => {
  assert.deepEqual(
    clipWaveform(asset, { trimStart: 0, duration: 4, loop: false }, 2),
    [0.2, 0.9],
  );
});
test("unavailable waveform stays absent and trim beyond source is silent", () => {
  assert.deepEqual(
    clipWaveform(undefined, { trimStart: 0, duration: 4, loop: false }),
    [],
  );
  assert.deepEqual(
    clipWaveform(asset, { trimStart: 5, duration: 2, loop: true }, 2),
    [0, 0],
  );
});
