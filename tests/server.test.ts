import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createCanvas } from "@napi-rs/canvas";
import { createApp } from "../src/server/app.js";

test("project persistence, duplicate, managed imports, invalid input and local request safety", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kuro-api-"));
  try {
    const api = request(createApp({ dataDir }));
    const created = await api
      .post("/api/projects")
      .send({ template: "ranking", title: "Persisted story" })
      .expect(201);
    const project = created.body;
    assert.equal(project.entries.length, 5);
    const canvas = createCanvas(32, 32);
    canvas.getContext("2d").fillRect(0, 0, 32, 32);
    const imported = await api
      .post("/api/assets")
      .attach("files", canvas.toBuffer("image/png"), "character.png")
      .expect(201);
    assert.equal(imported.body[0].kind, "image");
    const asset = imported.body[0];
    assert.ok(asset.path.startsWith(path.join(dataDir, "assets")));
    project.assets.push(asset);
    project.entries[0].mediaId = asset.id;
    await api.put(`/api/projects/${project.id}`).send(project).expect(200);
    const restarted = request(createApp({ dataDir }));
    const loaded = await restarted
      .get(`/api/projects/${project.id}`)
      .expect(200);
    assert.equal(loaded.body.title, "Persisted story");
    assert.equal(loaded.body.assets[0].id, asset.id);
    const served = await restarted.get(asset.url).expect(200);
    assert.match(served.headers["content-type"], /image\/png/);
    assert.ok((await readFile(asset.path)).length > 0);
    const duplicate = await restarted
      .post(`/api/projects/${project.id}/duplicate`)
      .expect(201);
    assert.notEqual(duplicate.body.id, project.id);
    await restarted.delete(`/api/projects/${project.id}`).expect(204);
    await restarted.get(asset.url).expect(200);
    const list = await restarted.get("/api/projects").expect(200);
    assert.equal(list.body.length, 1);
    await restarted
      .put(`/api/projects/${duplicate.body.id}`)
      .send({ id: duplicate.body.id })
      .expect(400);
    await restarted
      .post("/api/projects")
      .set("Origin", "https://attacker.example")
      .send({})
      .expect(403);
    await restarted
      .get("/api/projects")
      .set("Host", "attacker.example")
      .expect(403);
    await restarted.get("/api/assets/..%2Fsecret/file").expect(400);
    const poisoned = duplicate.body;
    poisoned.assets.push({ ...asset, id: "unknown", path: "/etc/passwd" });
    await restarted
      .put(`/api/projects/${poisoned.id}`)
      .send(poisoned)
      .expect(400);
    await restarted
      .post("/api/exports")
      .send({ project: duplicate.body, outputPath: "/tmp/unsafe.mp4" })
      .expect(400);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("preview emits a real mixed WAV and saving supports a new client-created project", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kuro-preview-"));
  try {
    const api = request(createApp({ dataDir }));
    const { createProject, createClip } = await import("../src/core/model.js");
    const project = createProject("analysis", "Preview test");
    project.clips = project.clips
      .slice(0, 1)
      .map((c) => ({ ...c, duration: 0.3 }));
    const music = (await api.get("/api/music").expect(200)).body[0];
    project.assets = [
      {
        id: music.id,
        name: music.name,
        kind: "audio",
        path: "ignored",
        url: music.file,
        mime: "audio/wav",
        duration: music.duration,
        size: 0,
        builtin: true,
      },
    ];
    const clip = createClip("music", 0, 0.3, music.name);
    clip.assetId = music.id;
    project.clips.push(clip);
    await api.put(`/api/projects/${project.id}`).send(project).expect(200);
    const preview = await api
      .post("/api/audio/preview")
      .send(project)
      .expect(200);
    assert.match(preview.headers["content-type"], /audio\/wav/);
    const body = preview.body as Buffer;
    assert.equal(body.toString("ascii", 0, 4), "RIFF");
    assert.ok(body.length > 10000);
    assert.ok(
      body.subarray(44).some((byte) => byte !== 0),
      "music preview has sound samples",
    );
    const narration = project.tracks.find((t) => t.kind === "narration")!;
    narration.solo = true;
    narration.muted = true;
    const mutedSoloPreview = await api
      .post("/api/audio/preview")
      .send(project)
      .expect(200);
    assert.ok(
      (mutedSoloPreview.body as Buffer).subarray(44).some((byte) => byte !== 0),
      "muted solo narration does not suppress audible music",
    );
    project.audio.mode = "silent";
    const silent = await api
      .post("/api/audio/preview")
      .send(project)
      .expect(200);
    assert.ok((silent.body as Buffer).subarray(44).every((byte) => byte === 0));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("asynchronous export completes with playable download, cancellation and render errors", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kuro-jobs-"));
  const app = createApp({ dataDir });
  try {
    const api = request(app);
    const { createProject } = await import("../src/core/model.js");
    const { probeMedia } = await import("../src/server/media-tools.js");
    const project = createProject("ranking");
    project.width = 320;
    project.height = 180;
    project.audio.mode = "silent";
    project.clips = project.clips
      .slice(0, 4)
      .map((c) => ({ ...c, duration: 0.2 }));
    const submitted = (
      await api.post("/api/exports").send({ project }).expect(202)
    ).body;
    async function terminal(id: string) {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const job = (await api.get(`/api/exports/${id}`).expect(200)).body;
        if (["complete", "error", "cancelled"].includes(job.status)) return job;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error("Export job did not settle");
    }
    const complete = await terminal(submitted.id);
    assert.equal(complete.status, "complete", complete.error);
    assert.equal(complete.progress, 1);
    const media = await probeMedia(complete.outputPath);
    assert.equal(media.kind, "video");
    assert.equal(media.width, 320);
    await api
      .get(complete.downloadUrl)
      .expect("Content-Disposition", /filename="?kuro-studio\.mp4"?/)
      .expect(200)
      .expect("Content-Type", /video\/mp4/);
    project.clips.forEach((c) => {
      c.duration = 10;
    });
    const cancelled = (
      await api.post("/api/exports").send({ project }).expect(202)
    ).body;
    const cancelResponse = (
      await api.delete(`/api/exports/${cancelled.id}`).expect(200)
    ).body;
    assert.equal(cancelResponse.status, "cancelled");
    await api.get(`/api/exports/${cancelled.id}/file`).expect(409);
    project.width = 321;
    const broken = (
      await api.post("/api/exports").send({ project }).expect(202)
    ).body;
    const failed = await terminal(broken.id);
    assert.equal(failed.status, "error");
    assert.match(failed.error, /even integers/);
    await api.get("/api/exports/missing").expect(404);
  } finally {
    app.locals.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await rm(dataDir, { recursive: true, force: true });
  }
});
