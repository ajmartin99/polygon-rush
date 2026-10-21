import { store } from '../../state/store';
import { ads } from '../../services/ads';
import { iap } from '../../services/iap';
import { CONFIG } from '../../config';
import {
  RARITY_COLORS,
  RARITY_LABEL,
  SKINS,
  TRAILS,
  unlockLabel,
  type SkinDef,
  type TrailDef,
} from '../../meta/catalog';
import { PRODUCTS, gemPriceOf, grantProduct, isOwned, type ProductDef } from '../../meta/products';
import { isAddOn, openAddOn } from '../profile';
import type { ShapeMode } from '../../game/shapes';
import { BaseScreen, button, gemChip, parentalGate, rewardModal, titleBar, alertModal } from '../components';
import { h, ic, fmt, clear } from '../dom';
import { nav } from '../nav';
import { previewCanvas, updatePreview } from '../preview';
import { ui } from '../ui';
import { activeEvent, eventEndLabel } from '../../meta/events';
import { EMOTES } from '../../meta/emotes';
import { packLines, PHRASE_PACKS } from '../../meta/quickchat';

type Tab = 'skins' | 'trails' | 'emotes' | 'gems';

const SHAPES: ShapeMode[] = ['square', 'triangle', 'hexagon', 'diamond'];

function ownedSkin(s: SkinDef): boolean {
  return store.ownsSkin(s.id);
}

function ownedTrail(t: TrailDef): boolean {
  return store.ownsTrail(t.id);
}

/**
 * Buy a gem-payable item (Heart Regens, profile add-ons) with gems instead of
 * money. Returns false when it's owned already or there aren't enough gems.
 */
export function buyWithGems(id: string): boolean {
  const price = gemPriceOf(id);
  if (!price || isOwned(store.data, id)) return false;
  if (!store.spendGems(price)) {
    ui.sfx('error');
    ui.toast('Not enough gems — rush for more or visit the gem shop!', 'gem');
    return false;
  }
  grantProduct(store.data, id);
  store.commit();
  if (id === CONFIG.iap.products.removeAds) void ads.removeAll();
  ui.sfx('reward');
  return true;
}

/** Full purchase flow: parental gate → Google Play → reward popup. */
export async function buyProduct(id: string): Promise<boolean> {
  if (!store.data.settings.purchasesAllowed) {
    ui.toast('Purchases are turned off in Parental Controls.', 'lock');
    return false;
  }
  if (!(await parentalGate('Purchases cost real money. Please ask a grown-up.'))) return false;
  const outcome = await iap.purchase(id);
  switch (outcome) {
    case 'ok': {
      const def = PRODUCTS.find((p) => p.id === id);
      if (id === CONFIG.iap.products.removeAds || id === CONFIG.iap.products.starterPack) void ads.removeAll();
      if (def?.gems) await rewardModal(`${def.name}!`, def.gems, h('p.muted', null, 'Thank you for supporting Polygon Rush!'));
      else await alertModal('Thank you!', `${def?.name ?? 'Item'} unlocked. Have fun!`, 'star');
      return true;
    }
    case 'pending':
      ui.toast('Purchase pending — it will arrive once payment completes.', 'info', 3500);
      return false;
    case 'cancelled':
      return false;
    case 'unavailable':
      ui.toast('The store is not available right now.', 'info');
      return false;
    default:
      ui.toast('Something went wrong. You were not charged.', 'info');
      return false;
  }
}

