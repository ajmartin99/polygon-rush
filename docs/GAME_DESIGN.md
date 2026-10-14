# Polygon Rush — Game Design

## Pitch
An endless, rhythm-flavoured auto-runner where you **shape-shift** between four polygons. Easy to start (one button), deep to master (four control styles, speed ramps, racing items). Built for everyone from young kids to young adults.

## Core loop
Rush → collect gems → bump/fall (lose a heart) → revive or finish → rewards (gems, XP, missions) → shop cosmetics → rush again.

## Shapes (one button each)
| Shape | Name | Control | Feel |
| --- | --- | --- | --- |
| Square | Jumper | Tap to jump, hold to bounce | Classic precision platforming |
| Triangle | Glider | Hold to climb, release to dive | Thread gates and tunnels |
| Hexagon | Roller | Tap to flip gravity | Floor ↔ ceiling switching |
| Diamond | Hopper | Tap to hop | Keep airborne over spike floors |

Shape **portals** switch modes mid-run. The first time a player meets a shape, the game shows a hint and briefly slows time.

## Physics (deterministic, 120 Hz)
* Track units are tiles. The floor is at y = 0 and the ceiling at y = 8 in non-Jumper sections.
* Jumper: ~2.3-tile jump, 0.5 s airtime. Coyote time (0.08 s) and an input buffer (0.12 s) make it forgiving.
* Hazard hitboxes are smaller than they look; block edges have a step-up tolerance and corner grazes become bonks, not crashes.
* All four modes share one `stepBody` function, used by players, CPU rivals and the automated tests.

## Procedural levels
* Seeded generator (`src/game/generator.ts`). The same seed always builds the same track, so races and online rooms share a course with zero bandwidth.
* A pattern library per shape, weighted by difficulty. Spacing scales with speed so jumps stay fair as the run speeds up.
* Endless speed ramps from 8.6 to 12.6 tiles/s over ~4 km; difficulty ramps over ~5 km. Kid Mode runs at 86 % speed, with gentler patterns and 5 hearts.
* **Every level is machine-verified beatable.** `tests/solvability.test.ts` lets a perfect-timing bot (playing with *enlarged* hazards for a safety margin) clear 12 endless seeds × 4.5 km, kid-mode seeds and race tracks with zero hits.

## Modes
* **Endless:** 3 hearts (5 in Kid Mode). Hearts, shields and magnets appear as pickups. One revive per run (rewarded video or 100 gems).
* **Race:** 900 m vs 3 CPU rivals on a seeded track. Bumps stun instead of killing. Mystery boxes give Boost, Shield, Snowball or Magnet, weighted towards whoever is behind. Gentle rubber-banding keeps races close. Trophies (which never decrease) unlock leagues and stronger rivals.
* **Duel:** 2 players, one device, split screen (top half / bottom half taps). 650 m.
* **Friends (online):** up to 4 players via a 4-character room code. Peer-to-peer (PeerJS/WebRTC) with the host relaying state at 15 Hz; remote racers are interpolated 100 ms in the past. No chat, no free text, no public matchmaking.

## CPU rivals
`BotBrain` searches press/release sequences ~1.25 s ahead with the real physics (memoised, budget-capped DFS), steering fliers toward the next gap. Skill controls how often it fumbles a press, so Bronze rivals stumble and Legend rivals rarely do.

## Economy
* Gems: collected in runs, from race placings, missions, the daily gift, level-ups and optional videos.
* XP: distance and placings → levels, with gem rewards and level-locked skins.
* Missions: 3 active at a time, auto-replaced, tiered.
* Daily gift: 7-day ladder (50 → 500 gems, plus a cosmetic on day 7). Missing a day never resets progress.
* Cosmetics only; nothing for sale changes gameplay.

## Soundtrack & audio
All sound is synthesised live in Web Audio. There are no audio files to license and nothing to download.

**Original soundtrack: 8 composed themes** (`src/core/songs.ts`), written as data: melody, chords, bass, arpeggio and drum grooves.

| # | Theme | Where | Feel |
| --- | --- | --- | --- |
| 1 | Bubblegum Bay | World 1 | Bright bouncy pop, C major, 128 BPM |
| 2 | Mint Meadow | World 2 | Sunny shuffle, G major, 118 BPM |
| 3 | Sunset Circuit | World 3 | Driving synthwave, A minor, 132 BPM |
| 4 | Ocean Prism | World 4 | Dreamy half-time, D major, 120 BPM |
| 5 | Candy Cosmos | World 5 | Spacey and energetic, B minor, 136 BPM |
| 6 | Lemon Lab | World 6 | Quirky funk, F major, 126 BPM |
| 7 | Polygon Plaza | Menus | Chill shuffle, C major, 100 BPM |
| 8 | Rush Hour | Races | Fast and fierce, E minor, 140 BPM |

* Song form: 2-bar intro → A (verse) → B (chorus, with a snare-roll fill) → repeat, with crash cymbals on section changes.
* Instruments: punchy kick with click, snare, closed/open hats and crash; saw + sub bass; detuned two-oscillator lead with vibrato; arpeggio plucks; a wide pad.
* Mixing: side-chain "pump" from the kick, echo (dotted-8th) and reverb sends, a bus compressor and a final limiter. Tuned for phone speakers (bright mids, no mud), around −16 dBFS RMS.
* **Dynamic intensity:** the arpeggio, 16th-note hats and a doubled lead fade in as an Endless run speeds up. Each new world crossfades to its theme on the next bar line.
* `tests/songs.test.ts` validates every song. `audio.renderOffline()` renders any song for previews and level checks.
* ~30 sound effects (jumps, flips, gem combos that climb the scale, hits, portals, items, UI), haptics on supported phones.
