import assert from "node:assert/strict";
import test from "node:test";
import { duration, sampleTimeline, validateTimeline } from "./index.ts";
test("sample timeline valid", () => assert.deepEqual(validateTimeline(sampleTimeline), []));
test("duration returns last end", () => assert.equal(duration(sampleTimeline), 17));
test("overlaps rejected", () => { const copy = structuredClone(sampleTimeline); copy.scenes[1].start = 3; assert.ok(validateTimeline(copy).some(x => x.includes("Overlapping"))); });
