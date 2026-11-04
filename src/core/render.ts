import type {
  Clip,
  ContentEntry,
  Project,
  Scene,
  TrackKind,
} from "../shared/types.js";
import {
  cameraTransform,
  clamp,
  clipIsActive,
  lerp,
  progressAt,
  revealState,
  transitionState,
  visibleText,
} from "./animation.js";
import { TEMPLATES } from "./templates.js";
type Ctx = CanvasRenderingContext2D;
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const INK = "#11151d",
  PAPER = "#f5efe5",
  MUTED = "#a7aab4";
function polygon(ctx: Ctx, points: number[][], fill: string, stroke?: string) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x!, y!) : ctx.moveTo(x!, y!)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
function line(
  ctx: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 1,
) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function label(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  size = 14,
  color = MUTED,
  weight = 600,
) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "DejaVu Sans", sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
}
function wrap(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  lineHeight: number,
  color = PAPER,
  maxLines = 5,
  weight = 400,
): number {
  ctx.font = `${weight} ${size}px "DejaVu Sans", sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillStyle = color;
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let row = "";
    for (const word of para.split(/\s+/)) {
      const next = row ? `${row} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && row) {
        lines.push(row);
        row = word;
      } else row = next;
    }
    lines.push(row);
  }
  lines.slice(0, maxLines).forEach((row, i) => {
    let str = row;
    if (i === maxLines - 1 && lines.length > maxLines) {
      while (ctx.measureText(`${str}…`).width > maxWidth && str.length)
        str = str.slice(0, -1);
      str += "…";
    }
    ctx.fillText(str, x, y + i * lineHeight, maxWidth);
  });
  return Math.min(lines.length, maxLines) * lineHeight;
}
function fitted(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  color = PAPER,
  weight = 700,
) {
  ctx.font = `${weight} ${size}px "DejaVu Sans", sans-serif`;
  const measured = ctx.measureText(text).width;
  label(
    ctx,
    text,
    x,
    y,
    Math.min(size, (size * width) / Math.max(1, measured)),
    color,
    weight,
  );
}
function circle(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke?: string,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
function sourceSize(source: CanvasImageSource): [number, number] {
  const value = source as unknown as {
    videoWidth?: number;
    videoHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number;
    height?: number;
    displayWidth?: number;
    displayHeight?: number;
  };
  return [
    value.videoWidth ||
      value.naturalWidth ||
      value.displayWidth ||
      value.width ||
      1,
    value.videoHeight ||
      value.naturalHeight ||
      value.displayHeight ||
      value.height ||
      1,
  ];
}
export function drawMedia(
  ctx: Ctx,
  source: CanvasImageSource,
  rect: Rect,
  clip: Clip,
) {
  const [sw, sh] = sourceSize(source),
    factor =
      (clip.fit === "contain"
        ? Math.min(rect.w / sw, rect.h / sh)
        : Math.max(rect.w / sw, rect.h / sh)) * clip.scale;
  const w = sw * factor,
    h = sh * factor;
  ctx.drawImage(
    source,
    rect.x + (rect.w - w) / 2 + clip.x,
    rect.y + (rect.h - h) / 2 + clip.y,
    w,
    h,
  );
}
/** Original procedural poster art. No downloaded/copyrighted character imagery. */
export function drawCharacter(
  ctx: Ctx,
  rect: Rect,
  variant: number,
  accent: string,
  time = 0,
) {
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  const scale = Math.max(rect.w / 570, rect.h / 710);
  ctx.scale(scale, scale);
  ctx.translate(0, 25);
  const palette = [
    ["#dce8df", "#141d2a", "#dc6b52"],
    ["#e3d9ee", "#251a37", "#a891db"],
    ["#d5dce6", "#151a24", "#7da9b4"],
    ["#d9c8b3", "#30231d", "#cb9a51"],
    ["#dedfe9", "#1a2539", "#82aabe"],
  ][variant % 5]!;
  const [skin, hair, cloth] = palette;
  const glow = ctx.createRadialGradient(0, -120, 5, 0, -120, 380);
  glow.addColorStop(0, accent + "55");
  glow.addColorStop(1, accent + "00");
  ctx.fillStyle = glow;
  ctx.fillRect(-400, -480, 800, 960);
  ctx.save();
  ctx.rotate(-0.12);
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 ? accent + "18" : "#ffffff09";
    ctx.fillRect(-420, -340 + i * 78, 840, 25);
  }
  ctx.restore();
  circle(ctx, 0, -115, 192, "#ffffff06", accent + "4d");
  circle(ctx, 0, -115, 215, "#00000000", accent + "22");
  // Back hair and angular flowing coat.
  polygon(
    ctx,
    [
      [-81, -270],
      [-142, -175],
      [-126, -30],
      [-178, 89],
      [-88, 52],
      [30, 91],
      [134, 27],
      [111, -182],
      [54, -280],
    ],
    hair!,
  );
  polygon(
    ctx,
    [
      [-94, -12],
      [-205, 76],
      [-273, 337],
      [-182, 419],
      [0, 395],
      [195, 426],
      [268, 340],
      [196, 78],
      [82, -12],
    ],
    hair!,
    cloth!,
  );
  polygon(
    ctx,
    [
      [-65, -20],
      [-143, 71],
      [-84, 206],
      [-117, 406],
      [12, 406],
      [26, 67],
    ],
    "#273440",
  );
  polygon(
    ctx,
    [
      [67, -21],
      [135, 82],
      [86, 210],
      [121, 407],
      [4, 405],
      [-14, 70],
    ],
    "#18212c",
  );
  polygon(
    ctx,
    [
      [-143, 72],
      [-205, 95],
      [-251, 322],
      [-180, 361],
      [-123, 195],
    ],
    "#202c3b",
  );
  polygon(
    ctx,
    [
      [137, 74],
      [193, 102],
      [232, 318],
      [171, 353],
      [122, 201],
    ],
    "#111b27",
  );
  // Neck, face, cheek shadows.
  polygon(
    ctx,
    [
      [-38, -90],
      [-35, -14],
      [0, 21],
      [42, -14],
      [35, -99],
    ],
    skin!,
  );
  polygon(
    ctx,
    [
      [-84, -213],
      [-78, -123],
      [-49, -76],
      [0, -51],
      [53, -80],
      [81, -130],
      [83, -219],
      [7, -264],
    ],
    skin!,
  );
  polygon(
    ctx,
    [
      [16, -245],
      [81, -212],
      [73, -128],
      [42, -78],
      [0, -52],
      [17, -113],
    ],
    "#8792a0",
  );
  polygon(
    ctx,
    [
      [-78, -158],
      [-99, -171],
      [-91, -125],
      [-73, -110],
    ],
    skin!,
  );
  polygon(
    ctx,
    [
      [75, -161],
      [94, -175],
      [87, -131],
      [73, -114],
    ],
    "#8792a0",
  );
  // Asymmetric spiked fringe.
  polygon(
    ctx,
    [
      [-98, -183],
      [-126, -229],
      [-92, -233],
      [-104, -276],
      [-60, -270],
      [-30, -311],
      [-8, -279],
      [42, -309],
      [51, -276],
      [102, -259],
      [84, -233],
      [111, -191],
      [68, -211],
      [54, -170],
      [25, -228],
      [8, -180],
      [-20, -229],
      [-48, -177],
      [-54, -224],
    ],
    hair!,
  );
  polygon(
    ctx,
    [
      [-65, -260],
      [-30, -282],
      [-41, -232],
      [-66, -210],
    ],
    "#ffffff19",
  );
  // Eyes and brow, bright iris accents.
  line(ctx, -62, -162, -22, -158, hair!, 5);
  line(ctx, 25, -159, 62, -166, hair!, 5);
  polygon(
    ctx,
    [
      [-63, -152],
      [-25, -146],
      [-44, -139],
    ],
    "#f3f1e8",
  );
  polygon(
    ctx,
    [
      [24, -147],
      [64, -155],
      [44, -139],
    ],
    "#f3f1e8",
  );
  line(ctx, -44, -149, -44, -140, accent, 5);
  line(ctx, 43, -150, 43, -141, accent, 5);
  line(ctx, 0, -142, -7, -115, "#5f6770", 2);
  line(ctx, -7, -115, 8, -114, "#5f6770", 2);
  line(ctx, -18, -95, 20, -98, hair!, 2);
  // Raised collar and scarf with a long windblown ribbon.
  polygon(
    ctx,
    [
      [-91, -34],
      [-60, -60],
      [-2, -13],
      [60, -62],
      [96, -32],
      [73, 33],
      [-66, 31],
    ],
    cloth!,
  );
  polygon(
    ctx,
    [
      [-71, -25],
      [2, 3],
      [78, -28],
      [66, 10],
      [-12, 41],
      [-69, 16],
    ],
    accent,
  );
  polygon(
    ctx,
    [
      [-36, 29],
      [-92, 73],
      [-193, 43],
      [-288, 75],
      [-221, 28],
      [-167, 11],
      [-95, 36],
    ],
    cloth!,
  );
  polygon(
    ctx,
    [
      [41, 21],
      [83, 83],
      [61, 210],
      [36, 166],
      [12, 47],
    ],
    cloth!,
  );
  // Costume seams, clasps and diagonal sword.
  line(ctx, -111, 122, -139, 290, cloth!, 2);
  line(ctx, 111, 123, 138, 289, cloth!, 2);
  line(ctx, 0, 78, 0, 355, "#ffffff22", 2);
  for (let i = 0; i < 4; i++) circle(ctx, 20, 112 + i * 46, 4, accent);
  ctx.save();
  ctx.translate(126, 184);
  ctx.rotate(0.4);
  ctx.fillStyle = "#080e16";
  ctx.fillRect(-7, -36, 14, 250);
  ctx.fillStyle = "#c5cfce";
  ctx.fillRect(-3, -186, 6, 157);
  ctx.fillStyle = accent;
  ctx.fillRect(-29, -33, 58, 9);
  for (let i = 0; i < 7; i++)
    line(ctx, -7, -22 + i * 9, 7, -14 + i * 9, cloth!, 3);
  ctx.restore();
  for (let i = 0; i < 15; i++) {
    const phase = i * 2.399;
    const x = Math.sin(phase) * 260,
      y = ((i * 83 + time * 15) % 670) - 340;
    ctx.fillStyle = i % 3 === 0 ? accent + "bb" : "#ffffff55";
    ctx.fillRect(x, y, (i % 3) + 1, (i % 3) + 1);
  }
  ctx.restore();
}
function layout(project: Project, w: number, h: number) {
  const portrait = h > w;
  const pad = portrait ? 58 : 76;
  const media: Rect = portrait
    ? { x: 30, y: 100, w: w - 60, h: h * 0.49 }
    : {
        x: project.template === "analysis" ? 0 : w * 0.46,
        y: 0,
        w: w * 0.54,
        h,
      };
  const text: Rect = portrait
    ? { x: pad, y: h * 0.58, w: w - pad * 2, h: h * 0.35 }
    : {
        x: project.template === "analysis" ? w * 0.53 : pad,
        y: 140,
        w: w * 0.4,
        h: h - 200,
      };
  return { portrait, pad, media, text };
}
function background(
  ctx: Ctx,
  p: Project,
  w: number,
  h: number,
  clip: Clip,
  time: number,
) {
  ctx.fillStyle = clip.color ?? INK;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, clip.color ?? "#202431");
  g.addColorStop(0.55, "#10141d");
  g.addColorStop(1, "#24262b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 0.24;
  for (let x = 0; x < w; x += 64) line(ctx, x, 0, x, h, "#667088", 0.5);
  for (let y = 0; y < h; y += 64) line(ctx, 0, y, w, y, "#667088", 0.5);
  ctx.restore();
  const glow = ctx.createRadialGradient(
    w * 0.82,
    h * 0.28,
    0,
    w * 0.82,
    h * 0.28,
    w * 0.62,
  );
  glow.addColorStop(0, p.accent + "20");
  glow.addColorStop(1, p.accent + "00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 12; i++) {
    const x = (i * 137 + time * 5) % w,
      y = (i * 89) % h;
    circle(ctx, x, y, 0.8, "#ffffff36");
  }
}
function mediaLayer(
  ctx: Ctx,
  p: Project,
  scene: Scene | undefined,
  entry: ContentEntry | undefined,
  clip: Clip,
  time: number,
  w: number,
  h: number,
  media: Map<string, CanvasImageSource>,
) {
  const l = layout(p, w, h);
  const variant = Math.max(
    0,
    p.entries.findIndex((e) => e.id === entry?.id),
  );
  if (scene?.kind === "summary") return;
  const draw = (
    rect: Rect,
    assetId: string | undefined,
    index: number,
    lookupClip = true,
  ) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    const camera = cameraTransform(
      clip.animation,
      time,
      clip.duration,
      rect.w,
      rect.h,
    );
    ctx.translate(
      rect.x + rect.w / 2 + camera.x,
      rect.y + rect.h / 2 + camera.y,
    );
    ctx.rotate(camera.rotation);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-rect.x - rect.w / 2, -rect.y - rect.h / 2);
    const source =
      (lookupClip ? media.get(clip.id) : undefined) ??
      (assetId ? media.get(assetId) : undefined);
    if (source) drawMedia(ctx, source, rect, clip);
    else {
      ctx.translate(clip.x, clip.y);
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.scale(clip.scale, clip.scale);
      ctx.translate(-rect.x - rect.w / 2, -rect.y - rect.h / 2);
      drawCharacter(ctx, rect, index, p.accent, time);
    }
    ctx.restore();
  };
  if (p.template === "comparison" && scene?.kind === "entry") {
    const gap = 12;
    const top = l.portrait ? 140 : 70;
    const mh = l.portrait ? h * 0.45 : h - 240;
    if (
      clip.mediaRole === "secondary" ||
      (!clip.mediaRole && clip.id.endsWith("-secondary"))
    )
      draw(
        { x: w / 2 + gap / 2, y: top, w: w / 2 - 50 - gap / 2, h: mh },
        clip.assetId ?? entry?.secondaryMediaId,
        (variant + 1) % 5,
      );
    else
      draw(
        { x: 50, y: top, w: w / 2 - 50 - gap / 2, h: mh },
        clip.assetId ?? entry?.mediaId,
        variant,
      );
    return;
  }
  if (scene?.kind === "intro" || scene?.kind === "outro") {
    draw(
      l.portrait
        ? { x: 0, y: 0, w, h: h * 0.65 }
        : { x: w * 0.42, y: 0, w: w * 0.65, h },
      clip.assetId,
      variant,
    );
    const g = ctx.createLinearGradient(
      l.portrait ? 0 : w * 0.33,
      l.portrait ? h * 0.2 : 0,
      l.portrait ? 0 : w * 0.85,
      l.portrait ? h * 0.7 : 0,
    );
    g.addColorStop(0, l.portrait ? "#11151d00" : INK);
    g.addColorStop(1, l.portrait ? INK : "#11151d00");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  draw(l.media, clip.assetId ?? entry?.mediaId, variant);
  const g = ctx.createLinearGradient(
    l.portrait ? 0 : l.media.x,
    l.portrait ? l.media.y + l.media.h * 0.65 : 0,
    l.portrait ? 0 : l.media.x + l.media.w,
    l.portrait ? l.media.y + l.media.h : 0,
  );
  if (l.portrait) {
    g.addColorStop(0, "#11151d00");
    g.addColorStop(1, INK);
  } else if (p.template === "analysis") {
    g.addColorStop(0, "#11151d00");
    g.addColorStop(0.75, "#11151d00");
    g.addColorStop(1, INK);
  } else {
    g.addColorStop(0, INK);
    g.addColorStop(0.3, "#11151d00");
    g.addColorStop(1, "#11151d00");
  }
  ctx.fillStyle = g;
  ctx.fillRect(l.media.x, l.media.y, l.media.w, l.media.h);
}
function textLayer(
  ctx: Ctx,
  p: Project,
  scene: Scene | undefined,
  entry: ContentEntry | undefined,
  clip: Clip,
  time: number,
  w: number,
  h: number,
) {
  const l = layout(p, w, h),
    accent = clip.color ?? p.accent;
  const title = clip.text ?? scene?.title ?? clip.label;
  const anim = clip.animation;
  const tp = progressAt(time, anim.delay, anim.duration * 1.6, anim.easing);
  const text = visibleText(title, anim.text, tp);
  const textScale =
    anim.text === "scale"
      ? lerp(0.76, 1, tp)
      : anim.text === "kinetic"
        ? 1 + Math.sin(clamp(tp) * Math.PI) * 0.08 * anim.intensity
        : 1;
  ctx.save();
  ctx.translate(l.text.x, l.text.y);
  ctx.scale(textScale, textScale);
  ctx.translate(-l.text.x, -l.text.y);
  label(ctx, "KURO  /  ORIGINAL STORIES", l.pad, 38, 12, PAPER);
  label(ctx, TEMPLATES[p.template].tagline, l.pad, h - 45, 11, MUTED);
  label(
    ctx,
    String(p.entries.length).padStart(2, "0") +
      "  /  " +
      p.template.toUpperCase(),
    w - 250,
    h - 45,
    11,
    MUTED,
  );
  if (scene?.kind === "intro" || scene?.kind === "outro") {
    const y = l.portrait ? h * 0.65 : 180;
    label(
      ctx,
      scene.kind === "intro" ? "THE CHARACTER FILES" : "UNTIL THE NEXT CHAPTER",
      l.pad,
      y,
      15,
      accent,
    );
    const used = wrap(
      ctx,
      text,
      l.pad,
      y + 44,
      l.portrait ? w - 2 * l.pad : w * 0.56,
      l.portrait ? 76 : 78,
      l.portrait ? 91 : 88,
      PAPER,
      4,
      700,
    );
    line(ctx, l.pad, y + used + 76, l.pad + 66, y + used + 76, accent, 4);
    wrap(
      ctx,
      scene.subtitle,
      l.pad,
      y + used + 102,
      w * 0.65,
      17,
      28,
      MUTED,
      2,
    );
    ctx.restore();
    return;
  }
  if (scene?.kind === "summary") {
    label(
      ctx,
      p.template === "ranking" ? "THE COMPLETE LIST" : "THE FINAL CHAPTER",
      l.pad,
      108,
      14,
      accent,
    );
    fitted(ctx, text, l.pad, 144, w - 2 * l.pad, 58);
    const perPage = l.portrait ? 10 : 6,
      totalPages = Math.max(1, Math.ceil(p.entries.length / perPage));
    const page = Math.min(
      totalPages - 1,
      Math.floor(time / Math.max(0.001, clip.duration / totalPages)),
    );
    const ordered =
      p.template === "ranking"
        ? [...p.entries].sort((a, b) => a.rank - b.rank)
        : p.entries;
    const rows = ordered.slice(page * perPage, (page + 1) * perPage);
    const top = 244,
      rowH = l.portrait ? 112 : 62;
    rows.forEach((e, i) => {
      const y = top + i * rowH;
      line(ctx, l.pad, y + rowH - 10, w - l.pad, y + rowH - 10, "#ffffff20");
      label(ctx, String(e.rank).padStart(2, "0"), l.pad, y, 26, accent);
      fitted(
        ctx,
        e.name,
        l.pad + 70,
        y + 1,
        w * (p.template === "comparison" ? 0.32 : 0.45),
        24,
      );
      if (p.template === "comparison") {
        const categories = e.categories?.length
          ? e.categories
          : [{ score: e.score, comparisonScore: e.comparisonScore }];
        const left = categories.reduce((a, c) => a + c.score, 0),
          right = categories.reduce((a, c) => a + c.comparisonScore, 0);
        const winner =
          left === right
            ? "DRAW"
            : left > right
              ? e.name
              : (e.opponentName ?? "Challenger");
        fitted(
          ctx,
          `WINNER: ${winner}`,
          w - l.pad - 350,
          y + 4,
          350,
          17,
          accent,
        );
      } else label(ctx, `${e.score} / 100`, w - l.pad - 155, y + 4, 18, MUTED);
    });
    if (totalPages > 1)
      label(ctx, `PAGE ${page + 1} / ${totalPages}`, l.pad, h - 82, 12, MUTED);
    ctx.restore();
    return;
  }
  if (p.template === "comparison") {
    const top = l.portrait ? h * 0.64 : h - 225;
    const opponent =
      p.entries[
        (Math.max(
          0,
          p.entries.findIndex((e) => e.id === entry?.id),
        ) +
          1) %
          Math.max(1, p.entries.length)
      ];
    const second = entry?.opponentName ?? opponent?.name ?? "Challenger";
    label(
      ctx,
      "HEAD TO HEAD  /  " + (entry?.subtitle ?? "COMPARISON"),
      l.pad,
      86,
      13,
      accent,
    );
    fitted(ctx, text, 50, top, w * 0.42, 37);
    fitted(ctx, second, w / 2 + 28, top, w * 0.42, 37);
    circle(ctx, w / 2, l.portrait ? h * 0.4 : h * 0.4, 32, accent);
    label(
      ctx,
      "VS",
      w / 2 - 18,
      (l.portrait ? h * 0.4 : h * 0.4) - 12,
      22,
      INK,
      700,
    );
    const score = entry?.score ?? 80,
      opponentScore = entry?.comparisonScore ?? 75,
      categories = entry?.categories?.length
        ? entry.categories
        : [
            { label: "POWER", score, comparisonScore: opponentScore },
            {
              label: "STRATEGY",
              score: score - 7,
              comparisonScore: opponentScore + 2,
            },
            {
              label: "RESOLVE",
              score: score - 14,
              comparisonScore: opponentScore + 4,
            },
          ];
    for (let i = 0; i < categories.length; i++) {
      const y = top + 65 + i * Math.min(42, 126 / categories.length),
        category = categories[i]!;
      const a = clamp(category.score / 100) * clamp(tp),
        b = clamp(category.comparisonScore / 100) * clamp(tp);
      fitted(
        ctx,
        category.label.toUpperCase(),
        w / 2 - 60,
        y + 2,
        120,
        11,
        MUTED,
      );
      ctx.fillStyle = accent + "25";
      ctx.fillRect(50, y, w / 2 - 130, 12);
      ctx.fillRect(w / 2 + 80, y, w / 2 - 130, 12);
      ctx.fillStyle = accent;
      ctx.fillRect(50, y, (w / 2 - 130) * a, 12);
      ctx.fillStyle = "#e9e8e2";
      ctx.fillRect(w / 2 + 80, y, (w / 2 - 130) * b, 12);
    }
    if (l.portrait)
      wrap(
        ctx,
        entry?.description ?? "",
        l.pad,
        top + 240,
        w - 2 * l.pad,
        24,
        36,
        MUTED,
        5,
      );
    ctx.restore();
    return;
  }
  const x = l.text.x,
    y = l.text.y,
    tw = l.text.w;
  label(
    ctx,
    p.template === "ranking"
      ? `RANK ${String(entry?.rank ?? 1).padStart(2, "0")}  /  ${String(p.entries.length).padStart(2, "0")}`
      : `CHARACTER STUDY  /  ${String(
          Math.max(
            0,
            p.entries.findIndex((e) => e.id === entry?.id),
          ) + 1,
        ).padStart(2, "0")}`,
    x,
    y,
    14,
    accent,
  );
  let nameY = y + 43;
  if (p.template === "ranking") {
    const rank = entry?.rank ?? 1;
    const shown =
      anim.text === "ranking"
        ? Math.max(rank, Math.round(lerp(rank + 8, rank, clamp(tp))))
        : rank;
    label(
      ctx,
      String(shown).padStart(2, "0"),
      x - 6,
      y + 27,
      l.portrait ? 150 : 146,
      accent,
      700,
    );
    nameY = y + 190;
  }
  const used = wrap(
    ctx,
    text,
    x,
    nameY,
    tw,
    l.portrait ? 65 : 57,
    l.portrait ? 78 : 66,
    PAPER,
    2,
    700,
  );
  let bodyY = nameY + used + 24;
  label(ctx, entry?.subtitle ?? scene?.subtitle ?? "", x, bodyY, 13, accent);
  bodyY += 37;
  const description = entry?.description ?? "";
  const descProgress = progressAt(
    time,
    anim.delay + 0.3,
    anim.duration * 2,
    "ease-out",
  );
  const desc = visibleText(description, anim.text, descProgress);
  const descHeight = wrap(
    ctx,
    desc,
    x,
    bodyY,
    tw,
    l.portrait ? 24 : 19,
    l.portrait ? 37 : 30,
    MUTED,
    l.portrait ? 6 : 4,
  );
  bodyY += descHeight + 29;
  if (p.template === "analysis") {
    line(ctx, x, bodyY, x + 3, bodyY + 90, accent, 3);
    wrap(
      ctx,
      `“${entry?.quote ?? ""}”`,
      x + 23,
      bodyY,
      tw - 26,
      l.portrait ? 30 : 24,
      l.portrait ? 43 : 35,
      PAPER,
      3,
    );
    label(
      ctx,
      "MOTIVATION  /  CONFLICT  /  LEGACY",
      x,
      l.portrait ? h - 130 : h - 100,
      11,
      accent,
    );
  } else if (bodyY < h - 100) {
    label(ctx, "POWER INDEX", x, bodyY, 11, MUTED);
    label(
      ctx,
      `${Math.round((entry?.score ?? 0) * clamp(tp))}`,
      x + tw - 44,
      bodyY - 4,
      21,
      PAPER,
    );
    ctx.fillStyle = "#ffffff20";
    ctx.fillRect(x, bodyY + 27, tw, 3);
    ctx.fillStyle = accent;
    ctx.fillRect(
      x,
      bodyY + 27,
      ((tw * (entry?.score ?? 0)) / 100) * clamp(tp),
      3,
    );
  }
  ctx.restore();
}
function effects(
  ctx: Ctx,
  p: Project,
  clip: Clip,
  time: number,
  w: number,
  h: number,
) {
  const accent = clip.color ?? p.accent;
  line(ctx, 28, 28, 70, 28, accent, 2);
  line(ctx, 28, 28, 28, 70, accent, 2);
  line(ctx, w - 28, h - 28, w - 70, h - 28, accent, 2);
  line(ctx, w - 28, h - 28, w - 28, h - 70, accent, 2);
  ctx.fillStyle = accent;
  ctx.fillRect(0, h - 3, w * clamp(time / clip.duration), 3);
  if (clip.animation.transition === "flash") {
    const opacity =
      (1 - clamp(time / clip.animation.duration)) ** 3 *
      0.8 *
      clip.animation.intensity;
    if (opacity > 0) {
      ctx.save();
      ctx.globalAlpha *= opacity;
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
  if (clip.animation.camera === "parallax") {
    ctx.save();
    ctx.globalAlpha *= 0.16;
    ctx.translate(Math.sin(time * 0.3) * 22, 0);
    polygon(
      ctx,
      [
        [w * 0.8, 0],
        [w, 0],
        [w * 0.6, h],
        [w * 0.4, h],
      ],
      accent,
    );
    ctx.restore();
  }
}
/** Stateless renderer shared verbatim between Canvas preview and native MP4 export. */
export function renderFrame(
  ctx: Ctx,
  project: Project,
  time: number,
  media: Map<string, CanvasImageSource> = new Map(),
): void {
  ctx.save();
  ctx.clearRect(0, 0, project.width, project.height);
  ctx.fillStyle = "#090c12";
  ctx.fillRect(0, 0, project.width, project.height);
  const w = 1280,
    h = (project.height / project.width) * w;
  ctx.scale(project.width / w, project.width / w);
  const tracks = project.tracks.filter(
      (t) => t.kind !== "music" && t.kind !== "narration",
    ),
    solo = tracks.some((t) => t.solo && !t.muted);
  for (const track of tracks) {
    if (track.muted || (solo && !track.solo)) continue;
    for (const clip of project.clips.filter(
      (c) => c.trackId === track.id && clipIsActive(c, time),
    )) {
      const local = time - clip.start,
        scene = project.scenes.find((s) => s.id === clip.sceneId),
        entry = project.entries.find(
          (e) => e.id === (clip.entryId ?? scene?.entryId),
        );
      const reveal = revealState(clip.animation, local, clip.duration),
        transition = transitionState(clip.animation, local, clip.duration);
      ctx.save();
      ctx.globalAlpha = clip.opacity * reveal.opacity * transition.opacity;
      const fadeIn = clip.fadeIn ? clamp(local / clip.fadeIn) : 1,
        fadeOut = clip.fadeOut
          ? clamp((clip.duration - local) / clip.fadeOut)
          : 1;
      ctx.globalAlpha *= Math.min(fadeIn, fadeOut);
      if (track.kind !== "media") {
        ctx.translate(clip.x, clip.y);
        ctx.translate(w / 2, h / 2);
        ctx.scale(clip.scale, clip.scale);
        ctx.translate(-w / 2, -h / 2);
      }
      ctx.translate(reveal.x + transition.x, reveal.y + transition.y);
      ctx.translate(w / 2, h / 2);
      ctx.scale(
        reveal.scale * transition.scale,
        reveal.scale * transition.scale,
      );
      ctx.translate(-w / 2, -h / 2);
      const mask = Math.min(reveal.mask, transition.mask);
      if (mask < 1) {
        ctx.beginPath();
        ctx.rect(0, 0, w * mask, h);
        ctx.clip();
      }
      const blur = reveal.blur + transition.blur;
      if (blur > 0.1) ctx.filter = `blur(${blur}px)`;
      switch (track.kind as TrackKind) {
        case "background":
          background(ctx, project, w, h, clip, local);
          break;
        case "media":
          mediaLayer(ctx, project, scene, entry, clip, local, w, h, media);
          break;
        case "text":
          textLayer(ctx, project, scene, entry, clip, local, w, h);
          break;
        case "effects":
          effects(ctx, project, clip, local, w, h);
          break;
      }
      ctx.restore();
    }
  }
  ctx.restore();
}
