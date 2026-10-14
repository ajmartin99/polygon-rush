import { CONFIG } from '../config';

const deletionUrl = CONFIG.server.url ? `${CONFIG.server.url}/account/delete` : 'the account deletion page on our community server';

/** In-app copy of the privacy policy (works offline). Keep in sync with docs/privacy.html. */
export const PRIVACY_SECTIONS: { title: string; body: string }[] = [
  {
    title: 'The short version',
    body: 'Polygon Rush has no sign-in and no free-text names. Your progress and the levels you build are saved on your device. The only account is the optional Free Chat account for players 13 and older, which needs an email address (a parent’s email for ages 13–15). Players under 13 never get typed chat or public rooms. We do not sell personal information.',
  },
  {
    title: 'Information stored on your device',
    body: 'Game progress, settings, the birth year you entered on first launch, your generated racer name and the levels you build or import are stored only on your device. Uninstalling the app deletes them.',
  },
  {
    title: 'Age screen',
    body: 'On first launch we ask for a birth year. It is used on the device to set up ads, parental controls and which online features are offered (Quick Chat for everyone; public rooms and Free Chat only from 13). When you sign up for Free Chat, the birth year is sent with your email so the right permission (yours at 16+, a parent’s at 13–15) is asked for.',
  },
  {
    title: 'Advertising (Google AdMob)',
    body: 'The free version shows ads from Google AdMob. All ads are limited to the "G" (general audiences) content rating. For players under 13, ad requests are tagged as child-directed and are non-personalised. Players 13+ in regions that require it are asked for consent through Google’s consent form, which can be changed any time in Settings > Privacy Choices. AdMob may process device identifiers and IP address as described in Google’s policies: https://policies.google.com/technologies/ads',
  },
  {
    title: 'In-app purchases (Google Play)',
    body: 'Purchases are processed entirely by Google Play. We never see your payment details. A grown-up check is shown before any purchase for players who are not adults, and parents can turn purchases off in Settings > Parental Controls.',
  },
  {
    title: 'Online rooms (Play with Friends, Build Together)',
    body: 'Online rooms connect players directly (peer-to-peer) using a short room code; a signalling server only helps them find each other. Players in a room share their generated racer name, skin, race positions, level edits and Quick Chat choices (preset phrases, never typed text). Like any internet connection, players in a room can see each other’s IP address. Parents can turn online play and Quick Chat off in Settings > Parental Controls.',
  },
  {
    title: 'Level codes',
    body: 'Sharing a level creates a code containing only the level itself and the generated names of the players who built it.',
  },
  {
    title: 'Public build rooms (13+)',
    body: 'A host aged 13+ can list a build room publicly. The list shows the room code, the level’s name and colours, the host’s generated name and the number of builders. If someone reports a public room, a snapshot of the level is sent to our safety team.',
  },
  {
    title: 'Free Chat (13+, optional)',
    body: 'Free Chat lets verified players type short messages to other verified players in the same room. To turn it on, players 16+ verify their own email address; for players aged 13–15 a parent or guardian verifies their email address, which is how they give permission. We store the email address, birth year, type of permission, a random account id, Free Chat messages and safety reports, plus a hashed (unreadable) form of IP addresses to stop abuse. We use them only to run Free Chat, keep it safe (filtering, reports, mutes and bans), contact you about the account, and meet legal obligations, including reporting suspected child exploitation to the authorities. Emails are never shown to other players and never sold.',
  },
  {
    title: 'How long we keep chat data',
    body: 'Free Chat messages are deleted after 30 days, unless they are part of an open safety report (then they are kept until the report is closed). Closed reports are deleted after one year. Accounts that are not used for two years are deleted. When a chat account is deleted, we keep only its random id, a one-way hash of the email address and any mute or ban for 90 days (longer while a report about it is open), so deleting can’t be used to dodge safety action.',
  },
  {
    title: 'Analytics',
    body: 'Polygon Rush does not include any analytics or tracking SDKs.',
  },
  {
    title: 'Children',
    body: 'Polygon Rush is designed to be suitable for all ages and follows the Google Play Families policy. We do not knowingly collect personal information from children under 13: they can only use Quick Chat’s preset phrases, and cannot create a Free Chat account or use public rooms.',
  },
  {
    title: 'Deleting your data',
    body: `Use Settings > Reset Progress or uninstall the app to delete data on your device (delete levels in Create > My Levels). Delete a Free Chat account and its messages in Settings > Chat & Community > Delete chat account, or on the web at ${deletionUrl}. Ad-related data held by Google can be managed in your device’s Google settings.`,
  },
];
