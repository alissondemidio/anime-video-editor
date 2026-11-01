# Architecture

## Current (implemented)
- Core TypeScript timeline types, sample video project and validation.
- Declarative editing presets.
- Next.js editor shell with selected-segment controls.
- Remotion Player preview driven by immutable timeline data.
- Simple exportable project JSON for downstream editing.

## Planned
1. Media ingestion: file selection, FFprobe metadata, thumbnails, content hashes, license/source metadata.
2. SQLite + Drizzle: projects, templates, assets, transcript segments, timeline revisions.
3. Local Whisper service: transcription and timecodes; optional provider adapters.
4. AI scene matcher: deterministic candidate retrieval and confidence-ranked suggestions from indexed media.
5. Timeline interaction: drag, trim, split, reorder, overrides and undo.
6. Render queue: Remotion server render + FFmpeg normalization and validation.
7. Reusable templates and profile-based effects.

## Boundaries
The AI output is validated into a versioned Timeline. Rendering does not depend on a live model. No remote upload by default.

## Example pipeline
Voiceover -> transcription -> semantic annotations -> media retrieval -> timeline proposal -> human editor -> Remotion renderer -> FFmpeg QC -> MP4.

## Suggested persistence schema
Project, CharacterProfile, Template, MediaAsset, Transcript, TimelineRevision, RenderJob. Each MediaAsset stores source, ownership or license declaration, local path and checksums.