export function openNoAdsOffer(): void {
  const starter = PRODUCTS.find((p) => p.id === CONFIG.iap.products.starterPack)!;
  const noAds = PRODUCTS.find((p) => p.id === CONFIG.iap.products.removeAds)!;
  const m = ui.modal(
    [
      h('div.reward-burst', null, ic('noads')),
      h('h2', null, 'Rush without breaks!'),
      h('p.muted', null, 'Remove banner and break ads forever. Optional reward videos stay available for bonuses.'),
      h(
        'div.actions',
        null,
        store.data.purchases.starter
          ? null
          : button({
              label: `Starter Pack · ${iap.priceOf(starter.id)}`,
              icon: 'star',
              cls: 'yellow lg',
              onClick: async () => {
                m.close();
                await buyProduct(starter.id);
              },
            }),
        button({
          label: `No Ads · ${iap.priceOf(noAds.id)}`,
          icon: 'noads',
          cls: 'pink lg',
          onClick: async () => {
            m.close();
            await buyProduct(noAds.id);
          },
        }),
      ),
      store.data.purchases.starter ? null : h('p.muted.small', null, 'Starter Pack also includes 2,500 gems and the Golden skin.'),
    ],
    { showClose: true },
  );
}

export class ShopScreen extends BaseScreen {
  private tab: Tab;
  private body = h('div.grow', { style: 'display:flex;flex-direction:column;min-height:0' });
  private tabsEl = h('div.tabs');
  private shapeIndex = 0;
  private shapeTimer = 0;

  constructor(params?: Record<string, unknown>) {
    super('.solid');
    this.tab = (params?.tab as Tab) || 'skins';
    this.el.append(titleBar('Shop', 'cart', () => nav.go('menu'), [this.tabsEl, gemChip(this, false)]), this.body);
    this.renderTabs();
    this.render();
    this.own(iap.on('products', () => this.tab === 'gems' && this.render()));
    this.own(iap.on('granted', () => this.render()));
  }

  override leave(): void {
    super.leave();
    clearInterval(this.shapeTimer);
  }

  private renderTabs(): void {
    clear(this.tabsEl);
    const tabs: [Tab, string][] = [
      ['skins', 'Skins'],
      ['trails', 'Trails'],
      ['emotes', 'Emotes & Chat'],
      ['gems', 'Gems & Packs'],
    ];
    for (const [id, label] of tabs) {
      const b = h(`button.tab${this.tab === id ? '.active' : ''}`, null, label);
      b.addEventListener('click', () => {
        this.tab = id;
        this.renderTabs();
        this.render();
      });
      this.tabsEl.appendChild(b);
    }
  }

  private render(): void {
    clearInterval(this.shapeTimer);
    clear(this.body);
    if (this.tab === 'gems') this.renderGems();
    else if (this.tab === 'emotes') this.renderEmotes();
    else this.renderCosmetics(this.tab);
  }

