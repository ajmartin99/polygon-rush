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
* **Mid-air controls:** the Roller can flip gravity at any time, including mid-air (0.22 s cooldown between air flips). A quick downward swipe (or Down/S) makes the Jumper and Hopper slam down at 1.35× fall speed and the Glider dive, until they land or press again; the swipe's touch never counts as a jump.
* Track units are tiles. The floor is at y = 0 and the ceiling at y = 8 in non-Jumper sections.
* Jumper: ~2.3-tile jump, 0.5 s airtime. Coyote time (0.08 s) and an input buffer (0.12 s) make it forgiving.
* Hazard hitboxes are smaller than they look; block edges have a step-up tolerance and corner grazes become bonks, not crashes.
* All four modes share one `stepBody` function, used by players, CPU rivals and the automated tests.

## Procedural levels
* Seeded generator (`src/game/generator.ts`). The same seed always builds the same track, so races and online rooms share a course with zero bandwidth.
* A pattern library per shape, weighted by difficulty. Spacing scales with speed so jumps stay fair as the run speeds up.
* **Difficulty** (picked on first launch, Medium by default; changeable in Settings). Each keeps its own best score:

  | | Speed (tiles/s) | Pattern ramp | Hearts | Breathing room |
  | --- | --- | --- | --- | --- |
  | Easy | 8.0 → 11.4 over 5 km | 75 % strength, over 6 km | 4 | +18 % |
  | Medium | 8.6 → 12.8 over 3.6 km | full, over 4 km | 3 | normal |
  | Hard | 9.4 → 13.4 over 3 km | starts at 22 %, full by 3 km | 3 | −14 % |

  CPU races shift track difficulty by −0.12 (Easy) / +0.14 (Hard); online rooms stay the same for everyone. Kid Mode runs at 86 % speed, with gentler patterns and 5 hearts.
* Combo patterns appear as the run gets harder: pad over a wide pit, pit–island–pit, two-ring chains, spiked steps, Roller gauntlets, Glider saw gates and a Hopper low roof.
* **Every level is machine-verified beatable.** `tests/solvability.test.ts` lets a perfect-timing bot (playing with *enlarged* hazards for a safety margin) clear 12 endless seeds × 4.5 km, Hard and Easy seeds, kid-mode seeds and race tracks (up to the hardest CPU setting) with zero hits.

## Modes
* **Endless:** 3 hearts (5 in Kid Mode). Hearts, shields and magnets appear as pickups. One revive per run (rewarded video or 100 gems).
* **Race:** 900 m vs 3 CPU rivals on a seeded track. Bumps stun instead of killing. Mystery boxes give Boost, Shield, Snowball or Magnet, weighted towards whoever is behind. Gentle rubber-banding keeps races close. Trophies (which never decrease) unlock leagues and stronger rivals.
* **Duel:** 2 players, one device, split screen (top half / bottom half taps). 650 m.
* **Levels:** Endless is cut into levels of 500 m (one world each, cycling). Reaching a level's start on a difficulty unlocks it there (up to 40). A run can start from any unlocked level, at that point's speed and pattern difficulty, with distance counted from 0 m, so records and missions still add up. The run gets a fresh runway, no tutorial, and that world's song. Bot tests cover starts at levels 4, 6 and 9.
* **Endless variants** (Home → Modes): **Daily Run** (one seeded course per day for everyone, Medium, no revive, 100 gems once for reaching 500 m), **One Heart** (one heart, no heart pickups, no revive), **Gem Rush** (60 s, extra gems, bumps stun and drop 5 gems, scores gems and pays out half). Each keeps its own record.
* **Online:** **Quick Match** joins a random open public race (fullest first) or hosts one; public rooms start on their own 20 s after a second racer joins. Rooms can be private (code only) or public (13+, parent toggle). Up to 4 players via a 4-character room code. Peer-to-peer (PeerJS/WebRTC) with the host relaying state at 15 Hz; remote racers are interpolated 100 ms in the past. Quick Chat in the lobby; public rooms can be reported.

