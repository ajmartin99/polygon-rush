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

> Use **Secrets**, not Variables: the release job only reads secrets. Without them, a full release stops with an error (a debug-signed build can't update in place or go to Google Play); only a pre-release may be debug-signed for testing.

The app's package name is **`com.softgamebros.polygonrush`**. Google Play locks it on the first upload, so never change it after that.

## 2. Optional: real ads and production settings

In **Settings → Secrets and variables → Actions → Variables** (not secrets — these aren't sensitive):

| Variable | Example | Purpose |
| --- | --- | --- |
| `ADMOB_APP_ID` | `ca-app-pub-1234…~5678` | Your AdMob app id |
| `ADMOB_BANNER_ID` | `ca-app-pub-1234…/1111` | Banner unit |
| `ADMOB_INTERSTITIAL_ID` | `ca-app-pub-1234…/2222` | Interstitial unit |
| `ADMOB_REWARDED_ID` | `ca-app-pub-1234…/3333` | Rewarded unit |
| `PRIVACY_URL` | `https://softgamebros.com/polygon-rush/privacy/` (the default) | Shown in Settings |
| `SUPPORT_EMAIL` | `polygonrush@softgamebros.com` (the default) | Shown in Settings |
| `SERVER_URL` | `https://polygon-rush-server.onrender.com` | Optional community server: public build rooms, Free Chat and room signalling (see below) |
| `PEER_HOST` / `PEER_PORT` / `PEER_PATH` / `PEER_KEY` | | Your own PeerJS server (optional; defaults to `SERVER_URL`, else the free PeerJS cloud) |
| `TURN_URL` / `TURN_USERNAME` + secret `TURN_CREDENTIAL` | | Optional TURN relay for strict mobile networks |

Until real AdMob ids are set, the app shows **Google's test ads**. They never earn money, but they're also safe to tap.

## Optional: community server

Everything works without it: solo play, Create mode, level codes, private Friends
and Build Together rooms, and Quick Chat. Deploying `server/` adds **public build
rooms (13+)**, **email-verified Free Chat (16+, or 13–15 with a parent's email)** and
reliable room signalling. Details: [server/README.md](../server/README.md).

1. **Deploy:** Render → New → Blueprint → this repo (uses `render.yaml`), or run
   `server/Dockerfile` anywhere with a persistent `/data` disk.
2. **Email:** set `SMTP_URL` and `MAIL_FROM` (any transactional email provider), plus
   `PUBLIC_URL` and `SUPPORT_EMAIL`. Keep the generated `ADMIN_TOKEN` somewhere safe.
3. **Connect the app:** repository variable `SERVER_URL` = the server's https URL,
   then rebuild. Without it, Free Chat and public rooms are hidden.
4. **Privacy policy:** the deletion link in `site/polygon-rush/privacy/index.html` points at
   `https://polygon-rush.softgamebros.com/account/delete`; give the Render service that custom domain.
5. **Moderation:** someone must review reports daily. Read [SAFETY.md](SAFETY.md).
6. **Play Console** (only when `SERVER_URL` is set):
   * *Content rating*: answer **yes** to "users can interact or exchange information"
     (moderated text chat for verified 13+, preset chat for all) and to user-generated
     content (player-made levels in public rooms).
   * *Data safety*: add the extra rows in [store/listing.md](../store/listing.md#data-safety-form).
   * *Account deletion*: the in-app path is Settings → Chat & Community → Delete chat
     account; the web URL is `https://polygon-rush.softgamebros.com/account/delete`.
   * *User-generated content*: in-app reporting, blocking/muting, Community Rules
     acceptance and moderation are built in (see SAFETY.md).

## 3. Authorise the release (next: v1.0.7)

Pick one:

* **GitHub website:** Actions → **Release** → *Run workflow* → version `1.0.7` → Run.
  (GitHub only lists `workflow_dispatch` workflows that exist on the default branch, so merge this branch into `main` first.)
* **Tag:** `git tag v1.0.7 && git push origin v1.0.7` (works from any branch).

The workflow runs typecheck and tests, builds the web bundle, builds `PolygonRush-v1.0.7.apk` and `PolygonRush-v1.0.7.aab`, verifies the signature, and publishes a GitHub Release with both files plus `SHA256SUMS.txt` and the changelog.

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
   * `haunted_regen_1`: Heart Regen (Haunted Run refill) $0.99 · `haunted_regen_4`: 4 Heart Regens $2.99 (both consumable; players can also pay 660 / 2,200 gems)
4. **Target audience & content:** see [MONETIZATION.md](MONETIZATION.md#google-play-families-policy). The game is designed for mixed audiences (kids and adults) with a neutral age screen.
5. **Data safety:** answers are in [store/listing.md](../store/listing.md#data-safety-form).
6. **Store listing:** text in `store/listing.md`; graphics in `store/` (icon 512, feature graphic 1024×500, screenshots 1920×1080).
7. **Privacy policy URL:** `https://softgamebros.com/polygon-rush/privacy/` (the studio site in `site/`, see **Studio website** below). Developer website: `https://softgamebros.com`, email: `polygonrush@softgamebros.com`.
8. Add license testers (Setup → License testing) to try purchases for free, then roll out to production.

## 5. Install the APK directly

Download `PolygonRush-v1.0.7.apk` from the GitHub Release on your phone, open it, and allow *Install unknown apps* when prompted.

## Regenerating art

Icons, splash screens and store graphics are drawn with the game's own renderer:

```bash
npm run dev
npx -y -p playwright@1 node scripts/generate-art.mjs
```

## Studio website (softgamebros.com)

The `site/` folder is the Soft-Game Brothers website: the studio page, the Polygon Rush page and its privacy policy. It is plain HTML and CSS (no build step), served by Cloudflare Pages:

1. Cloudflare → **Workers & Pages** → Create → **Pages** → Connect to Git → `ajmartin99/polygon-rush`.
2. Production branch `main`, framework preset **None**, build command empty, build output directory `site`.
3. After the first deploy: the project → **Custom domains** → add `softgamebros.com` and `www.softgamebros.com`.

Every push to `main` that changes `site/` redeploys it. Edit `site/polygon-rush/privacy/index.html` and `src/meta/legal.ts` together so the web and in-app policies match.

**AdMob:** `site/app-ads.txt` lists the Soft-Game Brothers publisher id (`pub-8916807186236706`) and is served at `https://softgamebros.com/app-ads.txt`. Set the Play listing's website to `https://softgamebros.com` so AdMob can find it (it checks within about a day). If AdMob ever shows a different line, copy that one into the file.

**Email:** Cloudflare → softgamebros.com → Email → Email Routing forwards `polygonrush@`, `privacy@` and `safety@` to the owner's inbox.

## Live updates (new maps, obstacles and fixes without a store release)

Most of Polygon Rush (levels, obstacles, modes, menus) is web code, and it can be updated in place:

1. Merge your changes to `main`.
2. Actions → **Live Update** → Run workflow (optionally type what changed; players see it in the "Update ready" message).
3. Phones on the **same app build** (the `VERSION_CODE` in `android/app/build.gradle`) find it at their next launch, download only the changed files, and switch to it the next time the app goes to the background.

Rules of thumb:
- A live update must only change web code. New plugins, permissions, Android code or in-app products need a normal **Release** (and a Play upload).
- After a new store release, phones on the new build only get live updates published after it.
- If an update fails to start, the phone rolls back on its own to the last version that worked.
- Files are published to the `ota` GitHub release (marked pre-release so it never shows as the latest app download). No third-party update service is used.

