/** Validate architecture, hashes, packaged assets and CJS entrypoints without executing Windows code. */
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function verifyPE(file) {
  const bytes = await fs.readFile(file);
  if (bytes.length < 64 || bytes.readUInt16LE(0) !== 0x5a4d)
    throw new Error(`${file}: missing DOS MZ header`);
  const pe = bytes.readUInt32LE(0x3c);
  if (
    pe + 26 > bytes.length ||
    bytes.readUInt32LE(pe) !== 0x00004550 ||
    bytes.readUInt16LE(pe + 4) !== 0x8664 ||
    bytes.readUInt16LE(pe + 24) !== 0x20b
  )
    throw new Error(`${file}: expected x64 PE32+ binary`);
  return {
    bytes: bytes.length,
    machine: "AMD64",
    format: "PE32+",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
export async function verifyWindows(folder, packaged = false) {
  const directory = path.resolve(folder);
  const resources = packaged
    ? path.join(directory, "resources", "windows")
    : directory;
  const manifest = JSON.parse(
    await fs.readFile(path.join(resources, "manifest.json"), "utf8"),
  );
  if (manifest.target !== "win32-x64")
    throw new Error("Unexpected Windows resource target");
  for (const binary of manifest.binaries) {
    if (
      !["ffmpeg.exe", "ffprobe.exe", "skia.win32-x64-msvc.node"].includes(
        binary.file,
      )
    )
      throw new Error("Invalid manifest binary name");
    const actual = await verifyPE(path.join(resources, binary.file));
    if (actual.sha256 !== binary.sha256 || actual.bytes !== binary.bytes)
      throw new Error(`Packaged ${binary.file} does not match staged manifest`);
  }
  if (
    manifest.binaries.length !== 3 ||
    new Set(manifest.binaries.map((b) => b.file)).size !== 3
  )
    throw new Error("All three Windows resources are required");
  if (packaged) {
    await verifyPE(path.join(directory, "Kuro Studio.exe"));
    const require = createRequire(import.meta.url);
    const asar = require("@electron/asar");
    const archive = path.join(directory, "resources", "app.asar");
    for (const file of [
      "dist/desktop/main.cjs",
      "dist/desktop/preload.cjs",
      "dist/ui/index.html",
      "node_modules/@napi-rs/canvas/index.js",
    ])
      asar.statFile(archive, file);
    const main = asar.extractFile(archive, "dist/desktop/main.cjs").toString();
    for (const variable of [
      "NAPI_RS_NATIVE_LIBRARY_PATH",
      "FFMPEG_PATH",
      "FFPROBE_PATH",
    ])
      if (!main.includes(variable))
        throw new Error(
          `Desktop main is missing ${variable} resource selection`,
        );
    for (const file of [
      "fonts/DejaVuSans.ttf",
      "music/paper-lanterns.wav",
      "music/midnight-archive.wav",
      "music/rival-circuit.wav",
      "music/after-the-rain.wav",
    ])
      await fs.access(path.join(directory, "resources", "public", file));
  }
  return {
    target: "win32-x64",
    verifiedAt: new Date().toISOString(),
    directory,
    packaged,
    binaryCount: 3,
    canvasVersion: manifest.canvasVersion,
    runtimeTestedOnWindows: false,
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const packaged = process.argv.includes("--packaged");
  const folder =
    process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
    (packaged
      ? path.join(root, "release", "win-unpacked")
      : path.join(root, "work", "windows-resources", "windows"));
  verifyWindows(folder, packaged)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
