# Integration contracts

Repository root /workspace/anime-video-editor. Shared types: src/shared/types.ts (root owns; request changes). No agent modifies package.json/tsconfig/config, another agent's files, or commits. Root integrates and commits. TypeScript ESM with .js import specifiers in Node/shared code (tsx during development), strict compiler.

## Core (core agent)

- src/core/model.ts: defaultAnimation(): Animation; createProject(template?: TemplateId, title?: string): Project; generateSequence(project: Project): Project (preserve assets/audio clips, rebuild scene visual tracks based entries); projectDuration(project): number; validateProject(input: unknown): Project (throw clear error); updateClip(project,id,partial): Project; replaceAsset(project,oldId,newAsset): Project; cloneProject(project): Project.
- src/core/animation.ts: exported easing/interpolation/effect helpers deterministic by seconds.
- src/core/render.ts: renderFrame(ctx: CanvasRenderingContext2D, project: Project, time: number, media: Map<string, CanvasImageSource>): void. Canvas fits project.width/height; caller may scale canvas context for thumbnail. Images/video frame sources keyed asset id. Use shared functions in UI/Node. @napi-rs/canvas context cast only at Node boundary. All graphics layers are controlled by active timeline clips (track order, muted/solo); audio tracks excluded from visual solo.
- Default project: 5 editable original character entries, procedurally drawn character silhouettes when no media (no copyrighted assets), six required tracks with ids equal kind. 16:9 1280x720/30 default. createProject generates sequence. Templates differ materially: ranking, analysis, split comparison. Intro/outro/summary.
- Tests own tests/core.test.ts. Fonts use 'DejaVu Sans' with local bundled TTF.

## Audio (audio agent)

- src/audio/music.ts exports MUSIC_LIBRARY: MusicOption[] and synthesizeMusic(id: string): PCM.
- src/audio/mixer.ts exports interface PCM {sampleRate:number; channels: Float32Array[]}; mixAudio(project:Project,sources:Map<string,PCM>, sampleRate?:number): PCM; encodeWav(pcm:PCM): Uint8Array; waveform(pcm:PCM,bins?:number):number[]. Mix accounts clip start/trim/duration/loop/volume/mute/solo/fades/normalize, track gain, export modes and amplitude speech activity ducking, common deterministic envelope helpers export for preview. At least four original loopable synthesized compositions, permissive documented origin.
- scripts/generate-music.ts writes public/music/{id}.wav; MUSIC_LIBRARY.file is /music/{id}.wav. public/music/LICENSE.md provenance. tests/audio.test.ts owned.

## Render / CLI (render agent)

- src/server/render.ts exports renderProject(project:Project, options:{outputPath:string; onProgress?:(progress:number,message:string)=>void; signal?:AbortSignal; resolveAsset?:(asset:Asset)=>string; width?:number;height?:number; fps?:number}):Promise<{outputPath:string;duration:number;frames:number}>. Uses @napi-rs/canvas shared core drawing; FFmpeg raw frames -> H.264 yuv420p + AAC audio. ffmpeg-static/ffprobe-static optional fallback bundled binaries via root dependencies, process.env.FFMPEG_PATH override or system binaries. Cancellation terminates processes and removes partials. Bounded video frame decoding, local media only. Resolve paths defaults relative JSON/CWD; API resolve callback gets stored path.
- src/server/media-tools.ts exports probeMedia(filePath):Promise<{duration:number;width?:number;height?:number;kind:'image'|'video'|'audio';mime:string}>; decodeAudio(filePath):Promise<PCM>; readWaveform(filePath):Promise<number[]> (use shared audio helper).
- src/server/cli.ts CLI --project file.json --output path.mp4, --audio music|narration|music-narration|silent. Also --create ranking|analysis|comparison --output project.json; optional --duration for quick smoke? document actual.
- Own tests/render.test.ts real integration MP4 using generated fixtures. Coordinate core/audio imports; no mock exports. Expose binary resolution if server needs.

## Local API + Electron (backend agent)

- src/server/app.ts exports createApp({dataDir?:string}={}): express.Express. API uses JSON <=50MB + multer upload. start server src/server/index.ts localhost 4310 default; serve built UI dist/ui and public/ music. Offline local only. require origin localhost; no arbitrary file read routes. Data root env ANIME_STUDIO_DATA or app OS user data. project managed assets copied there. Safe filenames and IDs; atomic JSON writes.
- GET /api/projects -> ProjectSummary[]; POST /api/projects body {template,title} -> Project; GET /api/projects/:id -> Project; PUT /api/projects/:id body Project -> Project; DELETE ... deletes project's JSON only (not asset files); POST /api/projects/:id/duplicate -> Project.
- POST /api/assets multipart field files (multiple) -> Asset[]; GET /api/assets/:id/file -> media. asset path can be absolute local path but URL is API path. Metadata/waveforms via render agent media-tools. uploaded assets remain available after restart. Replace UI updates existing clip references via replaceAsset; server imports normal new asset.
- GET /api/music -> MusicOption[]; built-in wav URLs /music/id.wav. UI adds Asset {id: music.id,builtin:true,path:absolute? or 'public/music/id.wav',url:music.file,kind:'audio',...}. Resolver identifies builtin and resolves bundled public/music.
- POST /api/audio/preview body Project -> mixed WAV Buffer. decode audio with cache; mix using same mixer. Validate references.
- POST /api/exports body {project:Project,outputPath?:string} -> ExportJob; GET /api/exports/:id -> ExportJob; DELETE /api/exports/:id cancellation -> ExportJob; GET /api/exports/:id/file downloads output. Default output managed exports; Electron output path chosen native save dialog.
- Electron src/desktop/main.ts and preload.ts minimal isolated renderer context, native open exported MP4 save path via window.desktop.chooseExportPath(defaultName):Promise<string|null>, window.desktop platform if needed. Electron spawns in-process API, creates browser window localhost server. Build main/preload with esbuild by root. Browser mode can export download via link.
- Own tests/server.test.ts using supertest for persistence/import/safety.

## UI (UI agent)

- Own all src/ui/* and index.html; React + lucide-react. Entry src/ui/main.tsx. Port 5173 proxies /api and /music to 4310. use shared contracts/core renderer/JSON API. No placeholders/fake controls.
- Full polished desktop editor: project browser, template selection, structured editable entries (add/remove) and generate, media import/drop/replace/assign, preview canvas/video frames, six track timeline with drag move/edge trim/seek/select/zoom/mute/solo/order, inspector clip timing/crop/effects/audio fade/normalize, four mood library, narration import/position, ducking controls, audio modes; save/open/export progress/cancel. Useful shortcuts + explicit shortcuts help. dirty tracking/undo redo.
- Original art is procedural drawn in render engine. Use cohesive warm ivory + deep charcoal + coral/orange branding 'Kuro Studio', typography visual hierarchy. Dense professional creative UI, not generic dashboard. Desktop 1440 screen.
- Shared renderFrame canvas every animation frame; video assets via HTMLVideoElement seek on scrubbing and while playback. Preview audio POST /api/audio/preview Project -> WAV objectURL for Audio synced to playhead; fetch once per playback revision. Silence for no audio.

## Root

Scaffold/config/dependencies; integrates tests; end-to-end browser QA; packaging scripts; all top-level docs and orchestration report. No external publish/push/default branch merge. No reference video attached; document original visual assumptions. Windows packaging target + instructions; actual Linux runtime test, Windows runtime cannot be claimed without Windows execution.
