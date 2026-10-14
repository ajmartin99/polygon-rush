# Polygon Rush

**An endless, shape-shifting runner for every age.** Rush through infinite polygon worlds as a **Jumper** (square), **Glider** (triangle), **Roller** (hexagon) and **Hopper** (diamond). Play solo, race CPU rivals, duel a friend on the same phone, or race up to 3 friends online with a room code.

Think *Geometry Dash* rhythm and precision, *Fun Run* racing chaos, and a kid-friendly, all-ages look.

> Built with TypeScript + Canvas + Web Audio, packaged for Android with Capacitor 8. The APK is built by GitHub Actions.

## Status

Built in three phases:

| Phase | Scope | State |
| --- | --- | --- |
| 1. UI | App shell, every menu & screen, shop, missions, daily gift, settings, parental controls, ads/IAP plumbing, Android project, CI + release workflows | ✅ |
| 2. Logic | Game engine, physics, 4 shape modes, procedural levels, CPU rivals, Race / Duel / Online modes, rewards, original 8-track soundtrack | ✅ |
| 3. Visuals | Character art & faces, skins, trails, biomes, particles, effects, icons, splash, store assets | ⏳ |

See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) for the full design.

## Develop

```bash
npm ci
npm run dev          # http://localhost:5173 (ads & purchases are simulated in the browser)
npm test             # unit tests
npm run typecheck
```

Android (needs JDK 21 + Android SDK 36):

```bash
npm run android:debug     # builds android/app/build/outputs/apk/debug/app-debug.apk
npm run android:release   # release APK + AAB (see docs/RELEASE.md for signing)
```

## Build & release on GitHub

* **Every push** runs `.github/workflows/android-ci.yml`: typecheck → tests → web build → debug APK, uploaded as the `polygon-rush-debug-apk` artifact on the run.
* **Releases** run `.github/workflows/release.yml` only when the repository owner authorises them (Actions → *Release* → *Run workflow*, or push a `vX.Y.Z` tag). It builds a signed APK + AAB and publishes a GitHub Release.

## License

CC0 1.0 — see [LICENSE](LICENSE). The bundled Fredoka font is under the SIL Open Font License 1.1.
