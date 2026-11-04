# Feature inventory

Implemented in this branch; verification details are in `TESTING.md`.

| Area                        | Delivered behavior                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop and local operation | Isolated Electron shell; optional localhost browser UI; no mandatory account/cloud service; Windows x64 portable packaging with native rendering resources                                                                           |
| Projects                    | Multiple locally saved projects, version-1 validated JSON, save/reopen/duplicate, managed copied assets, atomic persistence, undo/redo and unsaved-close protection                                                                  |
| Templates                   | Ranking with arbitrary entry count, analysis chapters/quotes, side-by-side comparison with editable categories/opponent and computed result; intro/summary/outro                                                                     |
| Media                       | PNG/JPEG/WebP, MP4/WebM, MP3/WAV and FFmpeg-supported common audio imports; drag/drop, thumbnails, metadata, search, assignment, replace all references, fit/fill/position/scale                                                     |
| Timeline                    | Six real tracks; clip drag/move, edge trim, source offset, duration, split/duplicate/delete, seek/frame step, zoom, track order, independent visual/audio mute/solo                                                                  |
| Animation                   | Zoom in/out, X/Y pan, combined movement, parallax, focal point, shake; fade/slide/scale/blur/mask/character reveal; word/line/typewriter/kinetic/scale/rank typography; overlapping crossfade/wipe/zoom/blur/match/flash transitions |
| Audio                       | Separate music/narration, real source waveforms mapped to trim/loop region, exact clip start/trim, gain, mute/solo, fades, looping, optional peak normalization                                                                      |
| Ducking                     | Narration RMS activity controls music attenuation with adjustable strength/attack/release; silent parts do not hold ducking indefinitely                                                                                             |
| Original music              | Four distinct synthesized stereo compositions and regenerated WAV pipeline with documented CC0 provenance; no external music samples                                                                                                 |
| Preview                     | Same frame function/animation calculations as export; per-clip video source position; shared PCM mix; edits pause playback before rebuilding audio                                                                                   |
| Export                      | Actual MP4/H.264/yuv420p/AAC; 1280×720, 1920×1080, 1080×1920 at 30 FPS; quality settings, progress, cancel, errors, native output choice or browser download with chosen filename                                                    |
| Audio modes                 | Music+narration, music-only, narration-only, silent; visual timeline unaffected                                                                                                                                                      |
| Automation                  | UI-independent CLI project generation/rendering, structured local media paths, progress/errors, cancellation and post-encode FFprobe verification                                                                                    |

## Practical limits

- No reference video was supplied. Composition/pacing are original; matching an unseen reference has not been claimed.
- Windows binary contents are checked on Linux. Windows launch, native save dialog, playback, and export on a real Windows host remain a required runtime validation step. The portable app is unsigned.
- Source video/audio preview support depends on Chromium codecs. Export uses FFmpeg; a format accepted by FFmpeg but unsupported by Chromium may require conversion for video preview. Required common PNG/JPEG/WebP/MP4/WebM/MP3/WAV formats are supported by the implementation; codec variations still matter.
- This is a fixed six-track, template-oriented editor. It has no arbitrary track creation, keyframe graph editor, speech transcription, automatic word-to-scene alignment, external publishing, or AI voice generation.
- Camera traversal uses clip duration; reveal/transition duration is independently configurable. Crop/position coordinates use a 1280-wide internal layout space.
- Regenerating a sequence replaces visual clip timing/effects with template defaults and retains independent audio. Explicitly save or duplicate when preserving a manually edited arrangement.
- Audio is mixed in memory and decoded sources have a 512 MiB limit. Very long/high-resolution source material can exceed available memory; the schema allows at most two hours but that is not a performance guarantee. Normalization is peak based.
- Project JSON and assets should be backed up together. There is no portable media archive import/export UI, historical schema migration, or automatic media garbage collection.
- The four original tracks are minimal synthesized underscores, not orchestral recordings.