  // ---------------------------------------------------------------- skins / trails
  private renderCosmetics(kind: 'skins' | 'trails'): void {
    const isSkin = kind === 'skins';
    const ev = activeEvent();
    const all: (SkinDef | TrailDef)[] = isSkin ? SKINS : TRAILS;
    const isEvent = (i: SkinDef | TrailDef) => i.unlock.kind === 'event';
    const ownsItem = (i: SkinDef | TrailDef) => (isSkin ? store.ownsSkin(i.id) : store.ownsTrail(i.id));
    // Seasonal items lead the list while their event is on; afterwards only owned ones show.
    const items = ev ? [...all.filter(isEvent), ...all.filter((i) => !isEvent(i))] : all.filter((i) => !isEvent(i) || ownsItem(i));
    let selected = isSkin ? store.data.skins.equipped : store.data.trails.equipped;

    const preview = previewCanvas(
      { skin: isSkin ? selected : store.data.skins.equipped, animate: true, scale: 0.6, trail: isSkin ? store.data.trails.equipped : selected },
      '',
    );
    const nameEl = h('h3');
    const rarityEl = h('span.rarity');
    const infoEl = h('p.muted.small');
    const actionWrap = h('div.col', { style: 'width:100%;align-items:center' });
    const grid = h('div.item-grid');

    const select = (id: string) => {
      selected = id;
      const item = items.find((i) => i.id === id)!;
      nameEl.textContent = item.name;
      rarityEl.textContent = RARITY_LABEL[item.rarity];
      rarityEl.style.background = RARITY_COLORS[item.rarity];
      if (isSkin) updatePreview(preview, { skin: id });
      else updatePreview(preview, { trail: id });
      grid.querySelectorAll('.item').forEach((el) => el.classList.toggle('selected', (el as HTMLElement).dataset.id === id));
      this.renderAction(actionWrap, item, isSkin, infoEl, () => {
        // Refresh card states after buying/equipping.
        renderGrid();
        select(id);
      });
    };

    const renderGrid = () => {
      clear(grid);
      for (const item of items) {
        const owned = isSkin ? ownedSkin(item as SkinDef) : ownedTrail(item as TrailDef);
        const equipped = isSkin ? store.data.skins.equipped === item.id : store.data.trails.equipped === item.id;
        const card = h(
          'div.item',
          { 'data-id': item.id, style: `--rc:${RARITY_COLORS[item.rarity]}` },
          equipped ? h('span.equipped-tag', null, 'EQUIPPED') : isEvent(item) && ev && !owned ? h('span.equipped-tag.spooky', null, 'HALLOWEEN') : item.unlock.kind === 'beta' ? h('span.equipped-tag.beta', null, 'BETA') : null,
          isSkin
            ? previewCanvas({ skin: item.id, scale: 0.62 })
            : previewCanvas({ skin: store.data.skins.equipped, scale: 0.5, trail: item.id, animate: true }),
          h('div.nm', null, item.name),
          owned
            ? h('div.state', null, equipped ? 'In use' : 'Owned')
            : item.unlock.kind === 'gems' || (item.unlock.kind === 'event' && item.unlock.price > 0)
              ? h('div.price', null, ic('gem'), fmt(item.unlock.price))
              : h('div.price', { style: 'color:var(--ink-dim)' }, unlockLabel(item.unlock)),
          !owned ? h('span.lock', null, ic('lock')) : null,
        );
        card.addEventListener('click', () => select(item.id));
        grid.appendChild(card);
      }
    };

    renderGrid();
    this.body.append(
      h(
        'div.shop-body',
        null,
        h('div.panel.shop-preview', null, preview, rarityEl, nameEl, infoEl, actionWrap),
        h('div.scroll', { style: 'min-height:0' }, grid),
      ),
    );
    select(selected);

    if (isSkin) {
      // Show the skin on every shape so players see what they get.
      this.shapeTimer = window.setInterval(() => {
        this.shapeIndex = (this.shapeIndex + 1) % SHAPES.length;
        updatePreview(preview, { shape: SHAPES[this.shapeIndex] });
      }, 1600);
    }
  }

