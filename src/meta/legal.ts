import { CONFIG } from '../config';

const deletionUrl = CONFIG.server.url ? `${CONFIG.server.url}/account/delete` : 'the account deletion page on our community server';

/** In-app copy of the privacy policy (works offline). Keep in sync with docs/privacy.html. */
export const PRIVACY_SECTIONS: { title: string; body: string }[] = [
  {
    title: 'The short version',
    body: 'Polygon Rush has no sign-in. Players under 13 always get a generated racer name; players 13 and older may type their own racer and level names, which are filtered. Your progress and the levels you build are saved on your device. With the game server, your racer name gets a #number and you can add friends. There are no accounts and no typed chat: players talk only with Quick Chat’s preset phrases and emotes. Players under 13 never get public rooms. We do not ask for or collect email addresses, real names, phone numbers, contacts, photos or precise location, and scores and progress stay on your device (only the game facts on your profile card are shared, see below). We do not sell personal information.',
  },
  {
    title: 'Information stored on your device',
    body: 'Game progress, settings, the birth year you entered on first launch, your racer name, the levels you build or import and any songs you add to My Music are stored on your device. Songs in My Music are never uploaded or shared. Uninstalling the app deletes them all. A backup code (Settings > Move to a new phone) contains this progress so you can move it yourself; we never see it.',
  },
  {
    title: 'Age screen',
    body: 'On first launch we ask for a birth year. It is used on the device to set up ads, parental controls and which online features are offered (Quick Chat for everyone; public rooms and typed names only from 13). It is not sent to us.',
  },
  {
    title: 'Advertising (Google AdMob)',
    body: 'The free version shows ads from Google AdMob. All ads are limited to the "G" (general audiences) content rating. For players under 13, ad requests are tagged as child-directed and are non-personalised. Players 13+ in regions that require it are asked for consent through Google’s consent form, which can be changed any time in Settings > Privacy Choices. As a third-party vendor, Google may collect and process the advertising ID and other device identifiers, the IP address (and an approximate location from it) and ad interaction data such as impressions and taps, to show and measure ads and prevent fraud, as described in Google’s policies: https://policies.google.com/technologies/ads',
  },
  {
    title: 'Game updates',
    body: "When the app starts, it checks GitHub (where our game files are hosted) for a newer version of the game and downloads only the files that changed. These requests carry no account or personal information; like any download, GitHub sees the device's IP address.",
  },
  {
    title: 'In-app purchases (Google Play)',
    body: 'Purchases are processed entirely by Google Play. We never see your payment details. A grown-up check is shown before any purchase for players who are not adults, and parents can turn purchases off in Settings > Parental Controls.',
  },
  {
    title: 'Online rooms (Play with Friends, Build Together)',
    body: 'Online rooms connect players directly (peer-to-peer) using a short room code; a signalling server only helps them find each other. Players in a room share their racer name, skin, game profile card (level, badges, title, game stats, any profile add-ons such as a featured Community level and, for players 13+, their #number so others can send a friend request), race positions, level edits and Quick Chat choices (preset phrases, never typed text). Like any internet connection, players in a room can see each other’s IP address. Parents can turn online play and Quick Chat off in Settings > Parental Controls.',
  },
  {
    title: 'Friends and your #number',
    body: 'When the game server is available, your racer name, a random #number and a random key created on your device (stored by us only as a one-way hash) are sent to our server. This lets friends add you by Name#number, which is never searchable or listed. We store your racer name and #number, whether you are under 13 (so typed names stay off for you), your friends list, friend requests, blocks, when you were last online and what you are doing in the game (menu, playing, building or in an online room), invites, which hold only a room code, and your latest game profile card and skin (game facts only, the same card players see in a room). Friends can see whether you are online, open your profile card and get invites from you. Players who open one of your shared Community levels can open your profile card too (without your #number if you are under 13). Nobody else can. There are no messages. Under-13s can only add a friend by typing their exact Name#number, shared in person. Parents can turn friends off in Settings > Parental Controls. Invites are deleted after 10 minutes; players not seen for 2 years are deleted with their friends lists.',
  },
  {
    title: 'Level codes',
    body: 'Sharing a level creates a code containing only the level itself, its name and the racer names of the players who built it.',
  },
  {
    title: 'Community levels',
    body: 'When you share a level to Community, our server stores its level code (the level, its name and the racer names of its builders) linked to your player, plus how many players played, beat and liked it. Anyone using Community can play it, sees your racer name without your #number and can open your game profile card. We also store which community levels you played, beat, liked or reported, so counts stay fair and Suggested shows levels you haven’t played. There is no text besides level names, which for players 13+ pass the same filter as racer names. Players can report a level; several reports hide it until our safety team looks. You can unshare a level any time in Create > Community > My Shared. Parents can turn Community levels off in Settings > Parental Controls.',
  },
  {
    title: 'Public rooms and Quick Match (13+)',
    body: 'A host aged 13+ can list a race or build room publicly, and Quick Match joins one at random. The list shows the room code, a generated room name and colours, the host’s racer name and the number of players. Race rooms leave the list when the race starts. If someone reports a public build room, a snapshot of the level is sent to our safety team.',
  },
  {
    title: 'Analytics',
    body: 'Polygon Rush does not include any analytics, tracking or crash-reporting SDKs (no Firebase, Google Analytics or similar). The only third-party SDKs are Google AdMob (ads) and Google Play Billing (purchases).',
  },
  {
    title: 'Children',
    body: 'Polygon Rush is designed to be suitable for all ages and follows the Google Play Families policy. We do not knowingly collect personal information from children under 13: they keep generated racer names, add friends only by a typed Name#number and cannot use public rooms. There is no typed chat for anyone. We follow the US Children’s Online Privacy Protection Act (COPPA) and the GDPR’s protections for children: the age screen on first launch keeps players under 13 on child-directed, non-personalised ads, and in the EEA, UK and other regions that require it, players 13+ are asked for consent through Google’s consent form before any personalised ads. Parents or guardians can ask us to review or delete their child’s data at privacy@softgamebros.com.',
  },
  {
    title: 'Deleting your data',
    body: `Use Settings > Reset Progress or uninstall the app to delete data on your device (delete levels in Create > My Levels). Delete your #number, friends list, invites and shared levels from our server in Friends > Delete friends data. Ad-related data held by Google can be managed in your device’s Google settings.`,
  },
  {
    title: 'Contact',
    body: 'Soft-Game Brothers. Data and privacy requests: privacy@softgamebros.com. Safety concerns: safety@softgamebros.com. Help with the game: polygonrush@softgamebros.com.',
  },
];

