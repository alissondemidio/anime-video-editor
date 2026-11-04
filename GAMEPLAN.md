# Delivery plan

1. Inspect the repository and available attachments. Completed: initial repository had README/.gitignore only; the request was the sole attachment, with no reference video.
2. Establish local-first architecture and shared project/core/audio/API contracts. Completed in `docs/CONTRACTS.md`.
3. Implement independent workstreams concurrently: core/templates, audio/composition, rendering/CLI, React editor, persistence/Electron.
4. Integrate types and behavior; build application and original music.
5. Exercise project/template/timeline/assets/audio/persistence/export using unit and integration tests, including real MP4 + FFprobe.
6. Exercise the editor end to end in Chromium, inspect visual output, correct failures, and validate packaging.
7. Review independently, document actual coverage and limits, and commit the integration branch without publishing or merging the default branch.

Acceptance workflow: five-entry ranking → import media → generate/preview → select music → import/position narration → enable ducking → save/reopen → export music+narration → export music only → reuse template with replaced content. Analysis and comparison templates share the same schema and frame/audio engines.

Final status and actual checks are recorded in `TESTING.md` and `FEATURES.md`; orchestration records include unavailable metrics explicitly rather than invented estimates.
