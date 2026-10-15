# Changelog

All notable changes to Polygon Rush are documented here.

## [1.0.3] - 2026-10-15

### Added
- **Quick Match:** race random players online (13+). It joins the fullest open public race or hosts one, and public rooms start on their own once two racers are in.
- **Private or public rooms:** choose when creating a room, and switch any time as host. Public rooms show a PUBLIC tag to everyone and can be reported. Under-13s keep private code rooms only.
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
