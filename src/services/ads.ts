import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  MaxAdContentRating,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { CONFIG } from '../config';
import { Emitter } from '../core/emitter';
import { isNative, todayKey } from '../core/platform';
import { store } from '../state/store';
import { h } from '../ui/dom';
import { ui } from '../ui/ui';

export type RewardPlacement = 'revive' | 'double_run' | 'free_gems' | 'double_daily' | 'double_mission';

interface AdEvents extends Record<string, unknown> {
  /** A full-screen ad is about to cover the game (pause audio). */
  fullscreenStart: void;
  fullscreenEnd: void;
  banner: { height: number };
}

/**
 * Kid-safe AdMob wrapper.
 * - Children (neutral age screen) get child-directed, non-personalised, G-rated ads.
 * - Everyone gets G-rated ads only (this is an all-ages game).
 * - Interstitials only between runs, capped and skipped for new players.
 * - Rewarded ads are always optional and clearly labelled.
 * - Buying "No Ads" removes banners and interstitials (rewarded stay optional).
 */
class AdService extends Emitter<AdEvents> {
  private ready = false;
  private native = false;
  private rewardedLoaded = false;
  private rewardedLoading: Promise<boolean> | null = null;
  private interstitialLoaded = false;
  private bannerShown = false;
  private bannerWanted = false;
  private runsThisSession = 0;
  privacyOptionsRequired = false;

  get removed(): boolean {
    return store.data.purchases.noAds;
  }

  private get childDirected(): boolean {
    // Unknown age is treated like a child until answered.
    return store.data.profile.ageGroup !== 'adult' && store.data.profile.ageGroup !== 'teen';
  }

  private get npa(): boolean {
    return this.childDirected;
  }

  async init(): Promise<void> {
    if (this.ready) return;
    this.native = isNative();
    this.ready = true;
    if (!this.native) return;
    try {
      await AdMob.initialize({
        initializeForTesting: CONFIG.ads.testing,
        tagForChildDirectedTreatment: this.childDirected,
        tagForUnderAgeOfConsent: this.childDirected,
        maxAdContentRating: MaxAdContentRating.General,
      });
    } catch (e) {
      console.warn('AdMob init failed', e);
      this.native = false;
      return;
    }
    if (!this.childDirected) {
      await this.gatherConsent();
    }
    this.wireListeners();
    void this.loadRewarded();
    if (!this.removed) void this.loadInterstitial();
    if (this.bannerWanted) void this.showBanner();
  }

