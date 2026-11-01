# AI agent rules

Mission: build a local-first voiceover-driven video editor with user-supplied and licensed media. Read README and docs before editing.

## Boundaries
- Do not fetch, scrape or bundle copyrighted anime footage. Use original/authorized demo assets.
- Never upload local media, narration or scripts to external services unless the owner explicitly approves.
- Do not activate paid APIs, cloud rendering, or deployment without consent.
- Never claim a feature works without running relevant tests or rendering a real output.
- Preserve unrelated user edits, secrets, and branch history.
- External publication, billing and third-party account integrations require approval.

## Design contracts
- Timeline is a deterministic data model, not an LLM-owned rendering engine.
- AI may propose scene mappings, but the editor lets users override everything.
- Media assets reference stable IDs, provenance and permitted usage.
- Remotion is the visual engine; keep format adapters independent.
- Prefer TypeScript, strict types, small testable packages, and local-first defaults.

## Workstream ownership
Use isolated feature branches/worktrees for editor UI, core timeline, media library, transcription, matching and export. Shared packages should have one integration owner. Merge after tests.

## Definition of done
Runnable UI, real implementation, tests/build, docs updated, no placeholder claims. Report what is implemented vs planned.
