# Polygon Rush

![Polygon Rush](store/feature-graphic-1024x500.png)

**An endless, shape-shifting runner for every age.** Rush through infinite polygon worlds as a **Jumper** (square), **Glider** (triangle), **Roller** (hexagon) and **Hopper** (diamond). Play solo, race CPU rivals, duel a friend on the same phone, or race up to three friends online with a room code.

Think *Geometry Dash* rhythm and precision meets *Fun Run* racing chaos, wrapped in a bright, kid-friendly look with an original soundtrack.

| | |
| --- | --- |
| ![Jumper](store/screenshots/01-jumper.png) | ![Glider](store/screenshots/02-glider.png) |
| ![Roller](store/screenshots/03-roller.png) | ![Race](store/screenshots/05-race.png) |

## Features

* **Four shapes, one button.** Tap to jump, hold to glide, tap to flip gravity, tap to hop. Portals switch shapes mid-run.
* **Endless & always fair.** A seeded procedural generator builds infinite levels that speed up as you go, and an automated bot test proves every level is beatable.
* **Race** 3 CPU rivals with mystery boxes (boost, shield, snowball, magnet), leagues from Bronze to *Polygon Legend*, and trophies that never go down.
* **2-Player Duel** on one device (split screen), plus **Play with Friends** online via private 4-character rooms (peer-to-peer, no chat).
* **Six worlds** with their own palettes, parallax scenery and **original synthesised soundtrack**: 8 themes with verse/chorus, fills and layers that build with your speed.
* **23 skins** (patterns and silly faces: shades, kitty, dino, robot, galaxy, gold…), **11 trails**, missions, daily gifts, levels, Kid Mode.
* **Kid-safe by design:** neutral age screen, G-rated child-directed ads for under-13s, a grown-up check before purchases, parental controls, no free-text input, no analytics.
* **Monetisation:** optional rewarded videos, capped between-run interstitials, a menu banner, plus No Ads / Starter Pack / Legend Pack / gem packs (Google Play Billing). See [docs/MONETIZATION.md](docs/MONETIZATION.md).

## Tech

TypeScript + Canvas 2D + Web Audio, bundled by Vite and packaged for Android with **Capacitor 8** (target SDK 36, landscape, immersive). There are no game-engine or audio-file dependencies: physics, level generation, AI, rendering and music are all in `src/`.

```
src/
  game/      physics, level generator, CPU rivals, sessions, controller, input
  render/    renderer, characters & skins, effects, worlds, HUD
  core/      audio engine + songs, haptics, rng, platform
  services/  AdMob, Google Play Billing, PeerJS online rooms
  meta/      catalog, economy, missions, daily gift, products
  ui/        screens, components, navigation
tests/       physics, sessions, level solvability, soundtrack, economy
tools/ scripts/  art generator (icons, splash, store graphics), keystore helper
```

Design details: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md).

## Develop

```bash
npm ci
npm run dev          # http://localhost:5173 (ads & purchases are simulated in the browser)
npm test             # unit tests incl. level solvability
npm run typecheck
```

Android (JDK 21 + Android SDK 36):

```bash
npm run android:debug     # android/app/build/outputs/apk/debug/app-debug.apk
npm run android:release   # release APK + AAB (see docs/RELEASE.md for signing)
```

## Build & release on GitHub

* **Every push** runs `.github/workflows/android-ci.yml`: typecheck → tests → web build → debug APK, uploaded as the `polygon-rush-debug-apk` artifact.
* **Releases** run `.github/workflows/release.yml` **only when you authorise them** (Actions → *Release* → *Run workflow*, or push a `v1.0.0` tag). It builds a signed APK + AAB and publishes a GitHub Release.

Step-by-step (signing key, secrets, AdMob ids, Play Console products, privacy page): **[docs/RELEASE.md](docs/RELEASE.md)**. Store listing copy and graphics: [`store/`](store).

## License

CC0 1.0 — see [LICENSE](LICENSE). The bundled Fredoka font is under the SIL Open Font License 1.1.