## Create mode (level maker)
* **Grid levels** (`src/game/level.ts`): rows 0–7 between floor and roof, 30–1200 tiles long. Pieces: block, ledge, spike (up/down), saw (small/big), gem (normal/big), pad (up/down), orb, power-up (heart/shield/magnet), shape portals and pits. Tapping a placed piece again flips or changes it.
* Levels compile to the **same world objects** as generated tracks: blocks merge into rectangles, everything is split to `MAX_OBJ_W`, non-Jumper sections get an automatic roof, and a flat run-out follows the finish. So physics, rendering, CPU rivals and tests all just work.
* **Settings:** generated name, world (colours + song), speed (Chill 8.6 / Normal 10.2 / Turbo 11.8 tiles/s), hearts (1/3/5), length.
* **Editor UX:** palette icons are drawn by the game renderer; drag to paint, two fingers or the Move tool to pan, a minimap to jump around, edge auto-scroll while painting, grouped undo/redo per stroke, Test from the start or from here.
* **Verify to share:** like Geometry Dash, you must beat your own level from the start before its share code unlocks. Any gameplay edit un-verifies it.
* **Share codes:** `PR1-` + base64url of a compact binary format (header, varint x-deltas, one byte per piece, checksum): about 2 bytes per piece.
* **Featured levels** (`src/meta/featured.ts`) teach each shape and are checked by the CPU bot in `tests/featured.test.ts`. Players can remix them.
* Player-made levels give XP-free, gem-free play (no farming); missions reward building and beating levels.

## Build Together (co-op building)
* A **build room** is a NetRoom with `kind: 'build'`. Joining by code works from Create or from Friends.
* The **host orders every edit**: builders apply their own edits instantly as *pending*, send them, and rebase on the host's ordered stream (`SyncedDoc`). Everyone converges on exactly the host's level, which a randomised concurrency test checks.
* Coloured cursors with names, Quick Chat bubbles over cursors, host lock (pause building), remove player, credits for up to 4 builders.
* **Race it:** the host starts an online race on the current level; everyone returns to the editor afterwards.

## Online community & safety
* **Quick Chat** (`src/meta/quickchat.ts`): fixed phrases and emotes sent as indexes. On for everyone by default; parents can switch it off.
* **Optional community server** (`server/`): PeerJS signalling, a **public build room** list (13+), and **Free Chat**.
* **Free Chat** needs an email-verified account: 16+ verify their own email, 13–15 a parent verifies theirs (consent), under-13s never. Typed messages go only through the server (never peer-to-peer), are filtered (`src/shared/chat-filter.ts`), rate-limited, kept 30 days, and are only delivered to other verified players. Report → auto-mute after 3 reporters → moderator review. Details: [SAFETY.md](SAFETY.md).

## CPU rivals
`BotBrain` searches press/release sequences ~1.25 s ahead with the real physics (memoised, budget-capped DFS), steering fliers toward the next gap. Skill controls how often it fumbles a press, so Bronze rivals stumble and Legend rivals rarely do.

## Player profiles
* Tap your level chip to open **Profile**: a card with your racer, title, level and league, best run, trophies, race wins and badge count.
* 16 **badges** are earned from play (distance, Hard mode, gems, wins, leagues, online races, building, jumps, skins, play time). Each badge unlocks a **title**; pin up to 3 badges to the card. Banner colours unlock with your level.
* Other players see the card when they tap you in a room. It is built only from ids and numbers: nothing typed and nothing personal. The receiving game drops unknown ids and clamps every number (`safeCard`).

