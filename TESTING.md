# Verification

All results below are actual executions in the Linux managed workspace on 4 November 2026. No Windows host is attached. Final results: **34/34 automated tests pass**, the production-browser workflow passes (1.7 minutes under concurrent packaging load), strict TypeScript and production build pass, and an actual Linux Electron smoke passes. The unsigned Windows x64 portable executable was built successfully (approximately 174 MiB); packaged native binaries, hashes, UI, fonts, and music all passed static verification. Windows runtime remains untested.

## Commands

```sh
npm run typecheck
npm test
npm run test:e2e
node dist/cli.cjs --help
npm run package:win
node scripts/verify-windows.mjs --packaged
```

`npm test` uses Node's test runner with TypeScript loading, avoiding the `tsx` CLI's extra IPC socket. API and browser tests need loopback networking and subprocess permissions. E2E runs a dedicated **production** server on port 4321 to avoid a development watcher restarting exports when source files change. Its data lives in ignored `work/e2e-data`.

## Coverage

- **Core:** three templates and variable-length rankings; six-track schema/reference validation; immutable clip updates; media replacement; interpolation/easing; camera/reveal/text/transition calculations; deterministic frames; layer order and independent visual/audio solo; per-clip media frames; portrait composition; comparison category totals and stable primary/secondary roles.
- **Audio:** exact narration sample offsets; trimmed looping; resampling, gains, normalization and fades; four audio modes; mute/solo; actual RMS activity and ducking recovery; WAV headers; waveforms; four deterministic original compositions and loop boundaries.
- **Renderer/CLI:** real H.264/yuv420p/AAC MP4; looping imported video; spectral verification of narration placement and music-only exclusion; identical decoded visual hashes across all four modes; 720p/1080p/portrait; cancellation/failure cleanup preserving an existing output; CLI generation, relative media resolution, CJS execution, and structured entry media fallback.
- **API:** atomic saved-project round trips; duplicate/import persistence after app recreation; invalid project/asset/path/native-output and remote-origin rejection; real mixed/silent preview WAV; muted-solo regression; async export polling, real downloadable MP4, requested download filename, cancellation, and error status.
- **Waveform UI helper:** visible trimmed source range, trimmed-loop repetition, silence beyond source end, and absent metadata.
- **Production browser workflow:** create ranking with five entries; import and assign five PNGs; generate; select music; import WAV narration; edit timing/fades/ducking; drag narration and undo; save/reload/reopen; play/pause; export music+narration and music-only; FFprobe both 35-second 1280×720/30 FPS MP4s; replace media and reuse the template. Browser page errors fail the test.

The narration fixture is a deterministic audio signal with speech-like amplitude gaps, not a human recording. It verifies sample placement, mixing, waveform handling, and ducking paths; it does not claim perceptual speech quality assessment. Original artwork and imported test images avoid copyrighted anime assets.

## Desktop smoke and delivered evidence

The actual Electron application was launched under a locally extracted Xvfb on Linux. The smoke verified `contextIsolation: true`, `nodeIntegration: false`, sandboxed preload, native-save-path bridge exposure, project create/save/reopen, real MP4 export/download, and clean shutdown after saving. FFprobe confirmed H.264/yuv420p, 320×180, 30 FPS and six frames. Native dialog interaction was not exercised. An initial headless Ozone attempt failed; conventional Xvfb succeeded.

Reproduce on Linux after building with `node scripts/desktop-smoke.mjs` when Xvfb is installed, or set `XVFB_EXECUTABLE` to a local Xvfb binary. The script keeps app data and screenshots in `work/desktop-smoke`. No external reporting service is needed.

The browser test produced two actual 35-second 720p MP4s, with music+narration and music-only. The separate `examples/ranking-demo.json` was also rendered through the bundled CLI into a 35-second original-art/music demo (1,050 frames). Delivered files are in `release/`; source archives exclude node_modules, local test media, credentials, and application data.

## Platform and resource limits

Windows x64 binary staging checks PE architecture and hashes, and package inspection checks desktop main/preload/UI plus native resources, fonts, and all music files. Static inspection is not Windows runtime testing. The Windows native save dialog, actual Windows launch, playback and export must still be exercised on a Windows machine. See `docs/WINDOWS_BUILD.md`.

Browser and native Canvas share all layout/animation calculations, but their antialiasing implementations can differ slightly. Short test renders cover codec/duration/frame count and timing; they are not performance benchmarks for long or unusually large source material. Audio buffers are in memory; decoded sources have a 512 MiB cap. No live cloud integrations or social publishing are part of this application.
