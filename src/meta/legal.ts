/** In-app copy of the privacy policy (works offline). Keep in sync with docs/privacy.html. */
export const PRIVACY_SECTIONS: { title: string; body: string }[] = [
  {
    title: 'The short version',
    body: 'Polygon Rush has no accounts, no chat and no free-text names. Your progress is saved on your device. We do not sell personal information.',
  },
  {
    title: 'Information stored on your device',
    body: 'Game progress, settings, the birth year you entered on first launch and your generated racer name are stored only on your device. Uninstalling the app deletes them.',
  },
  {
    title: 'Age screen',
    body: 'On first launch we ask for a birth year. It is used only on the device to configure ads and parental controls (for example, players under 13 get child-directed, non-personalised ads and a grown-up check before purchases).',
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
    title: 'Play with Friends (online)',
    body: 'Online rooms connect players directly (peer-to-peer) using a short room code. Only your generated racer name, chosen skin and in-race positions are shared with people in your room. Like any internet connection, peers can see each other’s IP address. There is no chat and no public matchmaking. Parents can turn online play off in Settings > Parental Controls.',
  },
  {
    title: 'Analytics',
    body: 'Polygon Rush does not include any analytics or tracking SDKs.',
  },
  {
    title: 'Children',
    body: 'Polygon Rush is designed to be suitable for all ages and follows the Google Play Families policy. We do not knowingly collect personal information from children.',
  },
  {
    title: 'Deleting your data',
    body: 'Use Settings > Reset Progress or uninstall the app to delete all locally stored data. Ad-related data held by Google can be managed in your device’s Google settings.',
  },
];
