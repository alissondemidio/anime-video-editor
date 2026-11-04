import { _electron as electron } from "@playwright/test";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";
const root = process.cwd(),
  work = path.join(root, "work", "desktop-smoke");
for (const part of ["config", "cache", "runtime"])
  await mkdir(path.join(work, part), { recursive: true });
await chmod(path.join(work, "runtime"), 0o700);
const errors = [],
  display = ":95";
const xvfb = spawn(
  process.env.XVFB_EXECUTABLE || "Xvfb",
  [display, "-screen", "0", "1600x1100x24", "-nolisten", "tcp", "-noreset"],
  { stdio: ["ignore", "ignore", "pipe"] },
);
xvfb.stderr.on("data", (x) => errors.push(`Xvfb: ${x}`));
await new Promise((resolve) => setTimeout(resolve, 400));
let app;
try {
  app = await electron.launch({
    args: [".", "--no-sandbox", "--disable-gpu"],
    cwd: root,
    env: {
      ...process.env,
      DISPLAY: display,
      XDG_CONFIG_HOME: path.join(work, "config"),
      XDG_CACHE_HOME: path.join(work, "cache"),
      XDG_RUNTIME_DIR: path.join(work, "runtime"),
    },
    timeout: 25000,
  });
  app.process().stderr?.on("data", (x) => errors.push(x.toString()));
  const window = await app.firstWindow({ timeout: 20000 });
  window.on("pageerror", (e) => errors.push(e.message));
  await window.waitForSelector("canvas", { timeout: 20000 });
  const bridge = await window.evaluate(() => ({
    platform: window.desktop?.platform,
    chooseExportPath: typeof window.desktop?.chooseExportPath,
    nodeRequire: typeof window.require,
  }));
  assert.equal(bridge.platform, "linux");
  assert.equal(bridge.chooseExportPath, "function");
  assert.equal(bridge.nodeRequire, "undefined");
  const preferences = await app.evaluate(({ BrowserWindow }) => {
    const p =
      BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return {
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
      sandbox: p.sandbox,
    };
  });
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.sandbox, true);
  const workflow = await window.evaluate(async () => {
    const api = async (url, method = "GET", body) => {
      const r = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) throw new Error(`${url} ${r.status}: ${await r.text()}`);
      return r.json();
    };
    const p = await api("/api/projects", "POST", {
      template: "ranking",
      title: "Actual Electron smoke",
    });
    p.width = 320;
    p.height = 180;
    p.audio.mode = "silent";
    p.clips = p.clips
      .filter((c) => c.start === 0)
      .map((c) => ({ ...c, duration: 0.2 }));
    p.scenes = p.scenes
      .filter((s) => s.start === 0)
      .map((s) => ({ ...s, duration: 0.2 }));
    const saved = await api(`/api/projects/${p.id}`, "PUT", p),
      reopened = await api(`/api/projects/${p.id}`);
    if (reopened.title !== p.title || reopened.id !== saved.id)
      throw new Error("Project reopen differs");
    const submitted = await api("/api/exports", "POST", { project: reopened });
    let job = submitted;
    for (let i = 0; i < 300; i++) {
      job = await api(`/api/exports/${submitted.id}`);
      if (["complete", "error", "cancelled"].includes(job.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (job.status !== "complete")
      throw new Error(`Desktop export failed ${JSON.stringify(job)}`);
    const download = await fetch(job.downloadUrl);
    const bytes = new Uint8Array(await download.arrayBuffer());
    if (!download.ok || new TextDecoder().decode(bytes.slice(4, 8)) !== "ftyp")
      throw new Error("Export download is not MP4");
    return {
      projectId: reopened.id,
      title: reopened.title,
      status: job.status,
      outputPath: job.outputPath,
      bytes: bytes.length,
    };
  });
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        workflow.outputPath,
      ],
      { encoding: "utf8" },
    ),
  );
  assert.equal(probe.streams[0].codec_name, "h264");
  assert.equal(probe.streams[0].width, 320);
  assert.equal(probe.streams[0].height, 180);
  await window
    .getByRole("button", { name: "Save project", exact: true })
    .click();
  await window.getByText("Saved locally", { exact: true }).waitFor();
  await window.screenshot({ path: path.join(work, "desktop.png") });
  const result = {
    url: window.url(),
    title: await window.title(),
    bridge,
    preferences,
    workflow,
    probe,
  };
  await writeFile(
    path.join(work, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (e) {
  console.error(e.stack);
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch((e) => errors.push(`close: ${e}`));
  xvfb.kill("SIGTERM");
  await writeFile(path.join(work, "stderr.log"), errors.join("\n"));
}
