import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MUSIC_LIBRARY, synthesizeMusic } from "../src/audio/music.js";
import { encodeWav } from "../src/audio/mixer.js";

const directory = new URL("../public/music/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const composition of MUSIC_LIBRARY) {
  const destination = new URL(`${composition.id}.wav`, directory);
  await writeFile(destination, encodeWav(synthesizeMusic(composition.id)));
  console.log(
    `${composition.name}: ${composition.duration.toFixed(2)}s · ${composition.bpm} BPM → ${fileURLToPath(destination)}`,
  );
}
