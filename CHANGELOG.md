# Changelog

All notable changes to Polygon Rush are documented here.

## [Unreleased]

## [1.0.13] - 2026-10-22

### Fixed
- The Settings cogwheel is a proper, even 8-tooth gear (its outline was lopsided).
- Race results fit the screen again: the Home and Race again buttons were pushed off by the emote row; emotes now sit in one row you can swipe, and the runners behind the results screen are hidden (they showed under the podium).

### Changed
- **Easy and Normal Endless are livelier.** New beats mixed in: a bounce pad that launches you high along a gem arc right on the beat (no tap; on Normal sometimes over spikes), a ledge to jump up onto and run along, and on Normal an orb one-two (jump on a beat, tap the floating orb on the next) over a wide pit. The pace also swings between livelier and calmer 16-beat stretches, so a level has highs and lows. Extreme is unchanged.
- **Haunted Run monsters come at you.** Zombies shamble toward you along the ground and ghosts swoop in from ahead on a wavy path, instead of standing still or sinking straight down like pillars. Each one reaches its spot just before you do, so you still jump or fly around it on the beat.
- The menu banner ad sits in a tray that matches the game, instead of the game showing at its sides.

## [1.0.12] - 2026-10-21

### Added
- **Halloween look:** ghosts drift past the moon and a zombie shambles along the home screen during Spooky Season. The website dresses up too (Oct 1 – Nov 7): a witch-hat icon, a Spooky Season box with the Haunted Run's cast, floating ghosts and bats. Spooky Play Store icon and feature graphic are in `store/seasonal/`.
- **Beta deal: everything in the Shop for gems** until the full release, flagged by a "Beta deal" chip on the home screen. No Ads 2,200 gems, Legend Pack 2,950, Starter Pack 3,650 (its No Ads and Golden skin; the 2,500 bonus gems come only with the paid pack), plus Heart Regens and the profile add-ons. Anything bought stays yours after the beta.
- **Pay for Heart Regens with gems.** When you're out of Haunted Run attempts you can now spend gems instead of money: a Heart Regen costs 660 gems and 4 Heart Regens cost 2,200, what the same price buys in gems plus 10%.

- **Profile add-ons** (see a live preview of your own card first, then pay with money or gems):
  - **Creator Spotlight** ($0.99 or 660 gems): your top-rated Community level on your profile card. Anyone who taps you in a room can play it.
  - **Builder Pack** ($2.99 or 2,200 gems): a Creator Stats section on your card (levels shared, plays, thumbs up, clears) and a gold Pro Builder tag on your card and next to your name on your Community levels.
- Find them in Profile > Card add-ons and in the Shop.
- **See other players' profiles outside rooms:** tap **Profile** next to a friend in the Friends list, or **(name)'s profile** on a Community level, to see their card, badges, add-ons and Spotlight level.

### Changed
- **Every Endless level has its own songs.** Each level has a main song and a backup song, and the course is charted to whichever one plays: usually the main, sometimes the backup. During a season the backup is one of the season's songs. Songs can no longer be skipped, picked or switched off, and My Music now plays in the menus and races only. Settings > Soundtrack lists which songs each level plays.
- **Lights Out has a candle and no flashes.** The screen used to light up on every beat, which was hard to play and risky for players sensitive to flashing. Now your runner carries a candle that lights the way ahead. On every beat it gets blown on: the flame leans back, puffs a little smoke and the light pulls in, then it swells back bright. Every change is smooth and stays inside the candle's glow; the rest of the screen stays dark. With Reduce motion the candle burns steady.
- **Rest stops in Endless:** every 2nd level (Level 3, 5, 7…) opens with about 5 easy seconds of gems and no hazards.
- **Beta rewards are earned now.** Joining the test gives the Founding Tester title right away. A test day counts after 5 minutes of active play: 7 test days unlock the Debug Pixels trail and 🧪 emote, 12 the Beta Bot skin and 500 gems (any days, not in a row). Progress shows in Profile. Testers who already received everything keep it.
- Play time now counts towards the Veteran badge (it never did).
- Heart Regens aren't tied to Halloween: unused ones keep for the next limited-time run.
- 4 Heart Regens are now $2.99 (was $1.99), matching the 2,000-gem Gem Chest.

