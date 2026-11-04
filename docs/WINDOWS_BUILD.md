# Windows x64 portable build

The editor targets Windows 10/11 x64. A Linux build host can assemble the portable executable, but static package verification does not establish Windows runtime compatibility. This session has not executed the application on Windows.

## Prepare and package

Install Node.js 22 or newer, npm, and curl. Windows 10/11 includes `curl.exe`; the preparation script uses it directly. Install project dependencies with `npm ci`, then run `npm run package:win`. The build needs network access on its first run for npm packages, Electron, electron-builder tools, and FFmpeg release assets. It preserves HTTP(S) proxy and CA settings.

`node scripts/prepare-windows.mjs` stages Windows binaries in `work/windows-resources/windows/` without replacing any host-platform file in `node_modules`. It downloads the Windows x64 canvas package matching the installed canvas version, verifies the tarball against `package-lock.json` SHA512 integrity, downloads the FFmpeg Windows build identified by installed `ffmpeg-static` metadata, and copies the Windows x64 FFprobe already supplied by `ffprobe-static`.

The staged directory contains:

- `ffmpeg.exe`: upstream `ffmpeg-static` release `b6.1.1` Windows x64 build.
- `ffprobe.exe`: Windows x64 build bundled with `ffprobe-static`.
- `skia.win32-x64-msvc.node`: the exact installed `@napi-rs/canvas` version's Windows x64 N-API library.
- `manifest.json`: source versions, canvas npm integrity, byte counts, SHA256 hashes, and verification timestamp.
- `licenses/`: upstream package licenses/readmes and Windows FFmpeg binary license/readme. Preserve these notices when distributing the application.

The script caches downloads in `work/windows-downloads/`. An integrity failure stops preparation. Remove the affected cached download before retrying; the script does not disable integrity or TLS validation.

## Packaging configuration

The Windows electron-builder configuration must copy `work/windows-resources/windows` to `resources/windows`, target x64 portable, and set `signAndEditExecutable: false` for an unsigned Linux cross-build without Wine. `npmRebuild: false` prevents electron-builder from trying to rebuild host native packages: the renderer uses the staged matching N-API binary.

At packaged Windows startup, the Electron main process selects `resources/windows/ffmpeg.exe` and `ffprobe.exe` through `FFMPEG_PATH` and `FFPROBE_PATH`, and selects the staged canvas library through `NAPI_RS_NATIVE_LIBRARY_PATH` before loading the renderer. UI assets stay in `app.asar/dist/ui`; fonts and original music are copied to `resources/public`. These resource paths are independent of the launch working directory.

## Static verification

Run `node scripts/verify-windows.mjs` to inspect staged resources. After packaging, run:

```sh
node scripts/verify-windows.mjs --packaged release/win-unpacked
```

Verification checks all three native resources for AMD64 PE32+ headers and compares bytes/SHA256 against the staging manifest. Package verification also checks the desktop executable's PE architecture; required main/preload/UI/canvas JavaScript files inside `app.asar`; environment-based runtime binary selection; and the font and four music files outside the archive.

Preparation and staged verification were executed on Linux on 2026-11-04. All three Windows native resource files passed architecture and hash checks. This checks package contents and architecture only; Windows execution remains untested until the following workflow is performed on a Windows computer.

## Required Windows runtime acceptance

Copy the portable `.exe` to a Windows 10/11 x64 machine and launch it from a directory containing spaces. Create a ranking project; import PNG/JPEG/WebP images and MP4/WebM clips; add a music track; import MP3/WAV narration; reposition it and enable ducking. Save, close, reopen, and confirm imported assets remain accessible. Select an MP4 path using the native dialog and export with music/narration, then export the same visuals in music-only mode. Open both MP4s in a Windows media player and inspect synchronization and duration. Start and cancel another export, confirming that no partial MP4 replaces an existing destination.

The portable executable is unsigned. Signing and Windows runtime QA are separate release steps. The application itself works offline after installation/preparation; rendering does not require a mandatory cloud service.
