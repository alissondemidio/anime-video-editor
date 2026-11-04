import { test, expect } from "@playwright/test";
import { createCanvas } from "@napi-rs/canvas";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { encodeWav } from "../../src/audio/mixer.js";
import { resolveBinary } from "../../src/server/media-tools.js";
import type { Project } from "../../src/shared/types.js";

test("five-character workflow: media, timeline, narration, reopen and two playable exports", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const fixtureDir = path.resolve("work/e2e-fixtures");
  await mkdir(fixtureDir, { recursive: true });
  const images: string[] = [];
  for (let i = 0; i < 5; i++) {
    const c = createCanvas(480, 640),
      ctx = c.getContext("2d");
    ctx.fillStyle = ["#314c56", "#65424f", "#444467", "#586044", "#644b32"][i]!;
    ctx.fillRect(0, 0, 480, 640);
    ctx.fillStyle = "#f9e8d1";
    ctx.beginPath();
    ctx.arc(240, 220, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#18232e";
    ctx.beginPath();
    ctx.moveTo(100, 640);
    ctx.lineTo(150, 330);
    ctx.lineTo(330, 330);
    ctx.lineTo(380, 640);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ff6547";
    ctx.fillRect(120, 350, 240, 28);
    ctx.font = "bold 35px sans-serif";
    ctx.fillStyle = "white";
    ctx.fillText(`ORIGINAL ${i + 1}`, 100, 570);
    const file = path.join(fixtureDir, `character-${i + 1}.png`);
    await writeFile(file, c.toBuffer("image/png"));
    images.push(file);
  }
  const samples = new Float32Array(48000 * 6);
  for (let i = 0; i < samples.length; i++) {
    const t = i / 48000;
    const on = (t > 0.4 && t < 2.3) || (t > 3 && t < 5.7);
    samples[i] = on
      ? 0.25 *
        Math.sin(2 * Math.PI * 180 * t) *
        (0.65 + 0.35 * Math.sin(2 * Math.PI * 4 * t))
      : 0;
  }
  const narration = path.join(fixtureDir, "voice-test.wav");
  await writeFile(
    narration,
    encodeWav({ sampleRate: 48000, channels: [samples, samples] }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeVisible();
  await page.getByTitle("Open project browser").click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Workflow verification");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.locator(".entry-card")).toHaveCount(5);
  await page.locator("input[type=file]").first().setInputFiles(images);
  await expect(page.getByText("5 assets imported")).toBeVisible();
  await page.getByTitle("Story content").click();
  for (let i = 0; i < 5; i++) {
    await page.locator(".entry-card").nth(i).click();
    await page
      .getByLabel("Character image / video", { exact: true })
      .selectOption({ label: `character-${i + 1}.png` });
  }
  await page
    .getByRole("button", { name: "Generate sequence", exact: true })
    .click();
  await page.getByTitle("Music and narration").click();
  await page.getByTitle("Use Paper Lanterns").click();
  await page.locator("input[type=file]").nth(1).setInputFiles(narration);
  await expect(page.getByText("1 narration file imported")).toBeVisible();
  await page.locator(".track-row.narration .timeline-clip").click();
  await page.getByLabel("Start (s)", { exact: true }).fill("2.5");
  await page.getByLabel("Fade in (s)", { exact: true }).fill("0.2");
  await page.getByLabel("Fade out (s)", { exact: true }).fill("0.4");
  await page.getByLabel("Ducking strength", { exact: true }).fill("0.7");
  // Timeline edits through actual pointer interaction and undo.
  const clip = page.locator(".track-row.narration .timeline-clip");
  const before = await clip.boundingBox();
  expect(before).toBeTruthy();
  await page.mouse.move(
    before!.x + before!.width / 2,
    before!.y + before!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    before!.x + before!.width / 2 + 42,
    before!.y + before!.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(page.getByLabel("Start (s)", { exact: true })).toHaveValue(
    "4.5",
  );
  await page.getByTitle("Undo (Ctrl+Z)").click();
  await expect(page.getByLabel("Start (s)", { exact: true })).toHaveValue(
    "2.5",
  );
  const saveResponse = page.waitForResponse(
    (r) => r.url().includes("/api/projects/") && r.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = (await (await saveResponse).json()) as Project;
  expect(saved.entries).toHaveLength(5);
  expect(saved.entries.every((e) => e.mediaId)).toBeTruthy();
  expect(saved.clips.find((c) => c.trackId === "narration")?.start).toBe(2.5);
  expect(saved.audio.ducking.enabled).toBe(true);
  await page.reload();
  await page.getByTitle("Open project browser").click();
  await page
    .locator(".project-list button")
    .filter({ hasText: "Workflow verification" })
    .first()
    .click();
  await page.getByTitle("Music and narration").click();
  expect(
    (await (await request.get(`/api/projects/${saved.id}`)).json()).clips.some(
      (c: any) => c.trackId === "narration",
    ),
  ).toBe(true);
  await page.getByTitle("Play (Space)").click();
  await expect(page.getByTitle("Pause (Space)")).toBeVisible();
  await page.waitForTimeout(600);
  await page.getByTitle("Pause (Space)").click();
  await page.screenshot({ path: "work/e2e-editor.png" });
  for (const mode of ["music-narration", "music"] as const) {
    await page
      .getByRole("button", { name: "Export video", exact: true })
      .click();
    await page.getByLabel("Audio included", { exact: true }).selectOption(mode);
    await page
      .getByLabel("Quality · 30 FPS", { exact: true })
      .selectOption("draft");
    const started = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/exports") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Export MP4", exact: true }).click();
    const job = await (await started).json();
    await expect(
      page.getByText("Your video is ready", { exact: true }),
    ).toBeVisible({ timeout: 180000 });
    const res = await request.get(`/api/exports/${job.id}/file`);
    expect(res.ok()).toBeTruthy();
    const output = path.resolve(`work/e2e-${mode}.mp4`);
    await writeFile(output, await res.body());
    const probe = spawnSync(
      resolveBinary("ffprobe"),
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
      { encoding: "utf8" },
    );
    expect(probe.status).toBe(0);
    const info = JSON.parse(probe.stdout);
    expect(
      info.streams.find((s: any) => s.codec_type === "video"),
    ).toMatchObject({
      codec_name: "h264",
      width: 1280,
      height: 720,
      avg_frame_rate: "30/1",
    });
    expect(
      info.streams.find((s: any) => s.codec_type === "audio").codec_name,
    ).toBe("aac");
    expect(Number(info.format.duration)).toBeCloseTo(35, 0);
    await writeFile(
      `work/e2e-${mode}-probe.json`,
      JSON.stringify(info, null, 2),
    );
    await page.getByTitle("Close export dialog").click();
  }
  // Reuse the same template and replace one asset while retaining all clip references.
  await page.getByTitle("Media library").click();
  const replacement = page.waitForResponse(
    (r) => r.url().endsWith("/api/assets") && r.request().method() === "POST",
  );
  await page
    .locator(".asset-card")
    .first()
    .getByTitle("Replace asset everywhere")
    .click();
  await page.locator("input[type=file]").first().setInputFiles(images[4]!);
  await replacement;
  await page.getByTitle("Story content").click();
  await page.locator(".entry-card").first().click();
  await page.getByLabel("Name", { exact: true }).fill("New season hero");
  await page
    .getByRole("button", { name: "Generate sequence", exact: true })
    .click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Project saved locally")).toBeVisible();
  expect(errors).toEqual([]);
});
