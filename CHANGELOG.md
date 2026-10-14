# Changelog

All notable changes to Polygon Rush are documented here.

## [1.0.0] - 2026-10-14

### Added
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
- Original synthesised soundtrack: 8 composed themes (one per world, plus menu and race) with verse/chorus sections, fills, side-chain pump, echo/reverb and intensity layers that build with speed; ~30 sound effects; haptics; pause/resume and app-background handling.
- Complete menu flow: neutral age screen, generated kid-safe racer names, main menu, shop, missions, daily gift, settings, parental controls, privacy policy.
- Shop with 23 skins, 11 trails, gem packs, No Ads, Starter Pack and Legend Pack (Google Play Billing), plus optional rewarded "free gems".
- Kid-safe AdMob integration: G-rated ads only, child-directed for under-13s, interstitials capped and only between runs.
- Race lobby with leagues and CPU rivals, local 2-player Duel setup, private online rooms with 4-character codes.
- Android project (Capacitor 8, target SDK 36, immersive landscape) and GitHub Actions for debug APKs and signed releases.
