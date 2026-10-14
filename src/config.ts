/**
 * Build-time configuration. Every value can be overridden with a VITE_* env
 * variable (see .env.example and the GitHub workflows). Defaults are safe for
 * development: Google's public AdMob *test* units and the free PeerJS cloud.
 */
const env = import.meta.env;

const str = (v: string | undefined, fallback: string): string => (v && v.trim() ? v.trim() : fallback);

/** Google's documented AdMob test unit ids — never earn money, never risk a policy strike. */
const TEST_ADS = {
  banner: 'ca-app-pub-3940256099942544/9214589741',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};

const bannerId = str(env.VITE_ADMOB_BANNER_ID, TEST_ADS.banner);
const interstitialId = str(env.VITE_ADMOB_INTERSTITIAL_ID, TEST_ADS.interstitial);
const rewardedId = str(env.VITE_ADMOB_REWARDED_ID, TEST_ADS.rewarded);
const usingTestUnits = bannerId === TEST_ADS.banner || interstitialId === TEST_ADS.interstitial || rewardedId === TEST_ADS.rewarded;

export const CONFIG = {
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0',
  appName: 'Polygon Rush',
  ads: {
    bannerId,
    interstitialId,
    rewardedId,
    /** Test mode is forced whenever any unit id is still a Google test id. */
    testing: usingTestUnits || env.VITE_ADS_TESTING === 'true',
    /** Show an interstitial at most once every N finished runs... */
    interstitialEveryRuns: 3,
    /** ...and never more often than this. */
    interstitialMinSeconds: 150,
    /** New players get this many ad-free runs before the first interstitial. */
    interstitialGraceRuns: 3,
    /** Rewarded "free gems" videos per day and the payout of each. */
    freeGemsPerDay: 5,
    freeGemsReward: 60,
  },
  iap: {
    products: {
      removeAds: 'remove_ads',
      gemsSmall: 'gems_small',
      gemsMedium: 'gems_medium',
      gemsLarge: 'gems_large',
      starterPack: 'starter_pack',
      legendPack: 'legend_pack',
    },
  },
  net: {
    host: env.VITE_PEER_HOST?.trim() || undefined,
    port: env.VITE_PEER_PORT ? Number(env.VITE_PEER_PORT) : undefined,
    path: env.VITE_PEER_PATH?.trim() || undefined,
    key: env.VITE_PEER_KEY?.trim() || undefined,
    secure: env.VITE_PEER_SECURE ? env.VITE_PEER_SECURE === 'true' : undefined,
    turnUrl: env.VITE_TURN_URL?.trim() || undefined,
    turnUsername: env.VITE_TURN_USERNAME?.trim() || undefined,
    turnCredential: env.VITE_TURN_CREDENTIAL?.trim() || undefined,
    /** Room ids are namespaced so different app versions never collide. */
    roomPrefix: 'polygonrush-v1-',
    maxPlayers: 4,
  },
  privacyUrl: str(env.VITE_PRIVACY_URL, 'https://ajmartin99.github.io/polygon-rush/privacy.html'),
  supportEmail: str(env.VITE_SUPPORT_EMAIL, ''),
} as const;
