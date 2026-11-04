# Kuro Studio original music

The four included recordings and their compositions were created specifically for
Kuro Studio using the original deterministic synthesis/composition source in
`src/audio/music.ts`. No recordings, commercial tracks, sampled instruments,
third-party melodies, external music models, or paid services were used.

These original compositions, synthesizer-generated recordings, and their musical
event data are dedicated to the public domain under **CC0 1.0 Universal**:
https://creativecommons.org/publicdomain/zero/1.0/

To the extent permitted by law, the contributors waive copyright and related
rights in these musical works and recordings. You may copy, adapt, redistribute,
and use them in commercial or noncommercial videos without attribution. They are
provided without warranties.

| Recording | Character | Tempo | Length |
| --- | --- | --- | --- |
| Paper Lanterns | Curious/playful pentatonic mallets and plucked bass | 112 BPM | 8 bars / 17.14 s |
| Midnight Archive | Mysterious minor suspended pads and bells | 78 BPM | 8 bars / 24.62 s |
| Rival Circuit | Energetic synth arpeggios and electronic percussion | 132 BPM | 8 bars / 14.55 s |
| After the Rain | Emotional strings, felt keys, and a rising melody | 84 BPM | 8 bars / 22.86 s |

Recreate the 44.1 kHz stereo 16-bit WAV files with `npm run music`. Releases and
echoes wrap around each eight-bar loop; no tail is truncated at the loop point.
The synthesis is deterministic. Tracks target restrained RMS loudness (about
−20 dBFS) with additional peak headroom for spoken narration. Musical quality is
that of an intentionally minimal procedural underscore, not a live orchestra.
