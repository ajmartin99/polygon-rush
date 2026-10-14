# Releasing Polygon Rush

Every push builds a **debug APK** automatically (Actions → *Build APK* → artifact `polygon-rush-debug-apk`).
A **release** (signed APK + AAB, published as a GitHub Release) only happens when you authorise it.

## 1. One-time: create your signing key

Google Play identifies your app by its signing key. Create an upload key once and keep it safe:

```bash
./scripts/create-keystore.sh          # needs a JDK (keytool)
```

Then in GitHub → **Settings → Secrets and variables → Actions → Secrets**, add:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | contents of `polygon-rush-upload.jks.base64.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | your keystore password |
| `ANDROID_KEY_ALIAS` | `polygonrush` (or the alias you chose) |
| `ANDROID_KEY_PASSWORD` | your key password (same as the keystore one if you used the script) |

> Without these secrets the workflow still works, but signs with a throwaway debug key. That APK is fine for testing on your phone, but Google Play won't accept it.

## 2. Optional: real ads and production settings

In **Settings → Secrets and variables → Actions → Variables** (not secrets — these aren't sensitive):

| Variable | Example | Purpose |
| --- | --- | --- |
| `ADMOB_APP_ID` | `ca-app-pub-1234…~5678` | Your AdMob app id |
| `ADMOB_BANNER_ID` | `ca-app-pub-1234…/1111` | Banner unit |
| `ADMOB_INTERSTITIAL_ID` | `ca-app-pub-1234…/2222` | Interstitial unit |
| `ADMOB_REWARDED_ID` | `ca-app-pub-1234…/3333` | Rewarded unit |
| `PRIVACY_URL` | `https://ajmartin99.github.io/polygon-rush/privacy.html` | Shown in Settings |
| `SUPPORT_EMAIL` | `you@example.com` | Shown in the privacy policy |
| `PEER_HOST` / `PEER_PORT` / `PEER_PATH` / `PEER_KEY` | | Your own PeerJS server (optional; defaults to the free PeerJS cloud) |
| `TURN_URL` / `TURN_USERNAME` + secret `TURN_CREDENTIAL` | | Optional TURN relay for strict mobile networks |

Until real AdMob ids are set, the app shows **Google's test ads**. They never earn money, but they're also safe to tap.

## 3. Authorise the release (v1.0.0)

Pick one:

* **GitHub website:** Actions → **Release** → *Run workflow* → version `1.0.0` → Run.
  (GitHub only lists `workflow_dispatch` workflows that exist on the default branch, so merge this branch into `main` first.)
* **Tag:** `git tag v1.0.0 && git push origin v1.0.0` (works from any branch).

The workflow runs typecheck and tests, builds the web bundle, builds `PolygonRush-v1.0.0.apk` and `PolygonRush-v1.0.0.aab`, verifies the signature, and publishes a GitHub Release with both files plus `SHA256SUMS.txt` and the changelog.

**Extra safety (recommended):** Settings → Environments → `production` → *Required reviewers* → add yourself. Every release run will then wait for your click.

The version code is derived from the version: `1.0.0` → `10000`, `1.2.3` → `10203`. Bump the version for every Play upload.

## 4. Google Play Console checklist

1. Create the app (name *Polygon Rush*, game, free).
2. **App signing:** enable Play App Signing, then upload the `.aab` to the *Internal testing* track first.
3. **In-app products** (Monetize → Products → In-app products). Create these exact ids:
   * `remove_ads`: No Ads (non-consumable) — suggested $2.99
   * `starter_pack`: Starter Pack: No Ads + 2,500 gems + Golden skin — $4.99
   * `legend_pack`: Legend Pack: legendary skins & trails — $3.99
   * `gems_small` (600 gems) $0.99 · `gems_medium` (2,000) $2.99 · `gems_large` (6,000) $6.99
4. **Target audience & content:** see [MONETIZATION.md](MONETIZATION.md#google-play-families-policy). The game is designed for mixed audiences (kids and adults) with a neutral age screen.
5. **Data safety:** answers are in [store/listing.md](../store/listing.md#data-safety-form).
6. **Store listing:** text in `store/listing.md`; graphics in `store/` (icon 512, feature graphic 1024×500, screenshots 1920×1080).
7. **Privacy policy URL:** enable GitHub Pages (Settings → Pages → Deploy from branch → `main` / `docs`), then use `https://ajmartin99.github.io/polygon-rush/privacy.html`.
8. Add license testers (Setup → License testing) to try purchases for free, then roll out to production.

## 5. Install the APK directly

Download `PolygonRush-v1.0.0.apk` from the GitHub Release on your phone, open it, and allow *Install unknown apps* when prompted.

## Regenerating art

Icons, splash screens and store graphics are drawn with the game's own renderer:

```bash
npm run dev
npx -y -p playwright@1 node scripts/generate-art.mjs
```
