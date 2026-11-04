import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { validateProject } from "../core/model.js";
import type { Asset, Project } from "../shared/types.js";

export function defaultDataDir(): string {
  return (
    process.env.ANIME_STUDIO_DATA ||
    path.join(
      process.platform === "win32"
        ? process.env.APPDATA || os.homedir()
        : process.platform === "darwin"
          ? path.join(os.homedir(), "Library", "Application Support")
          : process.env.XDG_DATA_HOME ||
            path.join(os.homedir(), ".local", "share"),
      "Kuro Studio",
    )
  );
}
export function safeId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    throw Object.assign(new Error("Invalid identifier"), { status: 400 });
  return value;
}
export async function atomicJson(file: string, value: unknown): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}
export class Storage {
  readonly root: string;
  readonly ready: Promise<void>;
  constructor(root = defaultDataDir()) {
    this.root = path.resolve(root);
    this.ready = Promise.all(
      ["projects", "assets", "exports", "uploads"].map((dir) =>
        fs.mkdir(path.join(this.root, dir), { recursive: true }),
      ),
    ).then(() => undefined);
  }
  projectPath(id: string): string {
    return path.join(this.root, "projects", `${safeId(id)}.json`);
  }
  async read(id: string): Promise<Project> {
    await this.ready;
    return validateProject(
      JSON.parse(await fs.readFile(this.projectPath(id), "utf8")),
    );
  }
  async save(project: Project): Promise<Project> {
    await this.ready;
    const valid = validateProject(project);
    safeId(valid.id);
    valid.updatedAt = new Date().toISOString();
    await atomicJson(this.projectPath(valid.id), valid);
    return valid;
  }
  async assets(): Promise<Asset[]> {
    await this.ready;
    const entries = await fs.readdir(path.join(this.root, "assets"));
    const values = await Promise.all(
      entries
        .filter((f) => /^[\w-]+\.json$/.test(f))
        .map(async (file) => {
          try {
            return JSON.parse(
              await fs.readFile(path.join(this.root, "assets", file), "utf8"),
            ) as Asset;
          } catch {
            return null;
          }
        }),
    );
    return values.filter((a): a is Asset => a !== null);
  }
  async asset(id: string): Promise<Asset> {
    await this.ready;
    return JSON.parse(
      await fs.readFile(
        path.join(this.root, "assets", `${safeId(id)}.json`),
        "utf8",
      ),
    ) as Asset;
  }
}