### Fixed
- The banner ad no longer covers the bottom of menu screens. The game always leaves room for it when it's showing, including after coming back to a menu, and none when no ad loaded.
- The racer name screen fits phones held sideways: title and racer on the left, name and Let's Rush! on the right (the title and button were cut off). Taller screens keep one column, and anything that still doesn't fit scrolls.
- The Haunted Run's refill options all fit on screen again (the gem buttons were cut off on phones).
- Retired "Doll House" from the soundtrack: at 25 seconds it was too short for a level. Levels that already use it still play it.
- Live updates now install when you swipe the game closed: a downloaded update is switched to at the next launch, and an update already downloaded is never downloaded again.

## [1.0.11] - 2026-10-19

### Added
- **Live updates:** new maps, obstacles, modes and fixes now reach players without a store update. At launch the game checks for a newer version made for its app build, downloads only the files that changed (the music never re-downloads) and switches to it the next time you leave the app. A version that fails to start rolls back on its own. Published with the new Live Update workflow; no third-party update service. The version in Settings shows the update number.

### Changed
- **New package name for Google Play: `com.softgamebros.polygonrush`** (was `io.github.ajmartin99.polygonrush`). Installed test copies count as a different app: back up your progress code, uninstall the old app, install this one and restore.
- **Endless is charted to the music.** Every tap a level asks for (jump, hop, Roller flip, Glider gate) now lands right on a beat of that level's song, like a rhythm game, on every difficulty and in every Endless mode. Taps come about every 1.6–1.1 s on Easy, 1.2–0.75 s on Normal and 0.8–0.45 s on Extreme, getting faster as the run goes on; Extreme adds three-spike rows, wide pits, block-and-spike combos and saws that drop in on hot runs. The music is kept in tighter sync with your position. Rhythm Rush now lines up: every obstacle is a note.
- **Far fewer gems.** Courses hold about a third of the gems (roughly 100 per km instead of 300), big gems are worth 3, the Haunted Run finish bonus is 300 and boss rewards are halved (150 / 250 / 400). Gem missions are scaled to match.
- **Haunted Run monsters:** zombies now stand in the way on the ground (jump them on the beat) and ghosts drift down to haunt the space above low Glider gates (fly under them). The chaser that followed you is gone.

