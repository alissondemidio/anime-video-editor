"use client";
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { Timeline } from "@ave/core";

export function VideoComposition({ timeline }: { timeline: Timeline }) {
  const frame = useCurrentFrame();
  const seconds = frame / timeline.fps;
  const scene = timeline.scenes.find((item) => seconds >= item.start && seconds < item.end);
  if (!scene) return <AbsoluteFill style={{ background: "#090d16" }} />;
  const local = seconds - scene.start;
  const progress = local / (scene.end - scene.start);
  const scale = scene.effect === "slow-zoom" ? interpolate(progress, [0, 1], [1, 1.08]) : 1;
  const opacity = scene.effect === "fade" ? interpolate(local, [0, 0.5], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const offset = scene.effect === "shake" ? Math.sin(frame * 2.5) * 8 : 0;
  return <AbsoluteFill style={{ background: "radial-gradient(ellipse at 70% 30%, #242b44, #090d16 70%)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", overflow: "hidden" }}>
    <div style={{ position: "absolute", width: 680, height: 680, borderRadius: "50%", background: scene.accent, filter: "blur(145px)", opacity: 0.22, left: 950, top: 70 }} />
    <div style={{ width: "78%", transform: `translateX(${offset}px) scale(${scale})`, opacity, textAlign: "left" }}>
      <div style={{ color: scene.accent, fontWeight: 800, fontSize: 36, letterSpacing: 7, marginBottom: 35 }}>CHARACTER FILE / {scene.id.toUpperCase()}</div>
      <div style={{ fontWeight: 900, fontSize: 120, lineHeight: 1.05, letterSpacing: -5 }}>{scene.title}</div>
      <div style={{ width: 200, height: 9, background: scene.accent, margin: "38px 0" }} />
      <div style={{ color: "#cdd7eb", fontSize: 43, lineHeight: 1.4 }}>{scene.narration}</div>
    </div>
    <div style={{ position: "absolute", bottom: 44, left: 64, fontSize: 28, opacity: 0.65 }}>DEMO • ORIGINAL GRAPHICS</div>
  </AbsoluteFill>;
}
