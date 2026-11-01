"use client";
import React, { useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { Download, Film, Layers3, Play, Settings2, Sparkles } from "lucide-react";
import { duration, sampleTimeline, validateTimeline, type Effect, type Timeline } from "@ave/core";
import { templates } from "@ave/templates";
import { VideoComposition } from "./video-composition";

const effects: Effect[] = ["none", "slow-zoom", "fade", "shake"];

export function Editor() {
  const [timeline, setTimeline] = useState<Timeline>(() => structuredClone(sampleTimeline));
  const [selected, setSelected] = useState("intro");
  const scene = timeline.scenes.find((s) => s.id === selected);
  const errors = useMemo(() => validateTimeline(timeline), [timeline]);
  const update = (changes: Partial<NonNullable<typeof scene>>) => setTimeline((previous) => ({
    ...previous, scenes: previous.scenes.map((s) => s.id === selected ? { ...s, ...changes } : s)
  }));
  const exportJson = () => {
    if (errors.length) return;
    const blob = new Blob([JSON.stringify(timeline, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "timeline.json"; a.click();
    URL.revokeObjectURL(url);
  };
  return <div className="min-h-screen">
    <header className="flex items-center justify-between border-b border-slate-800 px-8 py-5">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-violet-600 p-2"><Film size={22}/></div><div><h1 className="text-xl font-bold">Anime Video Editor</h1><p className="text-xs text-slate-400">Voiceover-first • Template-based video production</p></div></div>
      <button onClick={exportJson} disabled={errors.length > 0} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 font-semibold disabled:opacity-40"><Download size={16}/> Export Timeline JSON</button>
    </header>
    <main className="grid gap-6 p-7 xl:grid-cols-[270px_minmax(0,1fr)_300px]">
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-5 flex items-center gap-2 font-semibold"><Layers3 size={18}/> Templates</div>
        <div className="space-y-2">{templates.map((template) => <button key={template.id} onClick={() => setTimeline((p) => ({ ...p, templateId: template.id }))} className={`w-full rounded-xl border p-3 text-left ${timeline.templateId === template.id ? "border-violet-500 bg-violet-500/15" : "border-slate-800 hover:bg-slate-800"}`}><div className="text-sm font-semibold">{template.name}</div><div className="mt-1 text-xs text-slate-400">{template.description}</div></button>)}</div>
        <div className="mt-8 rounded-xl bg-slate-800/60 p-4 text-sm text-slate-300"><Sparkles size={18} className="mb-2 text-violet-400"/><b>MVP foundation</b><p className="mt-2 text-xs leading-5 text-slate-400">This preview uses original graphics. Audio upload, media matching and MP4 rendering are upcoming milestones.</p></div>
      </aside>
      <section className="min-w-0 space-y-5">
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-2xl">
          <Player component={VideoComposition} inputProps={{ timeline }} compositionWidth={1920} compositionHeight={1080} fps={timeline.fps} durationInFrames={Math.ceil(duration(timeline) * timeline.fps)} controls autoPlay={false} style={{ width: "100%", aspectRatio: "16 / 9" }}/>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold"><Play size={16}/> Timeline</h2><span className="text-xs text-slate-400">{duration(timeline).toFixed(1)}s • {timeline.fps} fps</span></div>
          <div className="flex gap-2">{timeline.scenes.map((s) => <button key={s.id} onClick={() => setSelected(s.id)} style={{ flex: s.end - s.start, borderColor: selected === s.id ? s.accent : "#334155" }} className="min-w-0 rounded-lg border-2 bg-slate-800 p-3 text-left"><div className="mb-2 h-1 rounded" style={{ background: s.accent }}/><div className="truncate text-sm font-semibold">{s.title}</div><div className="text-xs text-slate-400">{s.start}s–{s.end}s</div></button>)}</div>
          {errors.length > 0 && <p className="mt-3 text-sm text-rose-400">{errors.join("; ")}</p>}
        </div>
      </section>
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-5 flex items-center gap-2 font-semibold"><Settings2 size={18}/> Scene Inspector</div>
        {scene && <div className="space-y-5">
          <label className="block text-sm text-slate-400">Scene title<input value={scene.title} onChange={(e) => update({title:e.target.value})} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-white"/></label>
          <label className="block text-sm text-slate-400">Narration text<textarea value={scene.narration} onChange={(e) => update({narration:e.target.value})} rows={5} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-white"/></label>
          <label className="block text-sm text-slate-400">Effect<select value={scene.effect} onChange={(e) => update({effect:e.target.value as Effect})} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-white">{effects.map((effect) => <option key={effect}>{effect}</option>)}</select></label>
          <label className="block text-sm text-slate-400">Accent color<input type="color" value={scene.accent} onChange={(e) => update({accent:e.target.value})} className="mt-2 h-10 w-full"/></label>
          <div className="rounded-lg border border-dashed border-slate-700 p-3 text-xs leading-5 text-slate-400">Media matching: not connected yet. Future scene media will be selected from authorized user-supplied assets.</div>
        </div>}
      </aside>
    </main>
  </div>;
}
