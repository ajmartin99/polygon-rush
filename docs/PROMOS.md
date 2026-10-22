# Promo codes

Make codes for posts, events, giveaways and making things right for a player.

## Making a code

1. Open `<your server URL>/promos/admin` (for example `https://polygon-rush-server.onrender.com/promos/admin`).
2. Sign in with the admin token (`ADMIN_TOKEN` in the Render dashboard → Environment).
3. Fill in the code and what it gives:
   - **Code:** 4-20 letters and numbers. Case, spaces and dashes don't matter, so `SPOOKY-500` and `spooky500` are the same code.
   - **Gems:** up to 50,000.
   - **Heart Regens:** up to 20.
   - **Skins, trails, emotes:** ids from the lists below, separated by commas.
   - **Max uses:** leave empty for no limit.
   - **Ends:** the last day it works. Leave empty to never end.
   - **Message:** shown when someone redeems it (e.g. "Happy Halloween!").
4. Create it. Turn a code off or delete it from the list at any time. Players keep what they already got.

## How it works

- Players type codes in **Settings → Redeem a code**. The game needs to be online.
- Each player can use a code once. Ten wrong codes in an hour makes them wait.
- No Ads, the Starter Pack and the Legend Pack items can't be given with a code, because they come with a Google Play purchase. Sell those through the Shop instead.
- Items a player already has are skipped. They still get the rest.

## Ideas

- `TESTER7` for the 7-day beta testers who missed a day.
- A code at the end of the promo video.
- A one-use code to make up for a bug a player reported.

## Skins

| id | Name | Normally |
|---|---|---|
| `classic` | Classic | free |
| `mint` | Minty | level |
| `bubblegum` | Bubblegum | gems |
| `sky` | Sky Blue | level |
| `tangerine` | Tangerine | gems |
| `grape` | Grape | gems |
| `candy` | Candy Stripe | gems |
| `polka` | Polka Dots | gems |
| `checkers` | Checkers | gems |
| `kitty` | Kitty | level |
| `shades` | Shades | gems |
| `melon` | Watermelon | gems |
| `robo` | Robo | gems |
| `sunset` | Sunset | gems |
| `ocean` | Deep Ocean | gems |
| `dino` | Dino | level |
| `lucky` | Lucky Clover | daily |
| `frosty` | Frosty | gems |
| `neon` | Neon Glow | gems |
| `betabot` | Beta Bot | beta |
| `witch` | Wicked Witch | event |
| `boo` | Boo | event |
| `mummy` | Mummy | event |
| `jack` | Jack-o’-Lantern | event |
| `vampire` | Count Polygon | event |
| `phantom` | Phantom | event |
| `patch` | Pumpkin Patch | event |
| `grave` | Tombstone | event |
| `skullhead` | Bone Head | event |
| `cornkid` | Candy Corn Kid | event |
| `bones` | Rattle Bones | event |

## Trails

| id | Name | Normally |
|---|---|---|
| `none` | No Trail | free |
| `lines` | Speed Lines | gems |
| `sparkle` | Sparkles | gems |
| `bubbles` | Bubbles | gems |
| `hearts` | Hearts | gems |
| `pixels` | Pixels | gems |
| `stars` | Stars | gems |
| `notes` | Music Notes | level |
| `confetti` | Confetti | daily |
| `candycorn` | Candy Corn | event |
| `debug` | Debug Pixels | beta |
| `bats` | Bat Swarm | event |
| `mist` | Ghostly Mist | event |

## Emotes

| id | Name | Normally |
|---|---|---|
| `wave` | Wave | free |
| `gg` | GG | free |
| `thumbs` | Thumbs Up | free |
| `laugh` | Laugh | free |
| `heart` | Love It | gems |
| `clap` | Clap | gems |
| `wow` | Wow | gems |
| `fire` | On Fire | gems |
| `cool` | Too Cool | gems |
| `party` | Party | gems |
| `crown` | Champion | gems |
| `rocket` | Blast Off | gems |
| `boo` | Boo! | event |
| `pumpkin` | Pumpkin Pop | event |
| `bat` | Bat Flap | event |
| `candy` | Trick or Treat | event |
| `tester` | Beta Tester | beta |
