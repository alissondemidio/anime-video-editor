/** Stage Windows x64 resources without changing the host's installed native modules. */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { verifyPE } from "./verify-windows.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(root, "work", "windows-downloads");
const target = path.join(root, "work", "windows-resources", "windows");
const run = promisify(execFile);
const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
async function download(url, filename) {
  const output = path.join(cache, filename);
  try {
    await fs.access(output);
    return output;
  } catch {}
  const temporary = `${output}.partial`;
  try {
    // curl respects the managed HTTP(S)_PROXY and CA settings; TLS verification stays enabled.
    await run(
      process.platform === "win32" ? "curl.exe" : "curl",
      [
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--retry",
        "2",
        "--connect-timeout",
        "30",
        "--max-time",
        "300",
        "--output",
        temporary,
        url,
      ],
      { maxBuffer: 1024 * 1024 },
    );
    await fs.rename(temporary, output);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return output;
}
function tarFile(gzip, wanted) {
  const tar = gunzipSync(gzip);
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString().replace(/\0.*$/s, "");
    const size = parseInt(
      header.subarray(124, 136).toString().replace(/\0.*$/s, "").trim() || "0",
      8,
    );
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      offset + 512 + size > tar.length
    )
      throw new Error("Invalid npm tarball");
    if (name === wanted) return tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`npm tarball is missing ${wanted}`);
}
async function main() {
  await fs.mkdir(cache, { recursive: true });
  await fs.mkdir(path.join(target, "licenses"), { recursive: true });
  const canvas = await json(
    path.join(root, "node_modules", "@napi-rs", "canvas", "package.json"),
  );
  const lock = await json(path.join(root, "package-lock.json"));
  const native = lock.packages["node_modules/@napi-rs/canvas-win32-x64-msvc"];
  if (
    !native ||
    native.version !== canvas.version ||
    !native.integrity?.startsWith("sha512-")
  )
    throw new Error(
      "Windows canvas lock entry must match installed canvas exactly and include SHA512 integrity",
    );
  const canvasArchive = await fs.readFile(
    await download(
      native.resolved,
      `canvas-win32-x64-msvc-${native.version}.tgz`,
    ),
  );
  const actualIntegrity = `sha512-${createHash("sha512").update(canvasArchive).digest("base64")}`;
  if (actualIntegrity !== native.integrity)
    throw new Error(
      "Windows canvas npm integrity mismatch; remove the cached download and retry",
    );
  await fs.writeFile(
    path.join(target, "skia.win32-x64-msvc.node"),
    tarFile(canvasArchive, "package/skia.win32-x64-msvc.node"),
  );
  const ffmpegPackage = await json(
    path.join(root, "node_modules", "ffmpeg-static", "package.json"),
  );
  const release = ffmpegPackage["ffmpeg-static"]["binary-release-tag"];
  if (!/^[A-Za-z0-9._-]+$/.test(release))
    throw new Error("Invalid ffmpeg release tag");
  const base = `https://github.com/eugeneware/ffmpeg-static/releases/download/${release}`;
  await fs.writeFile(
    path.join(target, "ffmpeg.exe"),
    gunzipSync(
      await fs.readFile(
        await download(
          `${base}/ffmpeg-win32-x64.gz`,
          `ffmpeg-${release}-win32-x64.gz`,
        ),
      ),
    ),
  );
  for (const suffix of ["LICENSE", "README"])
    await fs.copyFile(
      await download(
        `${base}/win32-x64.${suffix}`,
        `ffmpeg-${release}-win32-x64.${suffix}`,
      ),
      path.join(target, "licenses", `ffmpeg.${suffix}`),
    );
  await fs.copyFile(
    path.join(
      root,
      "node_modules",
      "ffprobe-static",
      "bin",
      "win32",
      "x64",
      "ffprobe.exe",
    ),
    path.join(target, "ffprobe.exe"),
  );
  for (const [module, name] of [
    ["@napi-rs/canvas", "canvas"],
    ["ffprobe-static", "ffprobe-static"],
    ["ffmpeg-static", "ffmpeg-static"],
  ]) {
    for (const file of ["LICENSE", "README.md"])
      await fs.copyFile(
        path.join(root, "node_modules", module, file),
        path.join(target, "licenses", `${name}.${file}`),
      );
  }
  const binaries = [];
  for (const file of [
    "ffmpeg.exe",
    "ffprobe.exe",
    "skia.win32-x64-msvc.node",
  ]) {
    const info = await verifyPE(path.join(target, file));
    binaries.push({ file, ...info });
  }
  const manifest = {
    schemaVersion: 1,
    target: "win32-x64",
    preparedAt: new Date().toISOString(),
    canvasVersion: canvas.version,
    canvasNpmIntegrity: native.integrity,
    canvasSource: native.resolved,
    ffmpegRelease: release,
    ffmpegSource: `${base}/ffmpeg-win32-x64.gz`,
    ffprobePackageVersion: (
      await json(
        path.join(root, "node_modules", "ffprobe-static", "package.json"),
      )
    ).version,
    binaries,
    runtimeTestedOnWindows: false,
  };
  await fs.writeFile(
    path.join(target, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `Windows x64 resources staged at ${target}. PE headers and hashes verified; Windows execution has not been tested.`,
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
