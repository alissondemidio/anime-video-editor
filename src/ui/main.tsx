import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Copy,
  Download,
  Expand,
  Film,
  FolderOpen,
  GripVertical,
  HelpCircle,
  ImagePlus,
  Layers,
  LoaderCircle,
  Maximize2,
  Mic,
  MoreHorizontal,
  MousePointer2,
  Music2,
  Pause,
  Play,
  Plus,
  Redo2,
  Save,
  Scissors,
  Search,
  Settings2,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  createProject,
  defaultAnimation,
  generateSequence,
  projectDuration,
  replaceAsset,
} from "../core/model";
import { renderFrame } from "../core/render";
import { clipWaveform } from "./waveform";
import type {
  Asset,
  Clip,
  ContentEntry,
  ExportJob,
  MusicOption,
  Project,
  ProjectSummary,
  TemplateId,
} from "../shared/types";
import "./styles.css";

declare global {
  interface Window {
    desktop?: { chooseExportPath(name: string): Promise<string | null> };
  }
}
const uid = () => crypto.randomUUID();
const fmt = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
const frames = (s: number) =>
  `${fmt(s)}:${Math.floor((s % 1) * 30)
    .toString()
    .padStart(2, "0")}`;
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  if (!r.ok) {
    let message = await r.text();
    try {
      message = JSON.parse(message).error || message;
    } catch {}
    throw new Error(message || r.statusText);
  }
  return r.json() as Promise<T>;
}
const json = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const templateNames: Record<TemplateId, string> = {
  ranking: "Character ranking",
  analysis: "Character analysis",
  comparison: "Head to head",
};
const options = {
  camera: [
    "none",
    "zoom-in",
    "zoom-out",
    "pan-x",
    "pan-y",
    "zoom-pan",
    "parallax",
    "shake",
  ],
  reveal: ["fade", "slide", "scale", "blur", "mask", "character"],
  text: ["words", "lines", "typewriter", "kinetic", "scale", "ranking"],
  transition: ["crossfade", "wipe", "zoom", "blur", "match", "flash"],
  easing: ["linear", "ease-in", "ease-out", "ease-in-out", "back"],
};
function App() {
  const [project, setProject] = useState<Project>(() =>
    createProject("ranking", "Legends of the Astral Realm"),
  );
  const projectRef = useRef(project);
  projectRef.current = project;
  const [past, setPast] = useState<Project[]>([]),
    [future, setFuture] = useState<Project[]>([]);
  const [saved, setSaved] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"content" | "media" | "music">("content"),
    [selected, setSelected] = useState(""),
    [activeEntry, setActiveEntry] = useState("");
  const [time, setTime] = useState(1.2),
    [playing, setPlaying] = useState(false),
    [zoom, setZoom] = useState(21),
    [browser, setBrowser] = useState(false),
    [projects, setProjects] = useState<ProjectSummary[]>([]),
    [newTitle, setNewTitle] = useState("Untitled story"),
    [newTemplate, setNewTemplate] = useState<TemplateId>("ranking");
  const [exportOpen, setExportOpen] = useState(false),
    [job, setJob] = useState<ExportJob | null>(null),
    [help, setHelp] = useState(false),
    [music, setMusic] = useState<MusicOption[]>([]),
    [query, setQuery] = useState("");
  const [previewMusic, setPreviewMusic] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    media = useRef(new Map<string, CanvasImageSource>()),
    videos = useRef(new Map<string, HTMLVideoElement>()),
    audio = useRef<HTMLAudioElement | null>(null),
    audition = useRef<HTMLAudioElement | null>(null),
    audioUrl = useRef(""),
    audioRevision = useRef("");
  const timeRef = useRef(1.2),
    playingRef = useRef(false),
    input = useRef<HTMLInputElement>(null),
    narrationInput = useRef<HTMLInputElement>(null),
    replaceId = useRef("");
  const duration = projectDuration(project);
  const clip = project.clips.find((c) => c.id === selected);
  const entry =
    project.entries.find((e) => e.id === activeEntry) || project.entries[0];
  const dirty = JSON.stringify(project) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const protectUnsaved = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnsaved);
    return () => window.removeEventListener("beforeunload", protectUnsaved);
  }, [dirty]);
  function update(fn: (p: Project) => Project, history = true) {
    setProject((p) => {
      if (history) {
        setPast((h) => [...h.slice(-49), p]);
        setFuture([]);
      }
      return { ...fn(p), updatedAt: new Date().toISOString() };
    });
  }
  function undo() {
    setPast((h) => {
      if (!h.length) return h;
      setFuture((f) => [projectRef.current, ...f]);
      setProject(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }
  function redo() {
    setFuture((f) => {
      if (!f.length) return f;
      setPast((h) => [...h, projectRef.current]);
      setProject(f[0]);
      return f.slice(1);
    });
  }
  function seek(t: number) {
    const bounded = Math.max(0, Math.min(duration, t));
    timeRef.current = bounded;
    setTime(bounded);
    if (audio.current) audio.current.currentTime = bounded;
  }
  function patchClip(patch: Partial<Clip>) {
    if (!clip) return;
    update((p) => ({
      ...p,
      clips: p.clips.map((c) => (c.id === clip.id ? { ...c, ...patch } : c)),
    }));
  }
  function patchEntry(patch: Partial<ContentEntry>) {
    if (!entry) return;
    update((p) => ({
      ...p,
      entries: p.entries.map((e) =>
        e.id === entry.id ? { ...e, ...patch } : e,
      ),
      clips: p.clips.map((c) => {
        if (
          c.entryId !== entry.id ||
          p.tracks.find((t) => t.id === c.trackId)?.kind !== "media"
        )
          return c;
        const secondary =
          c.mediaRole === "secondary" ||
          (!c.mediaRole && c.id.endsWith("-secondary"));
        if (secondary && "secondaryMediaId" in patch)
          return {
            ...c,
            assetId: patch.secondaryMediaId,
            mediaRole: "secondary",
          };
        if (!secondary && "mediaId" in patch)
          return { ...c, assetId: patch.mediaId, mediaRole: "primary" };
        return c;
      }),
    }));
  }
  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : String(e));
    setBusy("");
  }
  async function save() {
    setBusy("Saving project");
    try {
      const p = await api<Project>(
        `/api/projects/${project.id}`,
        json("PUT", project),
      );
      setProject(p);
      setSaved(JSON.stringify(p));
      setNotice("Project saved locally");
      setBusy("");
    } catch (e) {
      fail(e);
    }
  }
  async function openBrowser() {
    setBrowser(true);
    try {
      setProjects(await api<ProjectSummary[]>("/api/projects"));
    } catch (e) {
      fail(e);
    }
  }
  async function openProject(id: string) {
    try {
      const p = await api<Project>(`/api/projects/${id}`);
      setProject(p);
      setSaved(JSON.stringify(p));
      setPast([]);
      setFuture([]);
      setSelected("");
      setBrowser(false);
      seek(0);
      setPlaying(false);
    } catch (e) {
      fail(e);
    }
  }
  async function newProject() {
    try {
      const p = await api<Project>(
        "/api/projects",
        json("POST", { template: newTemplate, title: newTitle }),
      );
      setProject(p);
      setSaved(JSON.stringify(p));
      setPast([]);
      setFuture([]);
      setBrowser(false);
      seek(0);
      setSelected("");
    } catch (e) {
      fail(e);
    }
  }
  async function duplicate() {
    try {
      await api<Project>(`/api/projects/${project.id}`, json("PUT", project));
      const next = await api<Project>(`/api/projects/${project.id}/duplicate`, {
        method: "POST",
      });
      setProject(next);
      setSaved(JSON.stringify(next));
      setPast([]);
      setNotice("Created a project copy");
    } catch (e) {
      fail(e);
    }
  }
  async function importFiles(files: FileList | File[], narration = false) {
    if (!files.length) return;
    setBusy("Importing media");
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const assets = await api<Asset[]>("/api/assets", {
        method: "POST",
        body: form,
      });
      const narrationClips = narration
        ? assets
            .filter((a) => a.kind === "audio")
            .map((a) => makeAudioClip(a, "narration", time))
        : [];
      update((p) => {
        let next = {
          ...p,
          assets: [...p.assets, ...assets],
          clips: [...p.clips],
        };
        if (replaceId.current && assets[0]) {
          next = replaceAsset(p, replaceId.current, assets[0]);
          replaceId.current = "";
        } else if (narration) {
          next.clips.push(...narrationClips);
        }
        return next;
      });
      if (narrationClips[0]) setSelected(narrationClips[0].id);
      setTab(narration ? "music" : "media");
      setBusy("");
      setNotice(
        `${assets.length} ${narration ? "narration file" : "asset"}${assets.length === 1 ? "" : "s"} imported`,
      );
    } catch (e) {
      fail(e);
    }
  }
  function makeAudioClip(a: Asset, trackId: string, start = 0): Clip {
    start = Math.min(7199.9, Math.max(0, start));
    return {
      id: uid(),
      trackId,
      assetId: a.id,
      label: a.name,
      start,
      duration: Math.max(
        0.1,
        Math.min(
          7200 - start,
          a.duration || duration,
          Math.max(1, duration - start),
        ),
      ),
      trimStart: 0,
      volume: trackId === "music" ? 0.3 : 1,
      muted: false,
      fadeIn: 0.3,
      fadeOut: 0.5,
      loop: trackId === "music",
      normalize: trackId === "narration",
      fit: "cover",
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      animation: defaultAnimation(),
    };
  }
  function addAudio(a: Asset, trackId: string) {
    const c = makeAudioClip(a, trackId, time);
    update((p) => ({ ...p, clips: [...p.clips, c] }));
    setSelected(c.id);
    setNotice(`Added to ${trackId} track`);
  }
  async function useMusic(m: MusicOption) {
    const a: Asset = {
      id: m.id,
      name: m.name,
      kind: "audio",
      path: `public/music/${m.id}.wav`,
      url: m.file,
      mime: "audio/wav",
      duration: m.duration,
      size: 0,
      builtin: true,
    };
    try {
      const context = new AudioContext();
      try {
        const buffer = await context.decodeAudioData(
          await (await fetch(m.file)).arrayBuffer(),
        );
        const samples = buffer.getChannelData(0);
        a.waveform = Array.from({ length: 160 }, (_, i) => {
          const start = Math.floor((i * samples.length) / 160),
            end = Math.floor(((i + 1) * samples.length) / 160);
          let peak = 0;
          for (let n = start; n < end; n++)
            peak = Math.max(peak, Math.abs(samples[n]));
          return peak;
        });
      } finally {
        await context.close();
      }
    } catch (e) {
      fail(e);
      return;
    }
    const c = makeAudioClip(a, "music", 0);
    c.duration = duration;
    update((p) => ({
      ...p,
      assets: p.assets.some((x) => x.id === a.id) ? p.assets : [...p.assets, a],
      clips: [...p.clips.filter((x) => x.trackId !== "music"), c],
    }));
    setSelected(c.id);
    setNotice(`${m.name} added to your story`);
  }
  function assign(a: Asset) {
    if (a.kind === "audio") {
      addAudio(a, "music");
      return;
    }
    if (!entry) return;
    patchEntry({ mediaId: a.id });
    setNotice(`Assigned to ${entry.name}`);
  }
  async function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (time >= duration) seek(0);
    setBusy("Preparing audio");
    try {
      const revision = JSON.stringify(project);
      if (audioRevision.current !== revision) {
        const r = await fetch("/api/audio/preview", json("POST", project));
        if (!r.ok) throw new Error(await r.text());
        const blob = await r.blob();
        if (JSON.stringify(projectRef.current) !== revision) {
          setBusy("");
          return;
        }
        if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
        audioUrl.current = URL.createObjectURL(blob);
        audio.current = new Audio(audioUrl.current);
        audioRevision.current = revision;
      }
      if (JSON.stringify(projectRef.current) !== revision) {
        setBusy("");
        return;
      }
      if (audio.current) {
        audio.current.currentTime = timeRef.current;
        await audio.current.play();
        if (JSON.stringify(projectRef.current) !== revision) {
          audio.current.pause();
          setBusy("");
          return;
        }
      }
      setPlaying(true);
      setBusy("");
    } catch (e) {
      fail(e);
    }
  }
  useEffect(() => {
    playingRef.current = false;
    setPlaying(false);
    audio.current?.pause();
    videos.current.forEach((v) => v.pause());
  }, [project]);
  useEffect(() => {
    playingRef.current = playing;
    if (!playing) {
      audio.current?.pause();
      videos.current.forEach((v) => v.pause());
    }
  }, [playing]);
  useEffect(() => {
    api<MusicOption[]>("/api/music").then(setMusic).catch(fail);
    return () => {
      audio.current?.pause();
      audition.current?.pause();
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    const p = project,
      active = new Set(
        p.clips
          .filter((c) =>
            p.assets.some((a) => a.id === c.assetId && a.kind === "video"),
          )
          .map((c) => c.id),
      );
    for (const [id, v] of videos.current) {
      const c = p.clips.find((c) => c.id === id),
        a = p.assets.find((a) => a.id === c?.assetId);
      if (!active.has(id) || v.dataset.source !== `${a?.id}:${a?.url}`) {
        v.pause();
        v.onloadeddata = null;
        v.removeAttribute("src");
        v.load();
        videos.current.delete(id);
        media.current.delete(id);
      }
    }
    for (const a of p.assets.filter((a) => a.kind === "image")) {
      if (media.current.has(a.id)) continue;
      const im = new Image();
      im.onload = () => media.current.set(a.id, im);
      im.src = a.url;
    }
    for (const c of p.clips) {
      const a = p.assets.find((a) => a.id === c.assetId && a.kind === "video");
      if (!a || videos.current.has(c.id)) continue;
      const v = document.createElement("video");
      v.dataset.source = `${a.id}:${a.url}`;
      v.src = a.url;
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      v.onloadeddata = () => media.current.set(c.id, v);
      videos.current.set(c.id, v);
    }
  }, [project.assets, project.clips]);
  useEffect(() => {
    let raf = 0,
      previous = performance.now();
    const tick = (now: number) => {
      const p = projectRef.current,
        d = projectDuration(p);
      if (playingRef.current) {
        timeRef.current = Math.min(
          d,
          timeRef.current + (now - previous) / 1000,
        );
        setTime(timeRef.current);
        if (timeRef.current >= d) {
          setPlaying(false);
          audio.current?.pause();
        }
      }
      previous = now;
      const visual = p.tracks.filter(
          (t) => t.kind !== "music" && t.kind !== "narration",
        ),
        hasSolo = visual.some((t) => t.solo && !t.muted);
      videos.current.forEach((v, id) => {
        const c = p.clips.find((c) => c.id === id),
          track = visual.find((t) => t.id === c?.trackId);
        if (
          c &&
          track &&
          !track.muted &&
          !c.muted &&
          (!hasSolo || track.solo) &&
          timeRef.current >= c.start &&
          timeRef.current < c.start + c.duration
        ) {
          const a = p.assets.find((a) => a.id === c.assetId)!;
          const available = Math.max(1 / 30, a.duration - c.trimStart),
            elapsed = timeRef.current - c.start;
          const target =
            c.trimStart +
            (c.loop
              ? elapsed % available
              : Math.min(elapsed, Math.max(0, available - 1 / 30)));
          if (
            Number.isFinite(target) &&
            Math.abs(v.currentTime - target) >
              (playingRef.current ? 0.15 : 0.025)
          )
            v.currentTime = target;
          if (playingRef.current) v.play().catch(() => {});
          else v.pause();
        } else v.pause();
      });
      const cv = canvas.current;
      if (cv) {
        if (cv.width !== p.width) cv.width = p.width;
        if (cv.height !== p.height) cv.height = p.height;
        const ctx = cv.getContext("2d");
        if (ctx) renderFrame(ctx, p, timeRef.current, media.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    if (!job || !["queued", "rendering"].includes(job.status)) return;
    const timer = setInterval(
      () => api<ExportJob>(`/api/exports/${job.id}`).then(setJob).catch(fail),
      700,
    );
    return () => clearInterval(timer);
  }, [job?.id, job?.status]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const editing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
        return;
      }
      if (editing) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        update((p) => ({
          ...p,
          clips: p.clips.filter((c) => c.id !== selected),
        }));
        setSelected("");
      }
      if (e.key === "ArrowRight")
        seek(timeRef.current + (e.shiftKey ? 1 : 1 / 30));
      if (e.key === "ArrowLeft")
        seek(timeRef.current - (e.shiftKey ? 1 : 1 / 30));
      if (e.key === "Escape") {
        setExportOpen(false);
        setBrowser(false);
        setHelp(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  function moveTrack(index: number, dir: number) {
    update((p) => {
      const tracks = [...p.tracks];
      const other = index + dir;
      if (other < 0 || other >= tracks.length) return p;
      [tracks[index], tracks[other]] = [tracks[other], tracks[index]];
      return { ...p, tracks };
    });
  }
  async function startExport() {
    setPlaying(false);
    try {
      let outputPath: string | undefined;
      if (window.desktop) {
        const chosen = await window.desktop.chooseExportPath(
          `${(project.export.outputName || project.title).replace(/\.mp4$/i, "")}.mp4`,
        );
        if (!chosen) return;
        outputPath = chosen;
      }
      setJob(
        await api<ExportJob>(
          "/api/exports",
          json("POST", { project, outputPath }),
        ),
      );
    } catch (e) {
      fail(e);
    }
  }
  function dragClip(
    e: React.PointerEvent,
    id: string,
    mode: "move" | "left" | "right",
  ) {
    e.stopPropagation();
    setSelected(id);
    const original = project.clips.find((c) => c.id === id)!;
    const startX = e.clientX;
    setPast((h) => [...h.slice(-49), project]);
    setFuture([]);
    const element = e.currentTarget;
    element.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const delta = (ev.clientX - startX) / zoom;
      setProject((p) => ({
        ...p,
        clips: p.clips.map((c) => {
          if (c.id !== id) return c;
          if (mode === "move")
            return {
              ...c,
              start: Math.max(
                0,
                Math.min(
                  7200 - original.duration,
                  Math.round((original.start + delta) * 30) / 30,
                ),
              ),
            };
          if (mode === "right")
            return {
              ...c,
              duration: Math.max(
                0.1,
                Math.min(
                  7200 - original.start,
                  Math.round((original.duration + delta) * 30) / 30,
                ),
              ),
            };
          const change = Math.max(
            -original.start,
            Math.min(original.duration - 0.1, 7200 - original.trimStart, delta),
          );
          return {
            ...c,
            start: original.start + change,
            duration: original.duration - change,
            trimStart: Math.min(7200, Math.max(0, original.trimStart + change)),
          };
        }),
        updatedAt: new Date().toISOString(),
      }));
    };
    const up = () => {
      element.removeEventListener("pointermove", move as EventListener);
      element.removeEventListener("pointerup", up);
    };
    element.addEventListener("pointermove", move as EventListener);
    element.addEventListener("pointerup", up, { once: true });
  }
  const num = (
    label: string,
    value: number,
    change: (n: number) => void,
    min = 0,
    max = 100,
    step = 0.1,
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={Number(value.toFixed(3))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) change(Math.min(max, Math.max(min, n)));
        }}
      />
    </label>
  );
  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/*"
        hidden
        onChange={(e) => {
          if (e.target.files) importFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={narrationInput}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          if (e.target.files) importFiles(e.target.files, true);
          e.target.value = "";
        }}
      />
      <header className="topbar">
        <button
          className="brand"
          onClick={openBrowser}
          title="Open project browser"
        >
          <span className="brand-mark">
            k<span>●</span>
          </span>
          <span>
            kuro<span className="brand-studio">STUDIO</span>
          </span>
        </button>
        <div className="top-divider" />
        <button className="project-title" onClick={openBrowser}>
          <FolderOpen size={15} />
          {project.title}
          <ChevronDown size={14} />
        </button>
        <span className="saved-indicator">
          <span className={dirty ? "dot dirty" : "dot"} />
          {dirty ? "Unsaved changes" : "Saved locally"}
        </span>
        <div className="top-actions">
          <button
            className="icon-button"
            title="Keyboard shortcuts"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={18} />
          </button>
          <button className="button subtle" onClick={save}>
            <Save size={15} />
            {busy === "Saving project" ? "Saving…" : "Save project"}
          </button>
          <button
            className="button orange"
            onClick={() => {
              setJob(null);
              setExportOpen(true);
            }}
          >
            <Download size={15} />
            Export video
            <ArrowRight size={15} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="rail">
          <button
            className={tab === "content" ? "active" : ""}
            onClick={() => setTab("content")}
            title="Story content"
          >
            <Layers />
            <span>Story</span>
          </button>
          <button
            className={tab === "media" ? "active" : ""}
            onClick={() => setTab("media")}
            title="Media library"
          >
            <ImagePlus />
            <span>Media</span>
          </button>
          <button
            className={tab === "music" ? "active" : ""}
            onClick={() => setTab("music")}
            title="Music and narration"
          >
            <AudioLines />
            <span>Audio</span>
          </button>
          <div className="rail-bottom">
            <button onClick={openBrowser} title="Projects">
              <FolderOpen />
              <span>Projects</span>
            </button>
            <button onClick={() => setHelp(true)} title="Shortcuts">
              <HelpCircle />
              <span>Help</span>
            </button>
            <span className="avatar">KS</span>
          </div>
        </aside>
        <section className="library">
          <div className="library-heading">
            <div>
              <span className="eyebrow">YOUR CREATIVE TOOLKIT</span>
              <h2>
                {tab === "content"
                  ? "Build your story"
                  : tab === "media"
                    ? "Media library"
                    : "Set the mood"}
              </h2>
            </div>
            <span className="tiny-badge">
              {tab === "content"
                ? project.entries.length
                : tab === "media"
                  ? project.assets.length
                  : music.length}
            </span>
          </div>
          {tab === "content" ? (
            <>
              <div className="template-card">
                <div className="template-icon">
                  <Clapperboard size={20} />
                </div>
                <div>
                  <span>YOUR TEMPLATE</span>
                  <strong>{templateNames[project.template]}</strong>
                </div>
                <button
                  title="Change template"
                  onClick={() => {
                    setNewTemplate(project.template);
                    openBrowser();
                  }}
                >
                  <ChevronDown size={15} />
                </button>
              </div>
              <label className="field story-title">
                <span>Video title</span>
                <input
                  value={project.title}
                  onChange={(e) =>
                    update((p) => ({ ...p, title: e.target.value }))
                  }
                />
              </label>
              <div className="section-label">
                <span>CHARACTERS & CHAPTERS</span>
                <button
                  title="Add character"
                  onClick={() => {
                    const e: ContentEntry = {
                      id: uid(),
                      name: "New character",
                      subtitle: "A new chapter",
                      description: "Tell their story.",
                      quote: "",
                      rank: project.entries.length + 1,
                      score: 80,
                      comparisonScore: 75,
                    };
                    update((p) => ({ ...p, entries: [...p.entries, e] }));
                    setActiveEntry(e.id);
                  }}
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="entry-list">
                {project.entries.map((e, i) => (
                  <button
                    key={e.id}
                    className={`entry-card ${entry?.id === e.id ? "selected" : ""}`}
                    onClick={() => setActiveEntry(e.id)}
                  >
                    <span className={`character-thumb char-${i % 5}`}>
                      {e.mediaId ? (
                        <img
                          src={
                            project.assets.find((a) => a.id === e.mediaId)?.url
                          }
                        />
                      ) : (
                        <span>{e.name.slice(0, 1)}</span>
                      )}
                    </span>
                    <span className="entry-info">
                      <strong>{e.name}</strong>
                      <small>{e.subtitle}</small>
                    </span>
                    <span className="rank">
                      {String(e.rank).padStart(2, "0")}
                    </span>
                    <GripVertical size={13} />
                  </button>
                ))}
              </div>
              {entry && (
                <div className="entry-form">
                  <div className="section-label">
                    <span>EDIT CHARACTER</span>
                    <button
                      title="Remove character"
                      onClick={() => {
                        update((p) =>
                          generateSequence({
                            ...p,
                            entries: p.entries.filter((e) => e.id !== entry.id),
                          }),
                        );
                        setActiveEntry("");
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="form-pair">
                    <label className="field">
                      <span>Name</span>
                      <input
                        value={entry.name}
                        onChange={(e) => patchEntry({ name: e.target.value })}
                      />
                    </label>
                    {num(
                      "Rank",
                      entry.rank,
                      (n) => patchEntry({ rank: n }),
                      1,
                      999,
                      1,
                    )}
                  </div>
                  <label className="field">
                    <span>Subtitle</span>
                    <input
                      value={entry.subtitle}
                      onChange={(e) => patchEntry({ subtitle: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Description</span>
                    <textarea
                      rows={2}
                      value={entry.description}
                      onChange={(e) =>
                        patchEntry({ description: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Quote / key fact</span>
                    <input
                      value={entry.quote}
                      onChange={(e) => patchEntry({ quote: e.target.value })}
                    />
                  </label>
                  {project.template === "comparison" && (
                    <>
                      <label className="field">
                        <span>Opponent name</span>
                        <input
                          value={entry.opponentName || ""}
                          onChange={(e) =>
                            patchEntry({ opponentName: e.target.value })
                          }
                        />
                      </label>
                      <div className="section-label">
                        <span>COMPARISON CATEGORIES</span>
                        <button
                          title="Add comparison category"
                          onClick={() =>
                            patchEntry({
                              categories: [
                                ...(entry.categories || []),
                                {
                                  label: "New category",
                                  score: 80,
                                  comparisonScore: 75,
                                },
                              ],
                            })
                          }
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      {(entry.categories || []).map((category, i) => (
                        <div className="category-edit" key={i}>
                          <label className="field">
                            <span>Category {i + 1}</span>
                            <div className="category-label">
                              <input
                                value={category.label}
                                onChange={(e) =>
                                  patchEntry({
                                    categories: entry.categories!.map((c, j) =>
                                      j === i
                                        ? { ...c, label: e.target.value }
                                        : c,
                                    ),
                                  })
                                }
                              />
                              <button
                                title="Remove comparison category"
                                onClick={() =>
                                  patchEntry({
                                    categories: entry.categories!.filter(
                                      (_, j) => j !== i,
                                    ),
                                  })
                                }
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </label>
                          <div className="form-pair">
                            {num(
                              "Character",
                              category.score,
                              (n) =>
                                patchEntry({
                                  categories: entry.categories!.map((c, j) =>
                                    j === i ? { ...c, score: n } : c,
                                  ),
                                }),
                              0,
                              100,
                              1,
                            )}
                            {num(
                              "Opponent",
                              category.comparisonScore,
                              (n) =>
                                patchEntry({
                                  categories: entry.categories!.map((c, j) =>
                                    j === i ? { ...c, comparisonScore: n } : c,
                                  ),
                                }),
                              0,
                              100,
                              1,
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  <div className="form-pair">
                    {num(
                      "Score",
                      entry.score,
                      (n) => patchEntry({ score: n }),
                      0,
                      100,
                      1,
                    )}
                    {num(
                      "Rival score",
                      entry.comparisonScore,
                      (n) => patchEntry({ comparisonScore: n }),
                      0,
                      100,
                      1,
                    )}
                  </div>
                  <label className="field">
                    <span>Character image / video</span>
                    <select
                      aria-label="Character image / video"
                      value={entry.mediaId || ""}
                      onChange={(e) => {
                        patchEntry({ mediaId: e.target.value || undefined });
                      }}
                    >
                      <option value="">Original illustrated character</option>
                      {project.assets
                        .filter((a) => a.kind !== "audio")
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  {project.template === "comparison" && (
                    <label className="field">
                      <span>Opponent image / video</span>
                      <select
                        aria-label="Opponent image / video"
                        value={entry.secondaryMediaId || ""}
                        onChange={(e) =>
                          patchEntry({
                            secondaryMediaId: e.target.value || undefined,
                          })
                        }
                      >
                        <option value="">Original illustration</option>
                        {project.assets
                          .filter((a) => a.kind !== "audio")
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
              <div className="generate-footer">
                <button
                  className="button orange wide"
                  onClick={() => {
                    update(generateSequence);
                    setNotice(
                      "Sequence generated. Your story is ready to play.",
                    );
                    seek(0);
                  }}
                >
                  <WandSparkles size={16} />
                  Generate sequence
                  <ArrowRight size={16} />
                </button>
                <p>Your content. Perfectly in motion.</p>
              </div>
            </>
          ) : tab === "media" ? (
            <>
              <button
                className="import-zone"
                onClick={() => {
                  replaceId.current = "";
                  input.current?.click();
                }}
              >
                <Upload size={25} />
                <strong>Drop your media here</strong>
                <span>or browse files on your device</span>
                <small>PNG, JPG, WebP · MP4, WebM · Audio</small>
              </button>
              <div className="search">
                <Search size={15} />
                <input
                  placeholder="Search assets…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <p className="hint">
                Select a character in Story, then assign an asset. You can also
                drop audio onto a timeline track.
              </p>
              <div className="asset-grid">
                {project.assets
                  .filter(
                    (a) =>
                      !a.builtin &&
                      a.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((a) => (
                    <div
                      className="asset-card"
                      key={a.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("asset", a.id)}
                    >
                      <div className="asset-image">
                        {a.kind === "image" ? (
                          <img src={a.url} />
                        ) : a.kind === "video" ? (
                          <video src={a.url} />
                        ) : (
                          <AudioLines size={30} />
                        )}
                        <span>{a.kind.toUpperCase()}</span>
                      </div>
                      <strong title={a.name}>{a.name}</strong>
                      <small>
                        {a.width ? `${a.width} × ${a.height}` : fmt(a.duration)}{" "}
                        · {(a.size / 1024 / 1024).toFixed(1)} MB
                      </small>
                      <div>
                        <button onClick={() => assign(a)}>
                          {a.kind === "audio" ? "Add music" : "Assign"}
                          <Plus size={12} />
                        </button>
                        <button
                          title="Replace asset everywhere"
                          onClick={() => {
                            replaceId.current = a.id;
                            input.current?.click();
                          }}
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
              {!project.assets.filter((a) => !a.builtin).length && (
                <div className="empty-state">
                  <Film size={28} />
                  <p>
                    A home for your images,
                    <br />
                    footage, and recordings.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="audio-section-heading">
                <span className="eyebrow">ORIGINAL SOUNDTRACKS</span>
                <span className="tiny-badge">ROYALTY FREE</span>
              </div>
              <p className="hint">
                Four original compositions, made to sit beautifully beneath your
                story.
              </p>
              <div className="music-list">
                {music.map((m, i) => (
                  <div className="music-card" key={m.id}>
                    <button
                      className="music-art"
                      style={{ background: m.color }}
                      title={
                        previewMusic === m.id ? "Stop preview" : "Preview music"
                      }
                      onClick={() => {
                        if (previewMusic === m.id) {
                          audition.current?.pause();
                          setPreviewMusic("");
                        } else {
                          audition.current?.pause();
                          audition.current = new Audio(m.file);
                          audition.current.play().catch(fail);
                          setPreviewMusic(m.id);
                          audition.current.onended = () => setPreviewMusic("");
                        }
                      }}
                    >
                      {previewMusic === m.id ? (
                        <Pause size={19} />
                      ) : (
                        <Play size={19} />
                      )}
                      <span>0{i + 1}</span>
                    </button>
                    <div className="music-info">
                      <strong>{m.name}</strong>
                      <span>{m.mood}</span>
                      <small>
                        {m.bpm} BPM · {fmt(m.duration)}
                      </small>
                    </div>
                    <button
                      className="add-music"
                      title={`Use ${m.name}`}
                      onClick={() => useMusic(m)}
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="section-label">
                <span>YOUR VOICE, YOUR STORY</span>
                <Mic size={15} />
              </div>
              <button
                className="import-zone narration-zone"
                onClick={() => narrationInput.current?.click()}
              >
                <Mic size={23} />
                <strong>Import narration</strong>
                <span>WAV, MP3, and other audio formats</span>
              </button>
              <label className="field">
                <span>Audio mix</span>
                <select
                  aria-label="Audio mix"
                  value={project.audio.mode}
                  onChange={(e) =>
                    update((p) => ({
                      ...p,
                      audio: {
                        ...p.audio,
                        mode: e.target.value as Project["audio"]["mode"],
                      },
                    }))
                  }
                >
                  <option value="music-narration">Music + narration</option>
                  <option value="music">Music only</option>
                  <option value="narration">Narration only</option>
                  <option value="silent">Silent video</option>
                </select>
              </label>
              <div className="ducking-card">
                <label className="toggle-label">
                  <span>
                    <strong>Automatic ducking</strong>
                    <small>Make room for your voice</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={project.audio.ducking.enabled}
                    onChange={(e) =>
                      update((p) => ({
                        ...p,
                        audio: {
                          ...p.audio,
                          ducking: {
                            ...p.audio.ducking,
                            enabled: e.target.checked,
                          },
                        },
                      }))
                    }
                  />
                </label>
                {num(
                  "Ducking strength",
                  project.audio.ducking.strength,
                  (n) =>
                    update((p) => ({
                      ...p,
                      audio: {
                        ...p.audio,
                        ducking: { ...p.audio.ducking, strength: n },
                      },
                    })),
                  0,
                  1,
                  0.05,
                )}
                <div className="form-pair">
                  {num(
                    "Attack (s)",
                    project.audio.ducking.attack,
                    (n) =>
                      update((p) => ({
                        ...p,
                        audio: {
                          ...p.audio,
                          ducking: { ...p.audio.ducking, attack: n },
                        },
                      })),
                    0.01,
                    3,
                    0.01,
                  )}
                  {num(
                    "Release (s)",
                    project.audio.ducking.release,
                    (n) =>
                      update((p) => ({
                        ...p,
                        audio: {
                          ...p.audio,
                          ducking: { ...p.audio.ducking, release: n },
                        },
                      })),
                    0.01,
                    5,
                    0.01,
                  )}
                </div>
              </div>
              <div className="custom-audio">
                {project.assets
                  .filter((a) => a.kind === "audio" && !a.builtin)
                  .map((a) => (
                    <div key={a.id}>
                      <AudioLines size={16} />
                      <span>
                        {a.name}
                        <small>{fmt(a.duration)}</small>
                      </span>
                      <button
                        title="Add narration"
                        onClick={() => addAudio(a, "narration")}
                      >
                        <Mic size={15} />
                      </button>
                      <button
                        title="Add music"
                        onClick={() => addAudio(a, "music")}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  ))}
              </div>
            </>
          )}
        </section>
        <main className="editor-center">
          <div className="preview-toolbar">
            <div>
              <span className="live-dot" />
              PREVIEW<span className="separator">/</span>
              <span className="preview-sub">
                {templateNames[project.template]}
              </span>
            </div>
            <div className="preview-toolbar-right">
              <span>
                {project.width} × {project.height}
              </span>
              <span>30 FPS</span>
              <button
                title="Fullscreen preview"
                onClick={() => canvas.current?.requestFullscreen()}
              >
                <Maximize2 size={15} />
              </button>
            </div>
          </div>
          <div className="preview-stage">
            <div
              className="canvas-wrap"
              style={
                {
                  aspectRatio: `${project.width}/${project.height}`,
                  "--canvas-ratio": project.width / project.height,
                } as React.CSSProperties
              }
            >
              <canvas ref={canvas} aria-label="Video preview" />
              <span className="preview-watermark">KURO ORIGINAL</span>
            </div>
          </div>
          <div className="playback">
            <div className="timecode">
              {frames(time)}
              <span>/ {frames(duration)}</span>
            </div>
            <div className="transport">
              <button title="Go to beginning" onClick={() => seek(0)}>
                <SkipBack size={16} />
              </button>
              <button
                title="Previous scene"
                onClick={() =>
                  seek(
                    [...project.scenes]
                      .reverse()
                      .find((s) => s.start < time - 0.1)?.start || 0,
                  )
                }
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="play-button"
                title={playing ? "Pause (Space)" : "Play (Space)"}
                onClick={togglePlay}
              >
                {playing ? (
                  <Pause fill="currentColor" size={15} />
                ) : (
                  <Play fill="currentColor" size={15} />
                )}
              </button>
              <button
                title="Next scene"
                onClick={() =>
                  seek(
                    project.scenes.find((s) => s.start > time + 0.1)?.start ??
                      duration,
                  )
                }
              >
                <ChevronRight size={18} />
              </button>
              <button title="Go to end" onClick={() => seek(duration)}>
                <SkipForward size={16} />
              </button>
            </div>
            <div className="preview-zoom">
              <span>Fit</span>
              <ChevronDown size={12} />
              <button
                title="Fullscreen preview"
                onClick={() => canvas.current?.requestFullscreen()}
              >
                <Expand size={15} />
              </button>
            </div>
          </div>
          <div className="timeline-topbar">
            <div className="timeline-title">
              <Layers size={15} />
              <strong>Timeline</strong>
              <span>{project.tracks.length} tracks</span>
            </div>
            <div className="timeline-tools">
              <button
                title="Undo (Ctrl+Z)"
                disabled={!past.length}
                onClick={undo}
              >
                <Undo2 size={16} />
              </button>
              <button
                title="Redo (Ctrl+Shift+Z)"
                disabled={!future.length}
                onClick={redo}
              >
                <Redo2 size={16} />
              </button>
              <span className="tool-divider" />
              <button
                title="Split selected clip at playhead"
                disabled={
                  !clip ||
                  time <= clip.start ||
                  time >= clip.start + clip.duration
                }
                onClick={() => {
                  if (!clip) return;
                  const offset = time - clip.start;
                  update((p) => ({
                    ...p,
                    clips: [
                      ...p.clips.map((c) =>
                        c.id === clip.id ? { ...c, duration: offset } : c,
                      ),
                      {
                        ...clip,
                        id: uid(),
                        start: time,
                        duration: clip.duration - offset,
                        trimStart: clip.trimStart + offset,
                      },
                    ],
                  }));
                }}
              >
                <Scissors size={16} />
              </button>
              <button
                title="Duplicate selected clip"
                disabled={!clip}
                onClick={() => {
                  if (clip)
                    update((p) => ({
                      ...p,
                      clips: [
                        ...p.clips,
                        {
                          ...clip,
                          id: uid(),
                          start: Math.min(
                            7200 - clip.duration,
                            clip.start + clip.duration,
                          ),
                        },
                      ],
                    }));
                }}
              >
                <Copy size={15} />
              </button>
              <button
                title="Delete selected clip"
                disabled={!clip}
                onClick={() => {
                  update((p) => ({
                    ...p,
                    clips: p.clips.filter((c) => c.id !== selected),
                  }));
                  setSelected("");
                }}
              >
                <Trash2 size={15} />
              </button>
              <span className="tool-divider" />
              <button
                title="Zoom out timeline"
                onClick={() => setZoom((z) => Math.max(5, z - 5))}
              >
                <ZoomOut size={15} />
              </button>
              <input
                aria-label="Timeline zoom"
                type="range"
                min="5"
                max="80"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
              <button
                title="Zoom in timeline"
                onClick={() => setZoom((z) => Math.min(80, z + 5))}
              >
                <ZoomIn size={15} />
              </button>
            </div>
          </div>
          <div className="timeline">
            <div className="track-headers">
              <div className="track-corner">
                <MousePointer2 size={13} />
                <span>TRACKS</span>
              </div>
              {project.tracks.map((track, index) => (
                <div className={`track-header ${track.kind}`} key={track.id}>
                  <div className="track-name">
                    <span className="track-color" />
                    {track.kind === "music" ? (
                      <Music2 size={13} />
                    ) : track.kind === "narration" ? (
                      <Mic size={13} />
                    ) : track.kind === "media" ? (
                      <Film size={13} />
                    ) : (
                      <Layers size={13} />
                    )}
                    <span>{track.name}</span>
                  </div>
                  <div className="track-controls">
                    <button
                      title={`Mute ${track.name}`}
                      className={track.muted ? "on" : ""}
                      onClick={() =>
                        update((p) => ({
                          ...p,
                          tracks: p.tracks.map((t) =>
                            t.id === track.id ? { ...t, muted: !t.muted } : t,
                          ),
                        }))
                      }
                    >
                      {track.muted ? (
                        <VolumeX size={12} />
                      ) : (
                        <Volume2 size={12} />
                      )}
                    </button>
                    <button
                      title={`Solo ${track.name}`}
                      className={track.solo ? "on" : ""}
                      onClick={() =>
                        update((p) => ({
                          ...p,
                          tracks: p.tracks.map((t) =>
                            t.id === track.id ? { ...t, solo: !t.solo } : t,
                          ),
                        }))
                      }
                    >
                      S
                    </button>
                    <button
                      title="Move layer up"
                      disabled={index === 0}
                      onClick={() => moveTrack(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      title="Move layer down"
                      disabled={index === project.tracks.length - 1}
                      onClick={() => moveTrack(index, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="timeline-scroll">
              <div
                className="timeline-content"
                style={{ width: Math.max(700, (duration + 4) * zoom) }}
              >
                <div
                  className="ruler"
                  onPointerDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    seek((e.clientX - rect.left) / zoom);
                    const el = e.currentTarget;
                    el.setPointerCapture(e.pointerId);
                    el.onpointermove = (ev) =>
                      seek((ev.clientX - rect.left) / zoom);
                    el.onpointerup = () => {
                      el.onpointermove = null;
                    };
                  }}
                >
                  {Array.from(
                    { length: Math.ceil((duration + 4) / 5) },
                    (_, i) => (
                      <span key={i} style={{ left: i * 5 * zoom }}>
                        {fmt(i * 5)}
                      </span>
                    ),
                  )}
                </div>
                {project.tracks.map((track) => (
                  <div
                    className={`track-row ${track.kind} ${track.muted ? "muted" : ""}`}
                    key={track.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData("asset");
                      const a = project.assets.find((a) => a.id === id);
                      if (!a) return;
                      e.stopPropagation();
                      const audioTrack =
                        track.kind === "music" || track.kind === "narration";
                      if ((a.kind === "audio") !== audioTrack) {
                        setError(
                          audioTrack
                            ? "Drop an audio file onto a music or narration track."
                            : "Drop images and videos onto a visual track; use music or narration for audio.",
                        );
                        return;
                      }
                      if (a.kind === "audio")
                        addAudio(
                          a,
                          track.kind === "narration" ? "narration" : "music",
                        );
                      else {
                        const c: Clip = {
                          ...makeAudioClip(a, track.id, time),
                          start: Math.min(time, 7199.9),
                          duration: Math.min(5, 7200 - Math.min(time, 7199.9)),
                        };
                        update((p) => ({ ...p, clips: [...p.clips, c] }));
                        setSelected(c.id);
                      }
                    }}
                    onDoubleClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      seek((e.clientX - rect.left) / zoom);
                    }}
                  >
                    {project.clips
                      .filter((c) => c.trackId === track.id)
                      .map((c) => {
                        const a = project.assets.find(
                          (a) => a.id === c.assetId,
                        );
                        return (
                          <div
                            key={c.id}
                            className={`timeline-clip ${c.id === selected ? "selected" : ""} ${c.muted ? "muted" : ""}`}
                            style={{
                              left: c.start * zoom,
                              width: Math.max(5, c.duration * zoom),
                            }}
                            onPointerDown={(e) => dragClip(e, c.id, "move")}
                            title={`${c.label} · ${c.start.toFixed(2)}s — ${(c.start + c.duration).toFixed(2)}s`}
                          >
                            <span
                              className="trim-handle left"
                              onPointerDown={(e) => dragClip(e, c.id, "left")}
                            />
                            {a?.kind === "image" && <img src={a.url} />}
                            <span className="clip-label">{c.label}</span>
                            {(track.kind === "music" ||
                              track.kind === "narration") && (
                              <svg
                                className="waveform"
                                viewBox="0 0 200 28"
                                preserveAspectRatio="none"
                              >
                                {clipWaveform(
                                  a,
                                  c,
                                  Math.max(
                                    24,
                                    Math.min(
                                      400,
                                      Math.ceil((c.duration * zoom) / 3),
                                    ),
                                  ),
                                ).map((v, i, arr) => (
                                  <line
                                    key={i}
                                    x1={(i * 200) / arr.length}
                                    x2={(i * 200) / arr.length}
                                    y1={14 - v * 13}
                                    y2={14 + v * 13}
                                  />
                                ))}
                              </svg>
                            )}
                            <span
                              className="trim-handle right"
                              onPointerDown={(e) => dragClip(e, c.id, "right")}
                            />
                          </div>
                        );
                      })}
                  </div>
                ))}
                <div className="playhead" style={{ left: time * zoom }}>
                  <span />
                  <div />
                </div>
              </div>
            </div>
          </div>
          <footer className="editor-footer">
            <span>
              <span className="dot" />
              ALL SYSTEMS CREATIVE
            </span>
            <span>Local first. Made for your imagination.</span>
            <button onClick={() => setHelp(true)}>
              ⌘ / Ctrl shortcuts
              <HelpCircle size={12} />
            </button>
          </footer>
        </main>
        <aside className="inspector">
          <div className="inspector-heading">
            <SlidersHorizontal size={16} />
            <h2>Inspector</h2>
            <Settings2 size={15} />
          </div>
          {clip ? (
            <>
              <div className="selected-heading">
                <span
                  className={`mini-track ${project.tracks.find((t) => t.id === clip.trackId)?.kind}`}
                />
                <div>
                  <strong>{clip.label}</strong>
                  <small>
                    {project.tracks.find((t) => t.id === clip.trackId)?.name}{" "}
                    clip
                  </small>
                </div>
              </div>
              <div className="inspector-section">
                <h3>Clip details</h3>
                <label className="field">
                  <span>Label</span>
                  <input
                    value={clip.label}
                    onChange={(e) => patchClip({ label: e.target.value })}
                  />
                </label>
                <div className="form-pair">
                  {num(
                    "Start (s)",
                    clip.start,
                    (n) => patchClip({ start: n }),
                    0,
                    7200 - clip.duration,
                  )}
                  {num(
                    "Duration (s)",
                    clip.duration,
                    (n) => patchClip({ duration: n }),
                    0.1,
                    7200 - clip.start,
                  )}
                </div>
                {num(
                  "Source trim (s)",
                  clip.trimStart,
                  (n) => patchClip({ trimStart: n }),
                  0,
                  7200,
                )}
                {project.tracks.find((t) => t.id === clip.trackId)?.kind ===
                  "text" && (
                  <label className="field">
                    <span>On-screen text</span>
                    <textarea
                      value={
                        clip.text ??
                        project.scenes.find((s) => s.id === clip.sceneId)
                          ?.title ??
                        ""
                      }
                      rows={3}
                      onChange={(e) => patchClip({ text: e.target.value })}
                    />
                  </label>
                )}
                <label className="toggle-label">
                  <span>Mute clip</span>
                  <input
                    type="checkbox"
                    checked={clip.muted}
                    onChange={(e) => patchClip({ muted: e.target.checked })}
                  />
                </label>
              </div>
              {["music", "narration"].includes(
                project.tracks.find((t) => t.id === clip.trackId)?.kind || "",
              ) ? (
                <div className="inspector-section">
                  <h3>
                    <AudioLines size={14} />
                    Audio
                  </h3>
                  <label className="slider-field">
                    <span>
                      Volume<strong>{Math.round(clip.volume * 100)}%</strong>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step=".01"
                      value={clip.volume}
                      onChange={(e) =>
                        patchClip({ volume: Number(e.target.value) })
                      }
                    />
                  </label>
                  <div className="form-pair">
                    {num(
                      "Fade in (s)",
                      clip.fadeIn,
                      (n) => patchClip({ fadeIn: n }),
                      0,
                      clip.duration,
                    )}
                    {num(
                      "Fade out (s)",
                      clip.fadeOut,
                      (n) => patchClip({ fadeOut: n }),
                      0,
                      clip.duration,
                    )}
                  </div>
                  <label className="toggle-label">
                    <span>Loop source</span>
                    <input
                      type="checkbox"
                      checked={clip.loop}
                      onChange={(e) => patchClip({ loop: e.target.checked })}
                    />
                  </label>
                  <label className="toggle-label">
                    <span>Normalize loudness</span>
                    <input
                      type="checkbox"
                      checked={clip.normalize}
                      onChange={(e) =>
                        patchClip({ normalize: e.target.checked })
                      }
                    />
                  </label>
                </div>
              ) : (
                <>
                  <div className="inspector-section">
                    <h3>Transform & crop</h3>
                    <div className="segmented">
                      {(["cover", "contain"] as const).map((v) => (
                        <button
                          key={v}
                          className={clip.fit === v ? "active" : ""}
                          onClick={() => patchClip({ fit: v })}
                        >
                          {v === "cover" ? "Fill frame" : "Fit frame"}
                        </button>
                      ))}
                    </div>
                    <div className="form-pair">
                      {num(
                        "Position X (px)",
                        clip.x,
                        (n) => patchClip({ x: n }),
                        -2000,
                        2000,
                        10,
                      )}
                      {num(
                        "Position Y (px)",
                        clip.y,
                        (n) => patchClip({ y: n }),
                        -2000,
                        2000,
                        10,
                      )}
                    </div>
                    <div className="form-pair">
                      {num(
                        "Scale",
                        clip.scale,
                        (n) => patchClip({ scale: n }),
                        0.1,
                        5,
                        0.05,
                      )}
                      {num(
                        "Opacity",
                        clip.opacity,
                        (n) => patchClip({ opacity: n }),
                        0,
                        1,
                        0.05,
                      )}
                    </div>
                  </div>
                  <div className="inspector-section">
                    <h3>
                      <Sparkles size={14} />
                      Animation
                    </h3>
                    {(
                      [
                        "camera",
                        "reveal",
                        "text",
                        "transition",
                        "easing",
                      ] as const
                    ).map((key) => (
                      <label className="field" key={key}>
                        <span>
                          {key === "text"
                            ? "Typography"
                            : key.charAt(0).toUpperCase() + key.slice(1)}
                        </span>
                        <select
                          value={clip.animation[key]}
                          onChange={(e) =>
                            patchClip({
                              animation: {
                                ...clip.animation,
                                [key]: e.target.value,
                              },
                            })
                          }
                        >
                          {options[key].map((v) => (
                            <option key={v} value={v}>
                              {v.replaceAll("-", " ")}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <div className="form-pair">
                      {num(
                        "Duration (s)",
                        clip.animation.duration,
                        (n) =>
                          patchClip({
                            animation: { ...clip.animation, duration: n },
                          }),
                        0.05,
                        10,
                        0.05,
                      )}
                      {num(
                        "Delay (s)",
                        clip.animation.delay,
                        (n) =>
                          patchClip({
                            animation: { ...clip.animation, delay: n },
                          }),
                        0,
                        30,
                        0.05,
                      )}
                    </div>
                    {num(
                      "Intensity",
                      clip.animation.intensity,
                      (n) =>
                        patchClip({
                          animation: { ...clip.animation, intensity: n },
                        }),
                      0,
                      3,
                      0.05,
                    )}
                    <div className="form-pair">
                      {num(
                        "Focal X",
                        clip.animation.focalX,
                        (n) =>
                          patchClip({
                            animation: { ...clip.animation, focalX: n },
                          }),
                        0,
                        1,
                        0.05,
                      )}
                      {num(
                        "Focal Y",
                        clip.animation.focalY,
                        (n) =>
                          patchClip({
                            animation: { ...clip.animation, focalY: n },
                          }),
                        0,
                        1,
                        0.05,
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="inspector-empty">
                <MousePointer2 size={24} />
                <strong>Make it yours</strong>
                <p>
                  Select a clip on the timeline to fine-tune its timing, motion,
                  and sound.
                </p>
              </div>
              <div className="inspector-section">
                <h3>Project settings</h3>
                <label className="field">
                  <span>Canvas</span>
                  <select
                    aria-label="Canvas"
                    value={`${project.width}x${project.height}`}
                    onChange={(e) => {
                      const [width, height] = e.target.value
                        .split("x")
                        .map(Number);
                      update((p) => ({ ...p, width, height }));
                    }}
                  >
                    <option value="1280x720">Landscape · 1280 × 720</option>
                    <option value="1920x1080">Full HD · 1920 × 1080</option>
                    <option value="1080x1920">Portrait · 1080 × 1920</option>
                  </select>
                </label>
                <label className="field">
                  <span>Accent color</span>
                  <div className="color-field">
                    <input
                      type="color"
                      value={project.accent}
                      onChange={(e) =>
                        update((p) => ({ ...p, accent: e.target.value }))
                      }
                    />
                    <span>{project.accent.toUpperCase()}</span>
                  </div>
                </label>
                <div className="project-stats">
                  <span>
                    Duration<strong>{fmt(duration)}</strong>
                  </span>
                  <span>
                    Scenes<strong>{project.scenes.length}</strong>
                  </span>
                  <span>
                    Frame rate<strong>30 fps</strong>
                  </span>
                </div>
              </div>
              <div className="creative-note">
                <Sparkles size={19} />
                <h4>
                  A little motion.
                  <br />A bigger story.
                </h4>
                <p>
                  Build your chapters, bring in your world, and let Kuro connect
                  the dots.
                </p>
              </div>
            </>
          )}
        </aside>
      </div>
      {notice && (
        <div className="toast">
          <Check size={16} />
          {notice}
        </div>
      )}
      {busy && (
        <div className="busy-toast">
          <LoaderCircle className="spin" size={15} />
          {busy}
        </div>
      )}
      {error && (
        <div className="error-toast">
          <span>{error}</span>
          <button onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {browser && (
        <div className="modal-backdrop">
          <div className="modal project-browser">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  THE NEXT GREAT STORY STARTS HERE
                </span>
                <h2>Your workspace</h2>
              </div>
              <button
                onClick={() => setBrowser(false)}
                title="Close project browser"
              >
                <X size={20} />
              </button>
            </div>
            <div className="browser-columns">
              <div>
                <h3>Start something new</h3>
                <label className="field">
                  <span>Project name</span>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </label>
                <div className="template-options">
                  {(["ranking", "analysis", "comparison"] as TemplateId[]).map(
                    (t, i) => (
                      <button
                        className={newTemplate === t ? "active" : ""}
                        key={t}
                        onClick={() => setNewTemplate(t)}
                      >
                        <span className={`template-preview template-${i}`}>
                          {i === 0 ? "#01" : i === 1 ? "Aa" : "VS"}
                        </span>
                        <span>
                          <strong>{templateNames[t]}</strong>
                          <small>
                            {i === 0
                              ? "Count down the unforgettable."
                              : i === 1
                                ? "Go deeper into their world."
                                : "Two rivals. One great story."}
                          </small>
                        </span>
                        {newTemplate === t && <Check size={17} />}
                      </button>
                    ),
                  )}
                </div>
                <button className="button orange wide" onClick={newProject}>
                  <Plus size={16} />
                  Create project
                  <ArrowRight size={16} />
                </button>
              </div>
              <div>
                <h3>Pick up where you left off</h3>
                <div className="project-list">
                  {projects.map((p) => (
                    <button key={p.id} onClick={() => openProject(p.id)}>
                      <span className="project-icon">
                        <Clapperboard size={22} />
                      </span>
                      <span>
                        <strong>{p.title}</strong>
                        <small>
                          {templateNames[p.template]} · {fmt(p.duration)} ·{" "}
                          {new Date(p.updatedAt).toLocaleDateString()}
                        </small>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                  {!projects.length && (
                    <div className="empty-state">
                      <FolderOpen size={26} />
                      <p>Your saved projects will live here.</p>
                    </div>
                  )}
                </div>
                <button className="button subtle wide" onClick={duplicate}>
                  <Copy size={15} />
                  Duplicate current project
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {exportOpen && (
        <div className="modal-backdrop">
          <div className="modal export-modal">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">READY FOR THE BIG SCREEN</span>
                <h2>Export your story</h2>
              </div>
              <button
                onClick={() => setExportOpen(false)}
                title="Close export dialog"
              >
                <X size={20} />
              </button>
            </div>
            <div className="export-summary">
              <Clapperboard size={30} />
              <div>
                <strong>{project.title}</strong>
                <span>
                  {fmt(duration)} · {project.scenes.length} scenes · H.264 / AAC
                </span>
              </div>
              <span className="tiny-badge">MP4</span>
            </div>
            <label className="field">
              <span>File name</span>
              <input
                value={project.export.outputName}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    export: { ...p.export, outputName: e.target.value },
                  }))
                }
              />
            </label>
            <div className="form-pair">
              <label className="field">
                <span>Resolution</span>
                <select
                  aria-label="Resolution"
                  value={`${project.width}x${project.height}`}
                  onChange={(e) => {
                    const [width, height] = e.target.value
                      .split("x")
                      .map(Number);
                    update((p) => ({ ...p, width, height }));
                  }}
                >
                  <option value="1280x720">1280 × 720 · HD</option>
                  <option value="1920x1080">1920 × 1080 · Full HD</option>
                  <option value="1080x1920">1080 × 1920 · Portrait</option>
                </select>
              </label>
              <label className="field">
                <span>Quality · 30 FPS</span>
                <select
                  aria-label="Quality · 30 FPS"
                  value={project.export.quality}
                  onChange={(e) =>
                    update((p) => ({
                      ...p,
                      export: {
                        ...p.export,
                        quality: e.target.value as Project["export"]["quality"],
                      },
                    }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="standard">Standard</option>
                  <option value="high">High</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Audio included</span>
              <select
                aria-label="Audio included"
                value={project.audio.mode}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    audio: {
                      ...p.audio,
                      mode: e.target.value as Project["audio"]["mode"],
                    },
                  }))
                }
              >
                <option value="music-narration">Music and narration</option>
                <option value="music">Music only</option>
                <option value="narration">Narration only</option>
                <option value="silent">Silent video</option>
              </select>
            </label>
            <div className="export-info">
              <Check size={14} />
              <span>
                Renders locally on your device. Your story stays yours.
              </span>
            </div>
            {job && (
              <div className="export-progress">
                <div>
                  <strong>
                    {job.status === "complete"
                      ? "Your video is ready"
                      : job.status === "error"
                        ? "Export failed"
                        : job.status === "cancelled"
                          ? "Export cancelled"
                          : `Rendering your story · ${Math.round(job.progress * 100)}%`}
                  </strong>
                  <span>{job.message || job.error}</span>
                </div>
                <progress max="1" value={job.progress} />
                {job.error && <p className="error-text">{job.error}</p>}
              </div>
            )}
            <div className="export-actions">
              {job && ["queued", "rendering"].includes(job.status) ? (
                <button
                  className="button subtle wide"
                  onClick={() =>
                    api<ExportJob>(`/api/exports/${job.id}`, {
                      method: "DELETE",
                    })
                      .then(setJob)
                      .catch(fail)
                  }
                >
                  <X size={15} />
                  Cancel export
                </button>
              ) : job?.status === "complete" ? (
                <a
                  className="button orange wide"
                  href={job.downloadUrl || `/api/exports/${job.id}/file`}
                  download
                >
                  <Download size={17} />
                  Download MP4
                </a>
              ) : (
                <button className="button orange wide" onClick={startExport}>
                  <Download size={16} />
                  {job ? "Export again" : "Export MP4"}
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {help && (
        <div className="modal-backdrop">
          <div className="modal shortcuts-modal">
            <div className="modal-heading">
              <h2>Creative shortcuts</h2>
              <button onClick={() => setHelp(false)}>
                <X size={20} />
              </button>
            </div>
            {[
              ["Play / pause", "Space"],
              ["Save project", "Ctrl / ⌘ S"],
              ["Undo", "Ctrl / ⌘ Z"],
              ["Redo", "Ctrl / ⌘ Shift Z"],
              ["Delete selected clip", "Delete"],
              ["Move one frame", "← / →"],
              ["Move one second", "Shift ← / →"],
              ["Close dialog", "Esc"],
            ].map(([name, key]) => (
              <div className="shortcut" key={name}>
                <span>{name}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
            <p className="hint">
              Drag a clip to move it. Drag its left or right edge to trim. Click
              the ruler to seek. Double-click a track to move the playhead.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
