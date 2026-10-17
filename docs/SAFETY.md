# Polygon Rush — Safety & Moderation Playbook

Polygon Rush is played by young children as well as teens and adults. Every
online feature is designed so the youngest players can't be reached by
strangers, and everything typed is filtered, logged for a short time and
reportable. This page is for whoever runs the game: what is automatic, what
needs a person, and what to do when something serious happens.

> This is operational guidance, not legal advice. Check the rules that apply
> where you operate (for example COPPA in the US, the UK Age Appropriate Design
> Code, GDPR/DSA in the EU) with a qualified adviser.

## Who gets what

| Feature | Under 13 | 13–15 | 16+ |
| --- | --- | --- | --- |
| Play, Create, share level codes | ✓ | ✓ | ✓ |
| Private rooms (Friends, Build Together) | ✓ (parents can switch off) | ✓ | ✓ |
| Quick Chat (preset phrases & emotes only) | ✓ (parents can switch off) | ✓ | ✓ |
| Public build rooms, public race rooms & Quick Match | ✗ | ✓ (parents can switch off) | ✓ |
| Free Chat (typed) | ✗ never | with a **parent's** verified email | with own verified email |

* Ages come from the neutral age screen (birth year, conservatively rounded down)
  and the server re-checks the birth year sent at sign-up.
* Under-13s always get a generated name ("Speedy Panda 7"). Players 13+ can type
  their own racer name and level names instead (see **Typed names** below).
* Profile cards (shown when you tap a player in a room) hold only game facts: level, league, badges, a title chosen from earned badges, a banner colour and a few stats. There is no bio, photo or free text, and incoming cards are cleaned (unknown ids dropped, numbers clamped).
* Free Chat is only delivered to players who are verified themselves, so a
  verified adult can never send typed text to an unverified child in the same room.
* Online rooms are peer-to-peer; only generated names, skins, positions, level
  edits and Quick Chat phrase numbers travel between players. Typed text only
  ever goes through the server (where it is filtered).

## What happens automatically

* **Filter** (`src/shared/chat-filter.ts`): blocks phone numbers (digits or
  spelled out), emails, street addresses, links, @handles, other apps
  ("add me on snap", "dm me"), grooming questions (age, location, school,
  photos, "don't tell your parents", meeting up), slurs, sexual words and
  self-harm encouragement. Everyday swearing is masked. Senders see a friendly
  explanation, and the message never reaches anyone.
* **Rate limits** on messages (1 per 1.2 s, 8 per 20 s, no repeats), email codes,
  verification attempts (5 per code) and reports.
* **Auto-mute:** 3 different players reporting the same account within 24 h mutes
  it for 24 h until a moderator reviews it.
* **Public race rooms** (Quick Match) leave the list as soon as the race starts and can be reported from the lobby.
* **Public rooms** are hidden after 3 reports; the report includes a snapshot of
  the level so rude drawings can be checked. A hidden room's code can't be listed
  again for 24 h (its host's connection for 2 h).
* **Removing a player** (host): they're disconnected, the room refuses new joiners
  for 2 minutes, and the room's Free Chat moves to a new secret channel only the
  remaining players know.
* **Names** are checked everywhere: anything that isn't a generated name or an
  allowed typed name (a modified app) is replaced, and two people can't use the
  same name in one Free Chat room.
* **Typed names (13+)** (`checkDisplayText`): racer names are 3–16 letters, digits
  and spaces, starting with a letter; level names 3–24 characters (also `! ? ' -`).
  At most 3 digits and never 3 in a row (no phone numbers, ages or birth years).
  Reserved words (admin, mod, staff, Polygon Rush…) are refused. The chat filter runs
  on the name as written, CamelCase split and with spaces removed, and anything it
  would mask is refused. Names are stricter than chat: a long swear inside a word
  blocks the name. Every receiver (rooms, level codes, server) runs the same check.
* **Unique racer names:** with the community server, a typed name is claimed against
  a random key made on the device (stored only as an HMAC). Taken names are refused.
  Moderators can ban a name
  (`POST /api/admin/names/NAME/ban {days, reason}`). On the next launch, the app
  swaps a banned name for a new generated one. Banned names can't be hosted, listed
  or used in Free Chat.
* **Typed text in other scripts** (e.g. Cyrillic look-alike letters) and non-ASCII
  digits are refused, so the filter can't be dodged with look-alikes.
* **Deleting an account** closes its live chat at once. A one-way email hash, the
  account id and any mute/ban are kept for 90 days, so delete-and-return keeps the
  same id, reports and mutes, and moderators can still ban it.
* **Accounts per person:** a parent's email gives each approved teen their own
  account (told apart by birth year); a teen's Free Chat can only be switched back
  on with the grown-up check.
* **Retention:** messages 30 days (kept while part of an open report), resolved
  reports 1 year, inactive accounts 2 years, then deleted automatically.

## Daily routine (10 minutes)

1. List open reports:
   `curl -H "Authorization: Bearer $ADMIN_TOKEN" $SERVER/api/admin/reports`
2. Open each one (`/api/admin/reports/ID`): the reported message and the
   conversation around it, or the room's level snapshot.
3. Decide and resolve:
   * not a problem → `{"action":"dismiss"}`
   * rude/mean → `{"action":"mute","hours":72}`
   * repeated abuse, harassment, sexual content, attempts to get personal info
     or move a child to another app → `{"action":"ban","days":0}` (permanent;
     the email address is blocked too)
   * offensive public room → `{"action":"hide"}`
4. Check `/api/admin/audit` occasionally.

Respond to every report within 24 hours (Google Play expects timely action on
user-generated content).

## Serious incidents

**A child may be in danger** (threats, plans to meet, sexual messages to a
minor, attempts to obtain images): ban the account immediately, then:

* **Imminent risk of harm:** contact local emergency services / police.
* **Suspected child sexual exploitation:** in the United States, online service
  providers must report apparent child sexual exploitation to the NCMEC
  CyberTipline (report.cybertip.org). Elsewhere, report to your national hotline
  (for example the IWF in the UK or an INHOPE member hotline).
* **Preserve evidence:** export the account (`/api/admin/accounts/ID/export`) and
  store it securely. Keep the related report open so its messages are not purged.
  Do not forward the content to anyone except the authorities.

**Law-enforcement requests:** verify the request is genuine and lawful, then use
the export endpoint for the specific account. Record what you disclosed. If asked
to preserve data, export it and keep the report open.

**Parents:** a parent can delete their teen's chat account from the game
(Settings → Chat & Community → Delete chat account) or on the web at
`$SERVER/account/delete` with the email address they verified. Parents can also
switch off online play, Quick Chat, public rooms and Free Chat in Parental Controls.

## Before turning Free Chat on in production

* Deploy the server with `ADMIN_TOKEN`, working `SMTP_URL` and `SUPPORT_EMAIL`.
* Make sure someone will review reports every day.
* Update the privacy policy's deletion link (`docs/privacy.html`).
* In Play Console, declare user interaction and user-generated content
  (see [RELEASE.md](RELEASE.md#optional-community-server)).