  private renderAction(wrap: HTMLElement, item: SkinDef | TrailDef, isSkin: boolean, info: HTMLElement, refresh: () => void): void {
    clear(wrap);
    info.textContent = '';
    const owned = isSkin ? store.ownsSkin(item.id) : store.ownsTrail(item.id);
    const equipped = isSkin ? store.data.skins.equipped === item.id : store.data.trails.equipped === item.id;
    if (owned) {
      wrap.appendChild(
        equipped
          ? button({ label: 'Equipped', icon: 'check', cls: 'ghost', disabled: true })
          : button({
              label: 'Equip',
              icon: 'check',
              cls: 'mint lg',
              onClick: () => {
                if (isSkin) store.equipSkin(item.id);
                else store.equipTrail(item.id);
                refresh();
              },
            }),
      );
      return;
    }
    const u = item.unlock;
    switch (u.kind) {
      case 'gems': {
        const afford = store.canAfford(u.price);
        wrap.appendChild(
          button({
            label: fmt(u.price),
            icon: 'gem',
            cls: `${afford ? 'yellow' : 'ghost'} lg`,
            onClick: () => {
              if (!store.spendGems(u.price)) {
                ui.sfx('error');
                ui.toast('Not enough gems — rush for more or visit the gem shop!', 'gem');
                return;
              }
              if (isSkin) {
                store.grantSkin(item.id);
                store.equipSkin(item.id);
              } else {
                store.grantTrail(item.id);
                store.equipTrail(item.id);
              }
              ui.sfx('reward');
              ui.toast(`${item.name} unlocked!`, 'sparkle');
              refresh();
            },
          }),
        );
        if (!afford) info.textContent = `You need ${fmt(u.price - store.data.gems)} more gems.`;
        break;
      }
      case 'level':
        info.textContent = `Unlocks at level ${u.level}. You are level ${store.data.level}.`;
        wrap.appendChild(button({ label: `Level ${u.level}`, icon: 'lock', cls: 'ghost', disabled: true }));
        break;
      case 'daily':
        info.textContent = 'Claim the Daily Gift 7 days in a row to unlock.';
        wrap.appendChild(button({ label: 'Daily Gift', icon: 'gift', cls: 'pink', onClick: () => nav.go('missions') }));
        break;
      case 'starter':
        info.textContent = 'Exclusive to the Starter Pack.';
        wrap.appendChild(button({ label: 'See Starter Pack', icon: 'star', cls: 'yellow', onClick: () => this.goGems() }));
        break;
      case 'beta':
        info.textContent = 'Earned by beta testers who play 5 minutes a day: 7 days for the trail and emote, 12 days for the skin. It can’t be bought, and it’s gone for good after the beta.';
        wrap.appendChild(button({ label: 'Beta testers only', icon: 'lock', cls: 'ghost', disabled: true }));
        break;
      case 'legend':
        info.textContent = 'Part of the Legend Pack.';
        wrap.appendChild(button({ label: 'See Legend Pack', icon: 'crown', cls: 'yellow', onClick: () => this.goGems() }));
        break;
      case 'event': {
        const ev = activeEvent();
        if (!ev) {
          info.textContent = 'A Spooky Season item. It comes back next Halloween!';
          wrap.appendChild(button({ label: 'Halloween only', icon: 'lock', cls: 'ghost', disabled: true }));
          break;
        }
        const grant = () => {
          if (isSkin) {
            store.grantSkin(item.id);
            store.equipSkin(item.id);
          } else {
            store.grantTrail(item.id);
            store.equipTrail(item.id);
          }
          ui.sfx('reward');
          ui.toast(`${item.name} unlocked!`, 'sparkle');
          refresh();
        };
        const shapeNote = isSkin && (item as SkinDef).silhouette ? 'New body shape, same hitbox. ' : '';
        if (u.price === 0) {
          info.textContent = `${shapeNote}Free during ${ev.name} (${eventEndLabel(ev)}). Yours to keep!`;
          wrap.appendChild(button({ label: 'Claim free', icon: 'gift', cls: 'orange lg', onClick: grant }));
          break;
        }
        const afford = store.canAfford(u.price);
        info.textContent = shapeNote + (afford ? `${ev.name} only, ${eventEndLabel(ev)}. Yours to keep!` : `You need ${fmt(u.price - store.data.gems)} more gems. ${ev.name} ${eventEndLabel(ev)}.`);
        wrap.appendChild(
          button({
            label: fmt(u.price),
            icon: 'gem',
            cls: `${afford ? 'orange' : 'ghost'} lg`,
            onClick: () => {
              if (!store.spendGems(u.price)) {
                ui.sfx('error');
                ui.toast('Not enough gems — rush for more or visit the gem shop!', 'gem');
                return;
              }
              grant();
            },
          }),
        );
        break;
      }
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- emotes
  private renderEmotes(): void {
    const ev = activeEvent();
    const owned = new Set(store.data.emotes.owned);
    // Seasonal emotes show while their event is on (and always once owned).
    const list = EMOTES.filter((e) => e.unlock.kind !== 'event' || ev || owned.has(e.id));
    const grid = h('div.emote-grid');
    for (const e of list) {
      const has = owned.has(e.id);
      const u = e.unlock;
      const price = u.kind === 'gems' || u.kind === 'event' ? u.price : 0;
      const buy = () => {
        if (has) return;
        if (u.kind === 'beta') return void ui.toast('Beta testers earn it by playing 5 minutes a day on 7 days. Gone after the beta.', 'lock', 3500);
        if (price > 0 && !store.spendGems(price)) {
          ui.sfx('error');
          ui.toast('Not enough gems — rush for more or visit the gem shop!', 'gem');
          return;
        }
        store.data.emotes.owned.push(e.id);
        store.commit();
        ui.sfx('reward');
        ui.toast(`${e.name} unlocked! Use it on the podium and in lobbies.`, 'sparkle');
        this.render();
      };
      grid.append(
        h(
          `button.emote-card${has ? '.owned' : ''}`,
          { style: `--rc:${RARITY_COLORS[e.rarity]}`, onclick: buy, 'aria-label': has ? `${e.name}, owned` : `Buy ${e.name}` },
          u.kind === 'event' && !has ? h('span.equipped-tag.spooky', null, 'HALLOWEEN') : u.kind === 'beta' ? h('span.equipped-tag.beta', null, 'BETA') : null,
          h(`span.emote-glyph.e-${e.anim}`, null, e.glyph),
          h('b', null, e.name),
          has ? h('span.state', null, 'Owned') : u.kind === 'beta' ? h('span.price', null, ic('lock'), 'Beta only') : h('span.price', null, ic('gem'), price ? fmt(price) : 'Free'),
        ),
      );
    }
    this.body.append(
      h(
        'div.scroll',
        { style: 'min-height:0' },
        h('p.muted.small', { style: 'margin:0.5rem 0' }, 'Pop emotes on the podium after races and in online lobbies. Everyone in the room sees them.'),
        grid,
        h('h3', { style: 'margin:1rem 0 0.3rem' }, ic('chat'), ' Quick Chat phrase packs'),
        h('p.muted.small', { style: 'margin:0 0 0.5rem' }, 'More things to say in online rooms. Everyone in the room can read them, even without the pack.'),
        this.phrasePacks(),
      ),
    );
  }

  private phrasePacks(): HTMLElement {
    const ev = activeEvent();
    const owned = new Set(store.data.phrases.owned);
    const grid = h('div.pack-grid');
    for (const p of PHRASE_PACKS) {
      const has = owned.has(p.id);
      if (p.event && !has && ev?.id !== p.event) continue;
      const lines = packLines(p.id);
      const buy = () => {
        if (has) return;
        if (!store.spendGems(p.price)) {
          ui.sfx('error');
          ui.toast('Not enough gems — rush for more or visit the gem shop!', 'gem');
          return;
        }
        store.data.phrases.owned.push(p.id);
        store.commit();
        ui.sfx('reward');
        ui.toast(`${p.name} unlocked! Find the new phrases in Quick Chat.`, 'chat');
        this.render();
      };
      grid.append(
        h(
          `button.pack-card${has ? '.owned' : ''}`,
          { onclick: buy, 'aria-label': has ? `${p.name}, owned` : `Buy ${p.name} for ${p.price} gems` },
          p.event && !has ? h('span.equipped-tag.spooky', null, 'HALLOWEEN') : null,
          h('b', null, p.name),
          h('span.muted.small', null, p.blurb),
          h('div.pack-lines', null, lines.slice(0, 6).map((l) => h('span', null, l.text))),
          h('span.small.muted', null, `${lines.length} phrases & emotes`),
          has ? h('span.state', null, 'Owned') : h('span.price', null, ic('gem'), fmt(p.price)),
        ),
      );
    }
    return grid;
  }

  private goGems(): void {
    this.tab = 'gems';
    this.renderTabs();
    this.render();
  }

  // ---------------------------------------------------------------- gems & packs
  private renderGems(): void {
    const grid = h('div.offer-grid');
    // Free gems via an optional rewarded video.
    const left = ads.freeGemsLeft();
    grid.appendChild(
      h(
        'div.offer',
        null,
        h('span.ribbon', { style: 'background:var(--mint);color:#053a2a' }, 'Free'),
        h('div.art', null, ic('video')),
        h('div.big', null, `+${CONFIG.ads.freeGemsReward}`),
        h('div.desc', null, left > 0 ? `Watch a short video · ${left} left today` : 'Come back tomorrow for more!'),
        button({
          label: 'Watch',
          icon: 'video',
          cls: 'mint',
          disabled: left <= 0,
          onClick: async () => {
            const ok = await ads.showRewarded('free_gems');
            if (ok) {
              ads.noteFreeGemsUsed();
              store.addGems(CONFIG.ads.freeGemsReward);
              ui.sfx('reward');
              ui.toast(`+${CONFIG.ads.freeGemsReward} gems!`, 'gem');
            }
            this.render();
          },
        }),
      ),
    );
    for (const p of PRODUCTS) grid.appendChild(this.offerCard(p));

    const restore = button({
      label: 'Restore purchases',
      icon: 'restore',
      cls: 'ghost sm',
      onClick: async () => {
        const n = await iap.restore();
        ui.toast(n > 0 ? `Restored ${n} purchase${n > 1 ? 's' : ''}!` : 'Everything is already up to date.', 'restore');
        this.render();
      },
    });
    this.body.append(
      h('div.scroll.grow', { style: 'min-height:0' }, grid),
      h(
        'div.row',
        { style: 'justify-content:space-between' },
        h('p.muted.small', null, iap.available ? 'Prices are shown in your local currency by Google Play.' : 'Store not available on this device.'),
        restore,
      ),
    );
  }

  private offerCard(p: ProductDef): HTMLElement {
    const owned = isOwned(store.data, p.id);
    const art =
      p.id === CONFIG.iap.products.removeAds
        ? ic('noads')
        : p.id === CONFIG.iap.products.legendPack
          ? ic('crown')
          : p.id === CONFIG.iap.products.starterPack
            ? ic('star')
            : p.id === CONFIG.iap.products.creatorSpotlight
              ? ic('public')
              : p.id === CONFIG.iap.products.builderPack
                ? ic('build')
                : ic('gem');
    return h(
      `div.offer${p.featured ? '.featured' : ''}`,
      null,
      p.ribbon && !owned ? h('span.ribbon', null, p.ribbon) : null,
      h('div.art', null, art),
      h('div.big', null, p.gems && p.kind === 'consumable' ? fmt(p.gems) : p.name),
      h('div.desc', null, p.kind === 'consumable' ? p.name : p.desc),
      owned
        ? h('div.owned', null, 'Owned ✓')
        : isAddOn(p.id)
          ? button({
              label: 'Preview',
              sub: `${iap.priceOf(p.id) || p.fallbackPrice} or ${fmt(gemPriceOf(p.id))} gems`,
              cls: 'cyan',
              onClick: () => openAddOn(p.id, () => this.render()),
            })
          : button({
              label: iap.priceOf(p.id) || '—',
              cls: p.featured ? 'yellow' : 'cyan',
              disabled: !iap.available,
              onClick: async () => {
                await buyProduct(p.id);
                this.render();
              },
            }),
      // Some items can be paid with gems too (No Ads only during the beta).
      !owned && !isAddOn(p.id) && gemPriceOf(p.id) > 0
        ? button({
            label: `${fmt(gemPriceOf(p.id))} gems`,
            icon: 'gem',
            cls: `${store.canAfford(gemPriceOf(p.id)) ? 'yellow' : 'ghost'} sm`,
            onClick: () => {
              if (!buyWithGems(p.id)) return;
              ui.toast(p.id === CONFIG.iap.products.removeAds ? 'Ads are off. Thanks for testing!' : `${p.name}: yours!`, 'sparkle', 3000);
              this.render();
            },
          })
        : null,
    );
  }
}
