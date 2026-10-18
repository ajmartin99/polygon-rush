# Changelog

All notable changes to Polygon Rush are documented here.

## [Unreleased]

### Added
- **Beat-synced levels:** each Endless level is built on the beat of the song that plays in it. Obstacles arrive on the beat, and fast songs (drum & bass) feel different from chill ones. Daily Run and races stay identical for everyone.
- **Endless heats up:** the further you run, the more chaotic it gets. Moving saws drop from the sky, rise from the ground, sweep tunnels and chase the Roller. Patterns come back to back, gaps tighten and the speed keeps climbing.
- **Difficulty tiers:** Easy (kid friendly, pays 80% gems), Normal, and Extreme (keeps getting harder and pays 1.3x gems).
- **Haunted Daily:** in October the Daily Run plays only Halloween music (4 new licensed spooky tracks plus Haunted Hop and Swing Along), its course is built on their beat, and it looks the part: moon, bats, fog, pumpkin saws and ghost saws from the start.
- **Daily twists:** every day's course has its own starting shape and twist (Saw Storm, Shape Shifter, Gem Shower or Remix), shown on the Daily card. The Daily also has its own fixed soundtrack, the same for everyone.

- **Community levels:** share levels you built and beat to Create → Community. Browse Top Levels (everyone or just friends), Suggested (levels you haven't played yet) and Newest; play, like, save a copy or report. My Shared shows your levels with their plays, clears and likes, and you can update or unshare them. Parents can switch it off in Parental Controls.
- **More badges:** 31 badges in 5 groups (Running, Racing, Level Creator, Friends & Community, Collecting), each with a progress bar, and a toast when you earn one. New ones cover 10,000 m, Extreme 5,000 m, Daily Runs, the Haunted Daily, shape portals, building 10 levels, building together, sharing levels, plays and likes on your levels, beating Community levels and having 5 friends.

### Changed
- Songs no longer cut out between levels: the next song preloads and the two crossfade.
- Typed Free Chat is switched off: players chat only with Quick Chat phrases and emotes. It's still built in and can be turned on later (`VITE_FREE_CHAT` in the app, `FREE_CHAT` on the server). The privacy policy no longer lists chat accounts, emails or messages.

## [1.0.6] - 2026-10-18

Includes 1.0.5 (a rebuild of 1.0.4).

### Added
- **Studio website and support email:** softgamebros.com with the Polygon Rush page and privacy policy; support at polygonrush@softgamebros.com.
- **Friends:** every racer gets a #number after their name (Neon Fox#0427), so lots of people can share a name. Add friends by Name#number, accept or decline requests, see who's online, and invite friends straight into your race or Build Together room. 13+ can also add someone from their player card in a room. Kid-safe: under-13s add only by a typed Name#number, there's no search and no text, Block is on every friend, and parents can switch friends off.
- **Move to a new phone:** Settings makes a backup code with your progress, levels, name and friends; paste it on the new phone. Purchases come back with Restore purchases.
- **My Music:** add your own songs (MP3, WAV, OGG, M4A) in Settings → Soundtrack and play them Off, Mixed in, or Only mine. They stay on the device and are never shared.
- **Your own racer name (13+):** type a name instead of a generated one. It's filtered like chat (plus stricter name rules) and moderators can ban names. Under-13s keep generated names.
- **Name your level (13+):** a pencil button in Level settings lets builders write their own level name; level codes carry it (and typed builder names).
- **Real recorded music:** 26 licensed tracks (CC0 / CC-BY, credited in Settings → Credits) across house, drum & bass, dubstep, electro, trance, eurobeat, synthwave, funk, disco, rock and chiptune. Every run starts on a random song and each level switches to a new one; calm tracks play in the menus. The original synth songs can be mixed back in (Settings → Soundtrack → Classic songs).
- **Map music library:** custom levels can pick any recorded track or classic song, and the credit shows when the level starts. Level codes (v2) carry it; older codes still load.

### Changed
- The chat filter also catches stretched swears ("fuuuuck").
- Level names: 12,500 generated combinations (was a few hundred), and twice as many words for generated racer names (100 × 100).
- The game server now runs at polygon-rush.softgamebros.com.

## [1.0.4] - 2026-10-17

### Added
- **Online lobby after every race:** Back to lobby or Leave from the results; the host's rematch pulls everyone in, even from the podium. The host picks the next track (random, a world, a featured level or one of their own).
- **Podium and emotes:** top 3 on a podium after races, 16 emotes (4 free, 8 in the new Emotes shop tab, 4 Halloween), Quick Chat on the results screen.
- **New classic synth songs:** Arcade Sunrise, Bass Drop Boulevard (dubstep), Neon Nights (EDM), Pixel Drop (chipstep), Skyline Keys (piano house) and Coin Combo (8-bit).
- **Halloween body shapes:** Phantom (ghost), Pumpkin Patch, Tombstone, Bone Head (skull) and Candy Corn Kid change your racer's outline. Same hitbox, and the Glider keeps its arrow.
- **Mid-air flips:** the Roller can flip gravity any time, even in the air (short cooldown so it can't hover).
- **Swipe down to drop:** Jumper and Hopper slam to the ground, the Glider dives (Down arrow or S on keyboards).

### Changed
- Bat Swarm trail: bats flap off in their own directions with a flutter.
- Every new Endless level switches to a different song (shuffled, no repeats until all have played) instead of cycling the six world themes. Menu songs never play during runs.
- Results: the HOST tag no longer cuts off names, and online races no longer show "+0" trophies.

## [1.0.3] - 2026-10-15

### Added
- **Quick Match:** race random players online (13+). It joins the fullest open public race or hosts one, and public rooms start on their own once two racers are in.
- **Private or public rooms:** choose when creating a room, and switch any time as host. Public rooms show a PUBLIC tag to everyone and can be reported. Under-13s keep private code rooms only.
- **Level select:** Endless is split into levels, one per 500 m world. Start from any level you've reached on your difficulty. Use the Levels button on PLAY or Modes → Levels. You start at that level's speed and obstacles, and distance keeps counting from 0 m.
- **Game Modes hub** on the home screen: Endless, Daily Run, One Heart, Gem Rush, Race, Online, Duel and Player Levels.
  - **Daily Run:** the same course for everyone each day, no revives, and 100 gems once a day for reaching 500 m.
  - **One Heart:** one bump and it's over.
  - **Gem Rush:** 60 seconds to grab as many gems as you can; bumps drop 5.
- **Spooky Season (Oct 1 – Nov 7):**
  - A free Wicked Witch skin.
  - Halloween skins: Boo, Mummy, Jack-o'-Lantern, Count Polygon and Rattle Bones.
  - Halloween trails: Candy Corn, Bat Swarm and Ghostly Mist.
  - A haunted menu backdrop and Haunted Daily Run.
  - The new **Haunted Hop** theme.
  - A Trick or Treat profile badge and a Halloween banner.
  - Everything you get stays yours after the event.

### Changed
- The home screen's Duel button moved into Modes; Friends is now **Online**.
- The community server lists race rooms separately from build rooms.

## [1.0.0] - 2026-10-14

### Added
- **Soundtrack playlists:** the main menu has its own theme, each world keeps its signature song, and runs, races and building rotate through a shuffled mix, so no song loops forever. Skip is in the pause menu and Settings, and **Settings → Soundtrack** lets you play any song or take it out of rotation. Builders can pick a song for their level (saved in the level code).
- **9 new songs in new genres:** chiptune, drum & bass, house, rock, tropical, lo-fi, future bass, electro swing and epic (17 songs in total). New drum kits, lead voices, basses and pads.
- **Difficulty:** Easy, Medium or Hard, chosen on first launch (Medium by default) and changeable in Settings. Each has its own speed curve, pattern ramp and best score, and CPU races follow it. Medium now gets harder sooner.
- **Harder combos** that appear as runs heat up: pad over a wide pit, pit–island–pit, two-ring chains, spiked steps, Roller gauntlets, Glider saw gates and a Hopper low roof. All are bot-verified on every difficulty.
- **Player profiles:** a shareable card with title, banner, 3 showcased badges and stats; 16 badges to earn. Tap a player in a lobby or build room to see their card. Game facts only, no free text.
- **Create mode:** a touch level editor with 16 tools (blocks, ledges, spikes, saws, gems, pads, orbs, power-ups, four shape portals, pits, finish line, eraser, move), undo/redo, minimap, test from start or from here, and level settings (name, world, speed, hearts, length).
- Beat-it-to-share verification and compact `PR1-…` level codes; My Levels (play, edit, remix, copy, delete), Enter Code, and four Featured levels from the Polygon Rush team.
- **Build Together:** up to 4 players edit one level live (host-ordered edits, instant local preview, coloured cursors, lock and remove), then race it together.
- **Quick Chat** with preset phrases and emotes in race lobbies and build rooms (parents can switch it off).
- Optional **community server** (`server/`) with Docker and Render deploys: room signalling, **public build rooms** (13+), and **Free Chat** for email-verified players (16+, or 13–15 with a parent's email approval). It filters personal info, links, other apps, grooming questions and bad words, and supports reports, auto-mute, moderation (mute, ban, export), and in-app and web account deletion.
- Chat & Community settings, Community Rules, and new parental controls for Quick Chat, public rooms and Free Chat.
- Missions for beating player-made levels and for building and beating your own.
- Six themed worlds (Bubblegum Bay, Mint Meadow, Sunset Circuit, Ocean Prism, Candy Cosmos, Lemon Lab) with blended transitions, beat-pulsing parallax scenery, stars and suns.
- Hand-crafted look for every track piece: tiled ground, bevelled blocks, glossy spikes, spinning saws, faceted gems, pads, orbs, portals, pickups, mystery boxes and the finish line.
- Character art: rounded shapes, 13 skin patterns (rainbow, galaxy, gold shine, neon, lava…) and 9 expressive faces with blinking, looking and a hurt face.
- Effects: trails for all 11 trail styles, jump/land dust, gem sparkles with floating +1, hit shards, screen shake and flash, portal bursts, confetti, world banners, distance milestones and a BEST flag.
- Dimmed live gameplay behind the menus, animated trail previews in the shop.
- App icon (adaptive with monochrome layer), splash screens, Play Store icon, feature graphic and screenshots, all drawn with the game's own renderer.
- Release docs, monetisation & kid-safety guide, privacy policy page, Play listing copy and a keystore helper.
- Game engine: deterministic 120 Hz physics shared by players, CPU rivals and tests; four shape modes (Jumper, Glider, Roller, Hopper) with shape portals.
- Seeded procedural level generator with a pattern library per shape and speed-scaled spacing; every level type is verified beatable by an automated bot.
- Endless (hearts, shields, magnets, one revive), Race vs 3 CPU rivals with mystery boxes and leagues, 2-player split-screen Duel, and online Friends races.
- CPU rival AI that plans with the real physics and makes human-like mistakes by skill level.
- Rewards: gems, XP & level-ups, missions, trophies; tutorial hints and slow-mo for first-time mechanics.
- Original synthesised soundtrack: composed themes (one per world, plus menu and race) with verse/chorus sections, fills, side-chain pump, echo/reverb and intensity layers that build with speed; ~30 sound effects; haptics; pause/resume and app-background handling.
- Complete menu flow: neutral age screen, generated kid-safe racer names, main menu, shop, missions, daily gift, settings, parental controls, privacy policy.
- Shop with 23 skins, 11 trails, gem packs, No Ads, Starter Pack and Legend Pack (Google Play Billing), plus optional rewarded "free gems".
- Kid-safe AdMob integration: G-rated ads only, child-directed for under-13s, interstitials capped and only between runs.
- Race lobby with leagues and CPU rivals, local 2-player Duel setup, private online rooms with 4-character codes.
- Android project (Capacitor 8, target SDK 36, immersive landscape) and GitHub Actions for debug APKs and signed releases.
