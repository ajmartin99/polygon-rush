# Monetisation & kid safety

Polygon Rush earns from **optional rewarded videos**, **light interstitials**, a **menu banner**, and **cosmetic in-app purchases**. It is built to stay within Google Play's Families policy and to feel fair: nothing for sale changes gameplay.

## Ads (Google AdMob, `src/services/ads.ts`)

| Format | Where | Rules |
| --- | --- | --- |
| Rewarded video | Revive (once per run), double run gems, double daily gift / mission reward, free 60 gems in the shop (5/day) | Always optional and clearly labelled "Watch video" |
| Interstitial | Between runs only (never during gameplay) | Not in the first 3 runs; at most every 3rd run and every 150 s |
| Banner (adaptive) | Main menu only, in a reserved area (no overlap with buttons) | Hidden during gameplay |

* **All ads are limited to the G content rating.**
* Players under 13, or whose age is unknown, get `tagForChildDirectedTreatment` and `tagForUnderAgeOfConsent`, and **non-personalised** requests.
* Teens and adults in regions that need it see Google's UMP consent form. Settings shows **Privacy choices** when required.
* Buying **No Ads** or the **Starter Pack** removes banners and interstitials. Rewarded videos stay available because players choose them.
* Default unit ids are Google's public test ids. Set the GitHub variables in [RELEASE.md](RELEASE.md#2-optional-real-ads-and-production-settings) for real ads.

## In-app purchases (Google Play Billing via `@capgo/native-purchases`, `src/services/iap.ts`)

| Product id | Type | Gives |
| --- | --- | --- |
| `starter_pack` | non-consumable | No Ads + 2,500 gems + exclusive Golden skin |
| `remove_ads` | non-consumable | No banners or interstitials |
| `legend_pack` | non-consumable | Rainbow, Galaxy and Magma skins + Rainbow Road and Comet trails |
| `gems_small` / `gems_medium` / `gems_large` | consumable | 600 / 2,000 / 6,000 gems |

* Prices always come from Google Play, localised.
* Grants are idempotent and de-duplicated by order id. Non-consumables are restored automatically at launch and via *Restore purchases*.
* Pending (slow) payments are honoured when they complete.
* A **grown-up check** (multiplication question) appears before any purchase for players who aren't verified adults. Parents can also turn purchases off in **Settings → Parental controls**.

## Economy pacing

* A 1 km run yields roughly 60–90 gems. Common skins cost 300, rare 800–900, epic 1,600–2,000 and legendary 3,000+ (or packs).
* Daily gift ladder: 50 → 500 gems over 7 days, plus a cosmetic on day 7. Missing a day never resets progress.
* Missions pay 60–200 gems; level-ups pay 50+.

## Google Play Families policy

The game is designed for a **mixed audience (children and adults)**:

* A **neutral age screen** on first launch asks for a birth year with no default and no hint about the "right" answer.
* Under-13 (or unknown): child-directed, non-personalised, G-rated ads; a grown-up check before purchases and external links.
* No free-text names (racer and level names are generated). Online rooms are private 4-character codes shared in person, and parents can switch them off.
* Chat for under-13s is **Quick Chat only** (preset phrases, parents can switch it off). Typed **Free Chat** needs the optional community server and an email-verified account: 16+ verify themselves, 13–15 need a parent's email approval, under-13s can never sign up. Public build rooms are 13+ only. See [SAFETY.md](SAFETY.md).
* No analytics or tracking SDKs.

In Play Console, choose target ages that include under-13s **and** older groups, and declare ads. The AdMob SDK merges the `AD_ID` permission. That is allowed for mixed-audience apps because the SDK never uses it for child-directed requests. If you ever target **children only**, remove it by adding this to `AndroidManifest.xml`:

```xml
<uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove" />
```
