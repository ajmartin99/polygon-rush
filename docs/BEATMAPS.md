# Beat maps

Every recorded song has a beat map in `src/data/beatmaps.json`: the time of each beat as it really is in the audio, every half-beat in between, and how hard the drums hit on each one. The game charts its jumps on these (Endless, Haunted Run, Holiday Run, Boss Battles), so a player who just presses on the beat they hear clears the course.

## Why

The old charts assumed a perfectly steady tempo from one BPM number and a start offset. Measured against the audio, those grids drifted 100–300 ms off the real beat on most songs (about a third of a beat), and a few songs had the wrong BPM altogether. The maps follow the song's actual timing.

## How a map is made

`tools/beatmap/analyze.py` (Python, librosa):

1. Splits off the drums (harmonic/percussive separation) and measures where they hit (onset strength), plus a kick-drum band below 160 Hz.
2. Tracks the beat, trying the tagged BPM and its double and half, and keeps the steadiest one that lines up with the drums.
3. Snaps each beat to the nearest drum hit (±35 ms), fills a missed beat, drops a doubled one and smooths jitter without losing real tempo drift.
4. Fixes the classic mistakes: if the kicks land between the beats it found (it followed the hi-hats), it shifts half a beat; if it counted at half speed, it splits every beat.
5. Scores every beat and half-beat ("tick") by how hard the kick and drums hit there, and stores the loudness around it (quiet parts become breathers).

## How the game uses it

- `src/core/beatmaps.ts` reads the maps. `bestTick` picks the strongest hit near where the next tap is due. Easy prefers main beats; harder levels also use strong half-beats.
- Courses place obstacles at exact positions (a fraction of a tile), not on the tile grid.
- Obstacles are centred on the *window of presses that clear them*, not just the top of the jump. Pits and blocks sit a little after the peak, because a jump has to be up before it reaches them.
- The music runs ahead of the course by the phone's audio output delay plus the player's own **Beat timing** (Settings → Calibrate), so the beat you hear arrives as you reach the obstacle.
- The screen pulses (Show the beat, Lights Out's candle, the menu tree) follow the map too.

## Tested

`tests/onbeat.test.ts` and `tests/onbeat-courses.test.ts` play every song with a player who never looks at the course and only presses when the music says. These are the windows that pass on every song:

| | Early | Late |
|---|---|---|
| Endless Easy | 100 ms | 90 ms |
| Endless Normal | 60 ms | 90 ms |
| Endless Extreme | 60 ms | 60 ms |
| Haunted/Holiday Easy | 100 ms | 80 ms |
| Haunted/Holiday Hard | 60 ms | 60 ms |
| Boss Battles | 60 ms | 60 ms |

## Adding a song

```
pip install librosa
python3 tools/beatmap/analyze.py --report          # every song
python3 tools/beatmap/analyze.py new-song.mp3       # just one
```

Then copy the reported BPM and first beat into its entry in `src/core/tracks.ts`. A test fails if a recorded song has no map.