## Seasonal events
* `src/meta/events.ts` defines date windows. **Spooky Season** runs Oct 1 – Nov 7 (local time; `?event=halloween` / `?event=none` force it for testing).
* While on: Halloween skins (Wicked Witch free gift, Boo, Mummy, Jack-o'-Lantern, Count Polygon, Rattle Bones) and trails (Candy Corn, Bat Swarm, Ghostly Mist) lead the shop; the menu and Daily Run use the Haunted Hollow palette; **Haunted Hop** becomes the menu theme and joins the mix; a menu chip offers the gift. Items bought or claimed stay owned; unowned event items hide from the shop afterwards.
* Profiles gain the **Trick or Treat** badge (3 Halloween items, title *Pumpkin King*) and a Halloween banner.

## Economy
* Gems: collected in runs, from race placings, missions, the daily gift, level-ups and optional videos.
* XP: distance and placings → levels, with gem rewards and level-locked skins.
* Missions: 3 active at a time, auto-replaced, tiered.
* Daily gift: 7-day ladder (50 → 500 gems, plus a cosmetic on day 7). Missing a day never resets progress.
* Cosmetics only; nothing for sale changes gameplay.

## Soundtrack & audio
All sound is synthesised live in Web Audio. There are no audio files to license and nothing to download.

**Original soundtrack: 24 composed songs in 20 genres** (`src/core/songs.ts`), written as data: melody, chords, bass, arpeggio, drum grooves, plus the kit, lead voice, bass and pad tone.

| # | Song | Genre | Where |
| --- | --- | --- | --- |
| 1 | Bubblegum Bay | Bubblegum pop, 128 BPM | World 1 theme |
| 2 | Mint Meadow | Sunny shuffle, 118 BPM | World 2 theme |
| 3 | Sunset Circuit | Synthwave, 132 BPM | World 3 theme |
| 4 | Ocean Prism | Dreamy half-time, 120 BPM | World 4 theme |
| 5 | Candy Cosmos | Space pop, 136 BPM | World 5 theme |
| 6 | Lemon Lab | Funk, 126 BPM | World 6 theme |
| 7 | Polygon Plaza | Chill hop, 100 BPM | Main menu theme |
| 8 | Rush Hour | Fast and fierce, 140 BPM | Races |
| 9 | Pixel Parade | Chiptune, 150 BPM | Mix · races |
| 10 | Turbo Breaks | Drum & bass, 172 BPM | Mix · races |
| 11 | Disco Polygon | House, 124 BPM | Mix |
| 12 | Power Chord Pass | Rock, 144 BPM | Mix · races |
| 13 | Coconut Cruise | Tropical, 104 BPM | Mix |
| 14 | Lo-fi Lagoon | Lo-fi beats, 90 BPM | Menus & building |
| 15 | Neon Bounce | Future bass, 140 BPM | Mix |
| 16 | Swing Square | Electro swing, 128 BPM | Mix |
| 17 | Hero Ascent | Epic, 112 BPM | Mix |
| 18 | Haunted Hop | Spooky swing, 116 BPM | Menu theme in Spooky Season only |
| 19 | Arcade Sunrise | Synth-pop, 112 BPM | **Main menu theme** |
| 20 | Bass Drop Boulevard | Dubstep, 140 BPM (build-up → drop) | Mix · races |
| 21 | Neon Nights | Big-room EDM, 128 BPM (build-up → drop) | Mix · races |
| 22 | Pixel Drop | Chipstep (8-bit + dubstep), 140 BPM | Mix · races |
| 23 | Skyline Keys | Piano house, 124 BPM | Mix |
| 24 | Coin Combo | 8-bit, 156 BPM | Mix · races |

**Playlists** (`src/core/music.ts`). Nothing loops forever: after about 2 minutes the next song starts on a phrase boundary.
* The main menu always opens with its theme, then rotates through the menu songs.
* An Endless run starts with its world's theme, then **every new 500 m level switches to the next song in a shuffled bag** of all run songs (world themes and the mix): every song once before any repeats. Menu songs never play in runs.
* Races use the fast songs. The editor plays calm songs plus the world themes. Player-made levels loop the song their builders picked (or their world's theme); the song is stored in the level code.
* **Skip** is in the pause menu and Settings. **Settings → Soundtrack** lists every song with its genre, a play button, and a switch to take it out of rotation.

* Song form: 2-bar intro → A (verse) → B (chorus, with a snare-roll fill) → repeat, with crash cymbals on section changes.
* **Drop form** (EDM/dubstep): section A is the build-up (riser sweep, accelerating snare roll, half a beat of silence), section B is the drop (impact boom + crash, full bass).
* Instruments: drum kits (punchy, chip, rock, 808, lo-fi, breaks, EDM) with ghost notes and hat rolls; saw, square, sub, wobble, slap and dubstep growl basses; synth, chip, overdriven guitar, brass, mallet, electric-piano and supersaw leads; arpeggio plucks; string, organ and saw pads.
* Mixing: side-chain "pump" from the kick, echo (dotted-8th) and reverb sends, a bus compressor and a final limiter. Tuned for phone speakers (bright mids, no mud), around −16 dBFS RMS.
* **Dynamic intensity:** the arpeggio, 16th-note hats and a doubled lead fade in as an Endless run speeds up. Each new world crossfades to its theme on the next bar line.
* `tests/songs.test.ts` validates every song. `audio.renderOffline()` renders any song for previews and level checks.
* ~30 sound effects (jumps, flips, gem combos that climb the scale, hits, portals, items, UI), haptics on supported phones.
