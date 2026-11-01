# Anime Video Editor

Local-first, voiceover-driven, template-based video editor for commentary videos.

Upload narration, select an editing template, map timecoded narration segments to media from your own library, refine an editable timeline and export with Remotion.

> **Status:** Working foundational editor and deterministic Remotion preview; transcription, AI matching, local persistence and server rendering are next milestones. No automatic copyrighted-media fetching.

## Stack

- Next.js App Router, TypeScript, React, Tailwind CSS
- Remotion / @remotion/player
- FFmpeg as a planned export/analysis backend
- SQLite + Drizzle as a planned local persistence backend
- Whisper (local) and Ollama behind planned provider adapters

## Start

Requires Node.js 22+ and pnpm 9+.

```bash
corepack enable
pnpm install
pnpm dev
```

Open http://localhost:3000.

Validate with `pnpm check` and `pnpm test`. The current preview uses original generated shapes and a sample narration timeline; it does not download third-party footage.

## Monorepo

- `apps/web`: functional timeline UI and Remotion preview
- `packages/core`: timeline schemas, validation and sample project
- `packages/templates`: declarative editing presets
- `docs`: architecture, roadmap, media policy, decisions
- `AGENTS.md`: bounded agent-work instructions

## Flow

Template → upload/record voiceover (future) → transcription (future) → scene matching (future) → editable timeline → preview → MP4 export (future).

Only media supplied by the user or explicitly licensed for the project may be used. Uploading commentary does not grant rights to anime footage.

## Alignerr note

This repository is a personal project scaffold. Before importing paid-project code or data, verify the Alignerr agreement's IP and confidentiality terms.
