import express from "express";
import multer from "multer";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Storage, atomicJson, safeId } from "./storage.js";
import {
  createProject,
  validateProject,
  projectDuration,
} from "../core/model.js";
import { MUSIC_LIBRARY, synthesizeMusic } from "../audio/music.js";
import { mixAudio, encodeWav, type PCM } from "../audio/mixer.js";
import { probeMedia, decodeAudio, readWaveform } from "./media-tools.js";
import type { Asset, ExportJob, Project, TemplateId } from "../shared/types.js";

export interface AppOptions {
  dataDir?: string;
  publicDir?: string;
  uiDir?: string;
  allowExportPath?: (file: string) => boolean;
}
const httpError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });
const loopback = (name: string) =>
  ["localhost", "127.0.0.1", "[::1]", "::1"].includes(name);
export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  const storage = new Storage(options.dataDir);
  const publicDir = path.resolve(
    options.publicDir ||
      path.join(process.env.KURO_RESOURCE_DIR || process.cwd(), "public"),
  );
  const uiDir = path.resolve(
    options.uiDir ||
      path.join(process.env.KURO_RESOURCE_DIR || process.cwd(), "dist/ui"),
  );
  const jobs = new Map<string, ExportJob>();
  const downloadNames = new Map<string, string>();
  const controllers = new Map<string, AbortController>();
  const audioCache = new Map<string, Promise<PCM>>();
  let renderQueue = Promise.resolve();
  app.locals.shutdown = () => {
    for (const controller of controllers.values()) controller.abort();
  };
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    // Reject DNS rebinding and cross-origin browser writes to this local service.
    const host = req.headers.host;
    if (host) {
      try {
        if (!loopback(new URL(`http://${host}`).hostname)) throw new Error();
      } catch {
        return next(httpError(403, "Local host required"));
      }
    }
    const origin = req.headers.origin;
    if (origin) {
      try {
        const url = new URL(origin);
        if (
          !loopback(url.hostname) ||
          !["http:", "https:"].includes(url.protocol)
        )
          throw new Error();
      } catch {
        return next(httpError(403, "Local origin required"));
      }
    }
    if (req.headers["sec-fetch-site"] === "cross-site")
      return next(httpError(403, "Cross-site requests are not allowed"));
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use(express.json({ limit: "50mb" }));
  const upload = multer({
    storage: multer.diskStorage({
      destination: path.join(storage.root, "uploads"),
      filename(_req, file, callback) {
        const ext = path.extname(file.originalname).toLowerCase();
        callback(
          null,
          `${randomUUID()}${/^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ""}`,
        );
      },
    }),
    limits: { fileSize: 512 * 1024 * 1024, files: 30, fields: 10 },
  });
  app.use("/api", async (_req, _res, next) => {
    try {
      await storage.ready;
      next();
    } catch (error) {
      next(error);
    }
  });

  async function canonicalProject(input: unknown): Promise<Project> {
    const project = validateProject(input);
    safeId(project.id);
    project.assets = await Promise.all(
      project.assets.map(async (asset) => {
        if (asset.builtin) {
          const music = MUSIC_LIBRARY.find((m) => m.id === asset.id);
          if (!music) throw httpError(400, "Unknown built-in music");
          return {
            ...asset,
            kind: "audio" as const,
            path: path.join(publicDir, music.file.replace(/^\//, "")),
            url: music.file,
          };
        }
        try {
          return await storage.asset(asset.id);
        } catch {
          throw httpError(400, `Import asset before using it: ${asset.name}`);
        }
      }),
    );
    return project;
  }
  function resolveAsset(asset: Asset): string {
    if (asset.builtin) {
      const music = MUSIC_LIBRARY.find((m) => m.id === asset.id);
      if (!music) throw new Error("Unknown music");
      return path.join(publicDir, music.file.replace(/^\//, ""));
    }
    // Project paths were replaced with trusted registry entries by canonicalProject.
    return asset.path;
  }
  app.get("/api/projects", async (_req, res) => {
    const files = await fs.readdir(path.join(storage.root, "projects"));
    const projects = await Promise.all(
      files
        .filter((f) => /^[\w-]+\.json$/.test(f))
        .map(async (f) => {
          try {
            return await storage.read(f.slice(0, -5));
          } catch {
            return null;
          }
        }),
    );
    res.json(
      projects
        .filter((p): p is Project => p !== null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((p) => ({
          id: p.id,
          title: p.title,
          template: p.template,
          updatedAt: p.updatedAt,
          duration: projectDuration(p),
        })),
    );
  });
  app.post("/api/projects", async (req, res) => {
    const { template = "ranking", title } = req.body || {};
    if (
      !["ranking", "analysis", "comparison"].includes(template) ||
      (title !== undefined && typeof title !== "string")
    )
      throw httpError(400, "Invalid project template or title");
    res
      .status(201)
      .json(await storage.save(createProject(template as TemplateId, title)));
  });
  app.get("/api/projects/:id", async (req, res) => {
    res.json(await storage.read(req.params.id));
  });
  app.put("/api/projects/:id", async (req, res) => {
    safeId(req.params.id);
    if (req.body?.id !== req.params.id)
      throw httpError(400, "Project ID does not match URL");
    res.json(await storage.save(await canonicalProject(req.body)));
  });
  app.delete("/api/projects/:id", async (req, res) => {
    await fs.unlink(storage.projectPath(req.params.id));
    res.status(204).end();
  });
  app.post("/api/projects/:id/duplicate", async (req, res) => {
    const project = await storage.read(req.params.id);
    project.id = randomUUID();
    project.title += " (copy)";
    project.createdAt = new Date().toISOString();
    res.status(201).json(await storage.save(project));
  });
  app.post("/api/assets", upload.array("files", 30), async (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files?.length) throw httpError(400, "Choose at least one media file");
    const assets: Asset[] = [];
    try {
      for (const file of files) {
        const metadata = await probeMedia(file.path).catch(() => {
          throw httpError(
            400,
            `Could not read supported media: ${file.originalname}`,
          );
        });
        const id = randomUUID();
        const extension = path.extname(file.originalname).toLowerCase();
        const allowed = new Set([
          ".png",
          ".jpg",
          ".jpeg",
          ".webp",
          ".gif",
          ".mp4",
          ".webm",
          ".mov",
          ".mkv",
          ".mp3",
          ".wav",
          ".ogg",
          ".m4a",
          ".aac",
          ".flac",
        ]);
        if (!allowed.has(extension))
          throw httpError(400, "Unsupported media extension");
        const destination = path.join(
          storage.root,
          "assets",
          `${id}${extension}`,
        );
        await fs.rename(file.path, destination);
        const asset: Asset = {
          id,
          name: path.basename(file.originalname).slice(0, 240),
          kind: metadata.kind,
          path: destination,
          url: `/api/assets/${id}/file`,
          mime: metadata.mime,
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          size: file.size,
        };
        assets.push(asset);
        if (asset.kind === "audio" || asset.kind === "video")
          asset.waveform = await readWaveform(destination).catch(() => []);
        await atomicJson(
          path.join(storage.root, "assets", `${id}.json`),
          asset,
        );
      }
      res.status(201).json(assets);
    } catch (error) {
      await Promise.all(
        assets.flatMap((a) => [
          fs.rm(a.path, { force: true }),
          fs.rm(path.join(storage.root, "assets", `${a.id}.json`), {
            force: true,
          }),
        ]),
      );
      throw error;
    } finally {
      await Promise.all(files.map((f) => fs.rm(f.path, { force: true })));
    }
  });
  app.get("/api/assets/:id/file", async (req, res) => {
    const asset = await storage.asset(req.params.id);
    res.type(asset.mime).sendFile(asset.path);
  });
  app.get("/api/music", (_req, res) => {
    res.json(MUSIC_LIBRARY);
  });
  app.post("/api/audio/preview", async (req, res) => {
    const project = await canonicalProject(req.body);
    const sources = new Map<string, PCM>();
    const audioTracks = project.tracks.filter(
      (t) => t.kind === "music" || t.kind === "narration",
    );
    const solo = audioTracks.some((t) => t.solo && !t.muted);
    const enabled = new Set(
      audioTracks
        .filter(
          (t) =>
            !t.muted &&
            (!solo || t.solo) &&
            (project.audio.mode === "music-narration" ||
              project.audio.mode === t.kind),
        )
        .map((t) => t.id),
    );
    if (project.audio.mode !== "silent")
      for (const asset of project.assets.filter(
        (a) => a.kind === "audio" || a.kind === "video",
      )) {
        if (
          !project.clips.some(
            (c) => c.assetId === asset.id && !c.muted && enabled.has(c.trackId),
          )
        )
          continue;
        const key = resolveAsset(asset);
        if (!audioCache.has(key)) {
          if (audioCache.size >= 3)
            audioCache.delete(audioCache.keys().next().value!);
          audioCache.set(
            key,
            asset.builtin
              ? Promise.resolve(synthesizeMusic(asset.id))
              : decodeAudio(key),
          );
        }
        try {
          sources.set(asset.id, await audioCache.get(key)!);
        } catch (error) {
          audioCache.delete(key);
          throw error;
        }
      }
    res
      .type("audio/wav")
      .send(Buffer.from(encodeWav(mixAudio(project, sources))));
  });
  app.post("/api/exports", async (req, res) => {
    const project = await canonicalProject(req.body?.project);
    const id = randomUUID();
    let outputPath = path.join(storage.root, "exports", `${id}.mp4`);
    if (req.body.outputPath !== undefined) {
      if (
        typeof req.body.outputPath !== "string" ||
        !path.isAbsolute(req.body.outputPath) ||
        path.extname(req.body.outputPath).toLowerCase() !== ".mp4" ||
        !options.allowExportPath?.(req.body.outputPath)
      )
        throw httpError(
          400,
          "Choose an MP4 output path using the desktop save dialog",
        );
      outputPath = req.body.outputPath;
    }
    const job: ExportJob = {
      id,
      status: "queued",
      progress: 0,
      message: "Waiting to render",
      outputPath,
    };
    const controller = new AbortController();
    jobs.set(id, job);
    const fileName =
      path
        .basename(project.export.outputName)
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
        .replace(/\.mp4$/i, "") || "Kuro-export";
    downloadNames.set(id, `${fileName}.mp4`);
    controllers.set(id, controller);
    renderQueue = renderQueue
      .then(async () => {
        if (controller.signal.aborted) {
          controllers.delete(id);
          return;
        }
        job.status = "rendering";
        job.message = "Preparing render";
        try {
          const { renderProject } = await import("./render.js");
          await renderProject(project, {
            outputPath,
            signal: controller.signal,
            resolveAsset,
            onProgress(progress, message) {
              if (!controller.signal.aborted) {
                job.progress = Math.min(1, Math.max(0, progress));
                job.message = message;
              }
            },
          });
          if (!controller.signal.aborted) {
            job.status = "complete";
            job.progress = 1;
            job.message = "Export complete";
            job.downloadUrl = `/api/exports/${id}/file`;
          }
        } catch (error) {
          if (controller.signal.aborted) {
            job.status = "cancelled";
            job.message = "Export cancelled";
          } else {
            job.status = "error";
            job.error = error instanceof Error ? error.message : String(error);
            job.message = job.error;
          }
        } finally {
          controllers.delete(id);
        }
      })
      .catch(() => {});
    res.status(202).json(job);
  });
  function getJob(id: string): ExportJob {
    safeId(id);
    const job = jobs.get(id);
    if (!job) throw httpError(404, "Export not found");
    return job;
  }
  app.get("/api/exports/:id", (req, res) => {
    res.json(getJob(req.params.id));
  });
  app.delete("/api/exports/:id", (req, res) => {
    const job = getJob(req.params.id);
    if (job.status === "queued" || job.status === "rendering") {
      controllers.get(job.id)?.abort();
      job.status = "cancelled";
      job.message = "Export cancelled";
    }
    res.json(job);
  });
  app.get("/api/exports/:id/file", (req, res) => {
    const job = getJob(req.params.id);
    if (job.status !== "complete" || !job.outputPath)
      throw httpError(409, "Export is not complete");
    res.download(
      job.outputPath,
      downloadNames.get(job.id) ?? "Kuro-export.mp4",
    );
  });
  app.use(
    "/music",
    express.static(path.join(publicDir, "music"), { fallthrough: false }),
  );
  app.use(express.static(uiDir));
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api/"))
      return next(httpError(404, "Endpoint not found"));
    res.sendFile(path.join(uiDir, "index.html"));
  });
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const err = error as Error & {
        status?: number;
        code?: string;
        issues?: unknown;
      };
      const invalid =
        err instanceof multer.MulterError ||
        err.name === "ZodError" ||
        !!err.issues ||
        /^Invalid project:/.test(err.message);
      const status =
        err.status || (err.code === "ENOENT" ? 404 : invalid ? 400 : 500);
      res.status(status).json({ error: err.message || "Request failed" });
    },
  );
  return app;
}