  /** Google UMP consent (EEA/UK/CH). Never shown to children. */
  private async gatherConsent(): Promise<void> {
    try {
      const info = await AdMob.requestConsentInfo({ tagForUnderAgeOfConsent: false });
      if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
        await AdMob.showConsentForm();
      }
      const after = await AdMob.requestConsentInfo({ tagForUnderAgeOfConsent: false });
      this.privacyOptionsRequired = String(after.privacyOptionsRequirementStatus) === 'REQUIRED';
    } catch (e) {
      console.warn('Consent flow failed', e);
    }
  }

  async showPrivacyOptions(): Promise<void> {
    if (!this.native) return;
    try {
      await AdMob.showPrivacyOptionsForm();
    } catch (e) {
      console.warn(e);
    }
  }

  private wireListeners(): void {
    void AdMob.addListener(RewardAdPluginEvents.Loaded, () => (this.rewardedLoaded = true));
    void AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => (this.rewardedLoaded = false));
    void AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => (this.interstitialLoaded = true));
    void AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => (this.interstitialLoaded = false));
    void AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) => {
      const height = this.bannerShown ? size.height : 0;
      document.documentElement.style.setProperty('--banner-h', `${height}px`);
      this.emit('banner', { height });
    });
  }

  private adOptions(adId: string) {
    return { adId, isTesting: CONFIG.ads.testing, npa: this.npa, immersiveMode: true };
  }

  private loadRewarded(): Promise<boolean> {
    if (!this.native) return Promise.resolve(true);
    if (this.rewardedLoaded) return Promise.resolve(true);
    if (this.rewardedLoading) return this.rewardedLoading;
    this.rewardedLoading = AdMob.prepareRewardVideoAd(this.adOptions(CONFIG.ads.rewardedId))
      .then(() => {
        this.rewardedLoaded = true;
        return true;
      })
      .catch(() => {
        this.rewardedLoaded = false;
        return false;
      })
      .finally(() => {
        this.rewardedLoading = null;
      });
    return this.rewardedLoading;
  }

  private async loadInterstitial(): Promise<void> {
    if (!this.native || this.removed || this.interstitialLoaded) return;
    try {
      await AdMob.prepareInterstitial(this.adOptions(CONFIG.ads.interstitialId));
      this.interstitialLoaded = true;
    } catch {
      this.interstitialLoaded = false;
    }
  }

  /** Is the "free gems" video still available today? */
  freeGemsLeft(): number {
    const a = store.data.ads;
    const today = todayKey();
    if (a.freeGemsDay !== today) return CONFIG.ads.freeGemsPerDay;
    return Math.max(0, CONFIG.ads.freeGemsPerDay - a.freeGemsCount);
  }

  noteFreeGemsUsed(): void {
    const a = store.data.ads;
    const today = todayKey();
    if (a.freeGemsDay !== today) {
      a.freeGemsDay = today;
      a.freeGemsCount = 0;
    }
    a.freeGemsCount += 1;
    store.commit();
  }

  /**
   * Show a rewarded video. Resolves true only if the player earned the reward.
   */
  async showRewarded(placement: RewardPlacement): Promise<boolean> {
    if (!this.native) return this.simulateRewarded(placement);
    const loaded = await Promise.race([this.loadRewarded(), new Promise<boolean>((r) => setTimeout(() => r(false), 7000))]);
    if (!loaded) {
      ui.toast('No video available right now. Try again soon!', 'video');
      void this.loadRewarded();
      return false;
    }
    this.emit('fullscreenStart', undefined);
    const earned = await new Promise<boolean>((resolve) => {
      let got = false;
      const handles: Promise<{ remove: () => Promise<void> }>[] = [];
      const done = (v: boolean) => {
        handles.forEach((p) => void p.then((x) => x.remove()));
        resolve(v);
      };
      handles.push(AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (got = true)));
      handles.push(AdMob.addListener(RewardAdPluginEvents.Dismissed, () => setTimeout(() => done(got), 50)));
      handles.push(AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => done(false)));
      // Resolves on reward only; dismissal is handled by the listeners above.
      AdMob.showRewardVideoAd().catch(() => done(false));
    });
    this.rewardedLoaded = false;
    this.emit('fullscreenEnd', undefined);
    void this.loadRewarded();
    return earned;
  }

  /** Browser/dev builds: a fake ad so every reward flow can be tested. */
  private simulateRewarded(placement: RewardPlacement): Promise<boolean> {
    return new Promise((resolve) => {
      let earned = false;
      let left = 3;
      const counter = h('b', null, String(left));
      const m = ui.modal(
        [
          h('h2', null, 'Test Ad'),
          h('p.muted', null, `Simulated rewarded video (${placement}). Real ads only appear in the Android app.`),
          h('p', { style: 'font-size:2rem' }, counter),
        ],
        { dismissable: true, showClose: true, onClose: () => resolve(earned) },
      );
      this.emit('fullscreenStart', undefined);
      const iv = setInterval(() => {
        left -= 1;
        counter.textContent = String(left);
        if (left <= 0) {
          clearInterval(iv);
          earned = true;
          m.close();
        }
      }, 1000);
      void m.closed.then(() => {
        clearInterval(iv);
        this.emit('fullscreenEnd', undefined);
      });
    });
  }

  /** Call after every finished run. Shows an interstitial when the caps allow. */
  async afterRun(): Promise<void> {
    this.runsThisSession += 1;
    const a = store.data.ads;
    a.runsSinceInterstitial += 1;
    store.commit();
    if (this.removed || !this.native) return;
    const now = Date.now();
    const totalRuns = store.data.stats.runs + store.data.stats.racesPlayed;
    if (totalRuns < CONFIG.ads.interstitialGraceRuns) return;
    if (a.runsSinceInterstitial < CONFIG.ads.interstitialEveryRuns) return;
    if (now - a.lastInterstitialAt < CONFIG.ads.interstitialMinSeconds * 1000) return;
    if (!this.interstitialLoaded) {
      void this.loadInterstitial();
      return;
    }
    this.emit('fullscreenStart', undefined);
    try {
      const dismissed = new Promise<void>((resolve) => {
        const hs = [
          AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => finish()),
          AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => finish()),
        ];
        const finish = () => {
          hs.forEach((p) => void p.then((x) => x.remove()));
          resolve();
        };
      });
      await AdMob.showInterstitial();
      await Promise.race([dismissed, new Promise((r) => setTimeout(r, 60000))]);
      a.runsSinceInterstitial = 0;
      a.lastInterstitialAt = Date.now();
      store.commit();
    } catch {
      /* not ready */
    } finally {
      this.interstitialLoaded = false;
      this.emit('fullscreenEnd', undefined);
      void this.loadInterstitial();
    }
  }

  /** Banner on menu screens only — never during gameplay. */
  async showBanner(): Promise<void> {
    this.bannerWanted = true;
    if (!this.native || this.removed) return;
    try {
      if (this.bannerShown) {
        await AdMob.resumeBanner();
      } else {
        await AdMob.showBanner({
          ...this.adOptions(CONFIG.ads.bannerId),
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
        });
      }
      this.bannerShown = true;
    } catch {
      this.bannerShown = false;
    }
  }

  async hideBanner(): Promise<void> {
    this.bannerWanted = false;
    document.documentElement.style.setProperty('--banner-h', '0px');
    if (!this.native || !this.bannerShown) return;
    try {
      await AdMob.hideBanner();
    } catch {
      /* ignore */
    }
  }

  /** After buying No Ads. */
  async removeAll(): Promise<void> {
    if (!this.native) return;
    try {
      await AdMob.removeBanner();
    } catch {
      /* ignore */
    }
    this.bannerShown = false;
    this.interstitialLoaded = false;
    document.documentElement.style.setProperty('--banner-h', '0px');
  }
}

export const ads = new AdService();