### Fixed
- Names can't hide misspelled swears any more (e.g. "FucOff", "Phukk", "Biatch").
- On the online race results, Quick Chat moved to the bottom-left so it no longer covers "Back to lobby".
- Releases now stop with a clear error if the signing keystore secrets are missing (a debug-signed build can't update in place or go to Google Play), and the log shows which secrets the build can see.

## [1.0.10] - 2026-10-18

### Changed
- **Battery:** nothing runs in the background any more (the music scheduler stops and Android pauses the game's web view when it leaves the screen). 90/120 Hz screens switch to 60 Hz while the game is open (it never draws faster), Auto graphics renders a little lower, the menu's bobbing animations play a few times and stop, and the menu backdrop demo rests after 45 seconds without a touch.
- **Every Endless level is exactly one song long.** The level starts when its song starts and ends when the song ends, so the music never cuts off mid-song (or right at the drop): the "Level N" banner, the new world and the next song all arrive together. Levels now vary in length with their songs (about 45 seconds to 5 minutes; very short songs play twice). The Levels screen unlocks every level you've reached (older saves convert from their best distance), and each level still hides one Golden Shape.
- **Duels are just for fun:** gems grabbed in a split-screen Duel no longer go into your gem total, and Duels no longer give XP or count toward gem and jump missions (two players on one phone could farm them). The "Play a Duel" mission still counts.
- **Swing Along** now only plays in the Haunted Run: it's out of every playlist, the jukebox and the level song picker (player levels that used it play their world's song instead).

### Added
- **Boss Battles:** fight a giant polygon boss for one whole song. It floats ahead of you and throws its attacks on the beat (spike stomps, saws, pits and walls: jump right on the beat to clear them). Grab the glowing charge orbs to fire them back and drain its health bar before the song ends, or it gets away. Three bosses unlock in order: King Cube (+300 gems the first time), Saw Queen (+500) and Hexa Hydra (+800), with smaller rewards for rematches and two new badges, Boss Slayer and Polygon Champion.
- **Rhythm Rush mode:** every jump, hop, flip and glide is judged against the beat of the music (Perfect / Great / Miss, allowing for your phone's audio delay). On-beat presses build a combo that raises a score multiplier up to ×4; an off-beat press breaks it. A beat ring under the score shows when the next beat lands. Its own best score per difficulty.
- **Lights Out mode:** Endless in pitch dark. Only a small glow surrounds you, and every beat of the music flashes the way ahead for a moment, so you run by rhythm and memory. Its own best per difficulty, and it pays 1.5× gems.
- **Haunted Run chasers:** a zombie shambles after you on the ground (it even follows the Roller onto the ceiling) and bursts into a ghost that swoops after you when you fly as the Glider. It creeps closer all the time; every obstacle you clear cleanly and every gem you grab shoves it back, a bump lets it lunge (GRRR! / BOO!), and if it catches you the run is over. A red glow and a groan warn you when it's right behind you.

## [1.0.9] - 2026-10-18

### Added
- **🎃 Haunted Run (Spooky Season):** its own Halloween mode, separate from the Daily Run. Today's course is charted to Swing Along: every jump, flip, hop and Glider gate lands on the beat, the shape changes with the song's phrases, and the finish line is the end of the song (about 2:13). Very hard from the first beat.
  - **Hard** (Turbo speed, one bump and out) pays 1× gems; **Easy** (slower, more room, 3 hearts) pays 0.5×. Finishing the song pays a 1,200-gem bonus on Hard (600 on Easy).
  - **2 attempts every 24 hours**, shared by both difficulties; your best run counts. A new chart every day, the same for everyone.
  - **Heart Regen** refills your attempts now and starts a fresh 24 hours: 1 for $0.99 or 4 for $1.99 (grown-up check first).
  - New badges: Ghost Runner (finish it) and Nightmare Slayer (finish it on Hard).
- **Studio card on launch:** the Soft-Game Brothers logo with softgamebros.com shows for about 2 seconds when the game opens (tap to skip), on Android's launch screen and in the app.
- The Daily Run is back to its normal course and soundtrack during Halloween (the haunted version became the Haunted Run).

### Changed
- The studio is now named **Soft-Game Brothers** everywhere (website, privacy policy, license, Play listing notes); softgamebros.com stays the web address.
- **Golden Shapes** replace the secret eggs: each Endless level now hides a spinning gold runner form (square, triangle, hexagon or diamond) high above a jump ring. The ones you've found still count on the Levels screen, your profile card and the badges (now Shape Hunter, Treasure Seeker and Golden Collector).

### Fixed
- `app-ads.txt` on softgamebros.com with the Soft-Game Brothers ad publisher id, so AdMob can verify the app's ads.
- The dice button on the name screen (and elsewhere) showed a dark blob: the dice is now white with dark dots on every button colour.


## [1.0.8] - 2026-10-18

### Changed
- **Cooler, longer battery:** gameplay is capped at 60 fps (120 Hz phones were drawing twice as many frames), the menu backdrop, editor and character previews run at 30 fps, nothing is drawn behind full-screen pages (Shop, Settings, Create…), the Auto graphics resolution is a little lower, and the background blur behind panels is only used on High graphics.
- Polygon Rush is now © Soft Game Bros, all rights reserved (it was CC0). README and package details list Soft Game Bros as developer and contact.
- **Level editor is quiet:** no music while building. The level's song plays when you test it, and as a preview while you pick it in Level settings.
- **A level's song is part of the level:** while playing any player-made level (your tests, Community, codes, build-room races) the song can't be skipped or changed.
- **Only builders edit levels:** levels from codes and Community can be played and shared but not edited or remixed. Levels you built, alone or together, stay editable. Saving a copy of a build room you didn't build in is play-only.
- **Host tools in build rooms:** tap a player to stop or allow their building, remove them (they can't rejoin for 10 minutes; others still can), or ban them from every room you host. Manage bans in Create → Build Together → Banned players. In public rooms new players join as watchers until the host lets them build.
- **Home screen fixes (Pixel 9 Pro):** the character's hat no longer gets cut off, the level badge no longer covers your name, and the Settings button matches the others. Violet buttons (Build with friends, Settings) now show their colour.
- Bat Swarm trail: bats now dart upward in erratic zigzags, banking into each turn and flapping faster, instead of bobbing (tester feedback).

### Security
- Backup codes ("Move to a new phone") are now signed: a code that was decoded and edited (for example to add gems) is refused. Codes from 1.0.6–1.0.7 (`PRB1.`) need to be made again after updating.
- Items only a purchase gives (Starter Pack, Legend Pack) are kept only when Google Play confirms the purchase, so they can't be added by editing a save or a backup code.
- Saves and backups with impossible values (huge gem counts, broken lists) are cleaned up instead of crashing the game.

## [1.0.7] - 2026-10-18

### Added
- **Beat-synced levels:** each Endless level is built on the beat of the song that plays in it. Obstacles arrive on the beat, and fast songs (drum & bass) feel different from chill ones. Daily Run and races stay identical for everyone.
- **Endless heats up:** the further you run, the more chaotic it gets. Moving saws drop from the sky, rise from the ground, sweep tunnels and chase the Roller. Patterns come back to back, gaps tighten and the speed keeps climbing.
- **Difficulty tiers:** Easy (kid friendly, pays 80% gems), Normal, and Extreme (keeps getting harder and pays 1.3x gems).
- **Haunted Daily:** in October the Daily Run plays only Halloween music (4 new licensed spooky tracks plus Haunted Hop and Swing Along), its course is built on their beat, and it looks the part: moon, bats, fog, pumpkin saws and ghost saws from the start.
- **Daily twists:** every day's course has its own starting shape and twist (Saw Storm, Shape Shifter, Gem Shower or Remix), shown on the Daily card. The Daily also has its own fixed soundtrack, the same for everyone.

- **Community levels:** share levels you built and beat to Create → Community. Browse Top Levels (everyone or just friends), Suggested (levels you haven't played yet) and Newest; play, like, save a copy or report. My Shared shows your levels with their plays, clears and likes, and you can update or unshare them. Parents can switch it off in Parental Controls.
- **More badges:** 36 badges in 5 groups (Running, Racing, Level Creator, Friends & Community, Collecting), each with a progress bar, and a toast when you earn one. New ones cover 10,000 m, Extreme 5,000 m, Daily Runs, the Haunted Daily, shape portals, building 10 levels, building together, sharing levels, plays and likes on your levels, beating Community levels and having 5 friends.

- **Quick Chat phrase packs:** buy more things to say with gems in Shop → Emotes & Chat: Good Sport, Hype Squad, Slang Pack ("No cap!", "Sheesh!", "GOAT!"), Builder Talk and, for Halloween, Spooky Sayings. Everyone in the room can read them; still preset phrases only, no typing.

- **Secret eggs:** a golden egg hides in each of the 40 Endless levels, high above a jump ring after a launch pad. Tap on the ring at the top of the launch to grab it. Found eggs show on the Levels screen and on your profile card (Secret eggs 12/40), with three new badges: Egg Hunter, Treasure Seeker and Secret Keeper.

- **Beta tester rewards:** everyone who plays a 1.0.x build gets the Beta Bot skin, Debug Pixels trail, 🧪 Beta Tester emote, the Founding Tester badge and title, and 500 gems. They can't be bought and stop being given out at 1.1.0; testers keep them forever.

- **Rate levels:** thumbs up or down at the end of a Community level (or from its card). Community now has **Trending** (most played and liked this week), **Highest Rated**, Suggested, Newest and My Shared; Trending and Highest Rated can show just your friends' levels.
- **Editor guide:** a 4-step walkthrough the first time you open the level editor (pick a piece, place and move, test, beat it and share), and a ? button to see it again.
- **Livelier home screen:** the logo sways, the menu buttons pop in, and tapping your character makes it hop.

- **Beta sign-up page:** "I'm interested in testing" on softgamebros.com leads to a sign-up form (Google Play closed test or sideloaded APK); sign-ups are listed for the studio at `/beta/admin`.

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
- CPU rivals that plan with the real physics and make human-like mistakes by skill level.
- Rewards: gems, XP & level-ups, missions, trophies; tutorial hints and slow-mo for first-time mechanics.
- Original synthesised soundtrack: composed themes (one per world, plus menu and race) with verse/chorus sections, fills, side-chain pump, echo/reverb and intensity layers that build with speed; ~30 sound effects; haptics; pause/resume and app-background handling.
- Complete menu flow: neutral age screen, generated kid-safe racer names, main menu, shop, missions, daily gift, settings, parental controls, privacy policy.
- Shop with 23 skins, 11 trails, gem packs, No Ads, Starter Pack and Legend Pack (Google Play Billing), plus optional rewarded "free gems".
- Kid-safe AdMob integration: G-rated ads only, child-directed for under-13s, interstitials capped and only between runs.
- Race lobby with leagues and CPU rivals, local 2-player Duel setup, private online rooms with 4-character codes.
- Android project (Capacitor 8, target SDK 36, immersive landscape) and GitHub Actions for debug APKs and signed releases.