/**
 * Free Chat is built but switched off (CONFIG.features.freeChat). Turning it
 * on adds these to the in-app policy; the website copy and the "short
 * version", age screen and children sections then need their Free Chat
 * wording back by hand.
 */
export const FREE_CHAT_PRIVACY_SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Free Chat (13+, optional)',
    body: 'Free Chat lets verified players type short messages to other verified players in the same room. To turn it on, players 16+ verify their own email address; for players aged 13–15 a parent or guardian verifies their email address, which is how they give permission. We store the email address, birth year, type of permission, a random account id, Free Chat messages and safety reports, plus a hashed (unreadable) form of IP addresses to stop abuse. We use them only to run Free Chat, keep it safe (filtering, reports, mutes and bans), contact you about the account, and meet legal obligations, including reporting suspected child exploitation to the authorities. Emails are never shown to other players and never sold.',
  },
  {
    title: 'How long we keep chat data',
    body: 'Free Chat messages are deleted after 30 days, unless they are part of an open safety report (then they are kept until the report is closed). Closed reports are deleted after one year. Accounts that are not used for two years are deleted. When a chat account is deleted, we keep only its random id, a one-way hash of the email address and any mute or ban for 90 days (longer while a report about it is open), so deleting can’t be used to dodge safety action.',
  },
  {
    title: 'Deleting a Free Chat account',
    body: `Delete a Free Chat account and its messages in Settings > Chat & Community > Delete chat account, or on the web at ${deletionUrl}.`,
  },
];

if (CONFIG.features.freeChat) PRIVACY_SECTIONS.splice(PRIVACY_SECTIONS.findIndex((x) => x.title === 'Analytics'), 0, ...FREE_CHAT_PRIVACY_SECTIONS);
