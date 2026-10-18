# Polygon Rush community server (optional)

The game works without this server: solo play, Create mode, share codes and
private **Friends / Build Together** rooms all run on-device or peer-to-peer
(using the free PeerJS cloud for signalling). Deploy this server to unlock:

| Feature | Who can use it |
| --- | --- |
| **Reliable room signalling** (replaces the PeerJS cloud) | everyone |
| **Public build rooms**: list your build room so others can join | players 13+ (device age screen) |
| **Free Chat**: typed messages in rooms, filtered, logged, reportable | 16+ with a verified email, or 13–15 with a **parent's** verified email |

Players under 13 never see public rooms or Free Chat. Quick Chat (preset
phrases) works for everyone without the server, and parents can switch it off.

## How Free Chat stays safe

* **Email verification.** 16+ verify their own email. For 13–15 the 6-digit
  code goes to a **parent or guardian's** email, with an explanation of what
  Free Chat is and how to turn it off (that's their consent). Under-13s are refused.
* **Only verified players receive typed messages.** Everyone else in the same
  room keeps seeing Quick Chat only.
* **Server-side filter** (`src/shared/chat-filter.ts`, also used by the app
  for instant feedback): blocks phone numbers (also spelled out), emails,
  addresses, links, @handles, other apps ("add me on snap"), grooming questions
  (age, location, school, photos, "don't tell your parents"), slurs, sexual
  content and self-harm encouragement; masks everyday swearing.
* **Rate limits** on messages, codes and reports; generated names only.
* **Reports** keep the conversation around the message. Three different
  players reporting someone within 24 h auto-mutes them until a moderator looks.
* **Moderation API** to review reports, mute, ban (bans also block the email
  address) and export an account's retained data for lawful requests.
* **Retention**: chat messages 30 days (longer only while part of an open
  report), resolved reports 365 days, inactive accounts 2 years. Accounts can
  be deleted in the app or on the web at `/account/delete` (Google Play
  requires both).

See [docs/SAFETY.md](../docs/SAFETY.md) for the moderation playbook.

## Run locally

```bash
cd server
npm ci
npm run dev        # http://localhost:8080, codes are printed instead of emailed
npm test           # integration tests (accounts, chat, reports, rooms)
npm run typecheck
```

Point a dev build of the app at it:

```bash
VITE_SERVER_URL=http://localhost:8080 npm run dev   # from the repository root
```

## Deploy

Any host that runs a Docker container with a persistent disk and WebSockets works.

* **Render**: New → Blueprint → this repository (`render.yaml` at the root).
  Fill in `SMTP_URL`, `MAIL_FROM`, `PUBLIC_URL` and `SUPPORT_EMAIL`.
* **Docker anywhere**: `docker build -f server/Dockerfile -t polygon-rush-server .`
  (run from the repository root), then run it with a volume on `/data`.

Then set the repository variable **`SERVER_URL`** (Settings → Secrets and
variables → Actions → Variables) to the server's https URL; the APK workflows
pass it to the app as `VITE_SERVER_URL`.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | — | `production` enforces the settings below |
| `PORT` | `8080` | |
| `DATA_DIR` / `DB_FILE` | `./data` | SQLite database (keep it on a persistent disk, back it up) |
| `TOKEN_SECRET` | random in dev | **Required in production**, 32+ random characters. Changing it signs everyone out of Free Chat. |
| `FREE_CHAT` | `false` | Typed Free Chat (email sign-up, `/chat`). Built but off: set `true` (and build the app with `VITE_FREE_CHAT=true`) to offer it. |
| `SMTP_URL` | — | e.g. `smtps://user:pass@smtp.example.com:465`. Without it Free Chat sign-up is off in production. |
| `MAIL_FROM` | `Polygon Rush <no-reply@localhost>` | Must be allowed by your email provider |
| `PUBLIC_URL` | `http://localhost:8080` | Used in parent emails (deletion link) |
| `SUPPORT_EMAIL` | — | Shown on the deletion page |
| `ADMIN_TOKEN` | — | 24+ characters; enables `/api/admin/*` |
| `ALLOWED_ORIGINS` | app + localhost dev origins | Comma separated; the Android app is `https://localhost` |
| `TRUST_PROXY` | `false` | `true` behind a load balancer (Render, Fly, nginx) |
| `PEER_PATH` / `PEER_KEY` | `/peerjs` / `peerjs` | PeerJS signalling mount |
| `MESSAGE_RETENTION_DAYS` | `30` | |
| `REPORT_RETENTION_DAYS` | `365` | |
| `INACTIVE_ACCOUNT_DAYS` | `730` | |
| `IP_LIMIT_PER_HOUR` | `8` | Email codes per IP per hour |

## API

App endpoints (CORS-limited to `ALLOWED_ORIGINS`):

* `GET /api/status`
* `POST /api/account/start` `{ email, birthYear }` → emails a code (to a parent for 13–15)
* `POST /api/account/verify` `{ email, code }` → `{ token, account }`
* `GET /api/account/me`, `POST /api/account/delete` (Bearer token)
* `POST /api/account/delete/start|confirm` (web deletion)
* `POST /api/players/register` `{ key, name, kid, friendsOff, tag? }` → `{ id, name, tag }` (Name#tag), `POST /api/players/delete` `{ key }`
* `POST /api/friends/sync` `{ key, activity }` → friends with online status, requests both ways, invites
* `POST /api/friends/add` `{ key, handle: "Name#1234" }`, `/respond` `{ key, id, accept }`, `/remove` `{ key, id }`, `/block` `{ key, id }`
* `POST /api/friends/invite` `{ key, id, kind: race|build, room }`, `/invite/dismiss` `{ key, id }`
* `POST /api/levels/publish` `{ key, localId, code }` (share or update), `POST /api/levels/browse` `{ key, tab: trending|top|suggested|new, scope: all|friends|mine, offset }` → levels + your creator stats
* `POST /api/levels/:id/play` `{ key, cleared }`, `/like` `{ key, vote: 1|-1|0 }` (thumbs up / down / clear; needs a play first), `/report` `{ key, reason }`, `/unpublish` `{ key }`
* `GET /api/rooms`, `POST /api/rooms/:code`, `POST /api/rooms/:code/beat`, `DELETE /api/rooms/:code`, `POST /api/rooms/:code/report`
* WebSocket `/chat`: `auth` → `join {channel, name}` → `say {text}` / `report {id, reason}`
* PeerJS signalling under `/peerjs`

Moderation (header `Authorization: Bearer $ADMIN_TOKEN`):

```bash
S=https://your-server.example.com
curl -H "Authorization: Bearer $ADMIN_TOKEN" $S/api/admin/reports
curl -H "Authorization: Bearer $ADMIN_TOKEN" $S/api/admin/reports/REPORT_ID
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
     -d '{"action":"ban","days":0,"note":"grooming attempt"}' $S/api/admin/reports/REPORT_ID/resolve
#   actions: dismiss | mute (hours) | ban (days, 0 = permanent) | hide (public room)
curl -H "Authorization: Bearer $ADMIN_TOKEN" $S/api/admin/accounts/ACCOUNT_ID/export   # lawful requests
curl -H "Authorization: Bearer $ADMIN_TOKEN" $S/api/admin/rooms
curl -H "Authorization: Bearer $ADMIN_TOKEN" "$S/api/admin/names/Neon%20Fox"   # who has a name (all #tags)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"days":0,"reason":"rude"}' "$S/api/admin/names/Bad%20Name/ban"
curl -H "Authorization: Bearer $ADMIN_TOKEN" "$S/api/admin/levels?filter=reported"   # or hidden | all
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"hidden":false}' $S/api/admin/levels/LEVEL_ID/hide
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" $S/api/admin/levels/LEVEL_ID
curl -H "Authorization: Bearer $ADMIN_TOKEN" $S/api/admin/audit
```
