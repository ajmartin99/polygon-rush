# 1.0.12 native release plan

The first build for Google Play production, after the 14-day closed test.
Everything here needs a native build (a live update can't do it).

## Seasonal app icons

The home-screen icon follows the same season calendar as the Daily Run.

**How it works**
- Android `activity-alias` entries in `AndroidManifest.xml`, one per icon:
  `Default`, `Spooky`, `Winter`, `Spring`, `Summer` (plus slots for custom days).
  Exactly one alias is enabled at a time; the real `MainActivity` keeps no
  launcher intent filter.
- A small native plugin (`IconSwitcher`) with `set(name)` and `current()`,
  calling `PackageManager.setComponentEnabledSetting(..., DONT_KILL_APP)`.
- The game picks the icon from `activeEvent()` and asks for a switch only when
  the app goes to the background, and only if it differs from the current one.
  This avoids the launcher reshuffling the icon while someone is playing.
- A Settings toggle, "Seasonal app icon", on by default, to keep the classic
  icon for good.

**Art**
- `scripts/generate-art.mjs` draws each variant from the same cube mascot and
  colours as the main icon, adding one seasonal touch: witch hat and pumpkin
  glow (Spooky), scarf and snow (Winter), flower (Spring), sunglasses and sun
  (Summer).
- Adaptive icons for every density (`mipmap-*`), plus a matching 512 × 512 PNG
  per season in `store/icons/` for swapping the Play listing icon by hand.

**Limits to remember**
- New seasons need a new native build; live updates can only switch between
  icons already in the app.
- Some launchers drop home-screen shortcuts or move the icon when it changes.
  Keep switches to a few times a year.

## Smaller native size (R8)

- Turn on `minifyEnabled` and `shrinkResources` for release builds.
- Add keep rules for Capacitor, AdMob, Play Billing (`@capgo/native-purchases`),
  the live updater (`@capgo/capacitor-updater`) and our own plugins.
- Release workflow: attach `mapping.txt` to each release so it can be uploaded
  to Play Console next to the AAB (clears the "no deobfuscation file" warning).
- Test on a phone before shipping: ads, a test purchase, restore purchases, a
  live update and online rooms.

## Store listing

- Add 2-3 screenshots of the level editor, Community and a profile card.

## Release steps

1. Bump `versionCode` to 10012 and `versionName` to 1.0.12.
2. Run the Release workflow; upload the AAB and `mapping.txt` to Production.
3. From then on, the Live Update workflow builds for 10012 automatically.
