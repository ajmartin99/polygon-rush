import { store } from '../../state/store';
import { ads } from '../../services/ads';
import { DAILY_REWARDS } from '../../meta/economy';
import { claimDaily, dailyAvailable, nextDailyIndex } from '../../meta/daily';
import { claimMission, describe, ensureMissions, isComplete, missionIcon } from '../../meta/missions';
import { skinById, trailById } from '../../meta/catalog';
import { BaseScreen, button, gemChip, progressBar, rewardModal, titleBar } from '../components';
import { h, ic, fmt, clear } from '../dom';
import { nav } from '../nav';
import { ui } from '../ui';

function dailyStrip(): HTMLElement {
  const d = store.data;
  const next = nextDailyIndex(d);
  const available = dailyAvailable(d);
  return h(
    'div.daily-strip',
    null,
    DAILY_REWARDS.map((amt, i) => {
      const claimed = i < next;
      const today = i === next && available;
      return h(
        `div.day${claimed ? '.claimed' : ''}${today ? '.today' : ''}${i === 6 ? '.big' : ''}`,
        null,
        h('span', null, `Day ${i + 1}`),
        ic(i === 6 ? 'gift' : 'gem'),
        h('span.amt', null, fmt(amt)),
        claimed ? h('span', { style: 'color:var(--mint)' }, '✓') : null,
      );
    }),
  );
}

/** Daily gift popup. Missing days never resets progress. */
export function openDailyGift(onDone?: () => void): void {
  const available = dailyAvailable(store.data);
  const m = ui.modal(
    [
      h('h2', null, available ? 'Daily Gift!' : 'Daily Gift'),
      h('p.muted', null, available ? 'Come back every day for bigger gifts. Day 7 has a surprise!' : 'You already opened today’s gift. See you tomorrow!'),
      dailyStrip(),
      h(
        'div.actions',
        null,
        available
          ? button({
              label: 'Open gift',
              icon: 'gift',
              cls: 'yellow lg pulse',
              onClick: async () => {
                m.close();
                const r = claimDaily(store.data);
                if (!r) return;
                store.commit();
                store.emit('gems', { gems: store.data.gems, delta: r.gems });
                const extras = [...r.skins.map((s) => `${skinById(s).name} skin`), ...r.trails.map((t) => `${trailById(t).name} trail`)];
                await rewardModal(
                  `Day ${r.dayIndex + 1} gift`,
                  r.gems,
                  extras.length ? h('p', { style: 'color:var(--yellow);font-weight:700' }, `+ ${extras.join(' & ')}!`) : null,
                  async () => {
                    const ok = await ads.showRewarded('double_daily');
                    if (ok) store.addGems(r.gems);
                    return ok;
                  },
                );
                onDone?.();
              },
            })
          : button({ label: 'OK', cls: 'mint lg', onClick: () => m.close() }),
      ),
    ],
    { wide: true, showClose: true, onClose: onDone },
  );
}

export class MissionsScreen extends BaseScreen {
  private list = h('div.list');
  private dailyPanel = h('div.panel.col', { style: 'gap:0.7rem' });

  constructor() {
    super('.solid');
    ensureMissions(store.data);
    store.commit();
    this.el.append(
      titleBar('Missions', 'target', () => nav.go('menu'), gemChip(this, false)),
      h(
        'div.grow',
        { style: 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:1rem;margin-top:0.8rem;min-height:0' },
        this.dailyPanel,
        h('div.scroll', { style: 'min-height:0' }, this.list),
      ),
    );
    this.render();
    this.own(store.on('change', () => this.render()));
  }

  private render(): void {
    const d = store.data;
    clear(this.dailyPanel);
    this.dailyPanel.append(
      h('div.row', null, ic('gift'), h('h3', null, 'Daily Gift')),
      dailyStrip(),
      dailyAvailable(d)
        ? button({ label: 'Open today’s gift', icon: 'gift', cls: 'yellow pulse', onClick: () => openDailyGift() })
        : h('p.muted.small', null, 'Next gift unlocks tomorrow.'),
      h('div.divider'),
      h('p.muted.small', null, `Missions completed: ${fmt(d.missions.completed)}`),
      h('p.muted.small', null, `Total distance: ${fmt(d.stats.totalDistance)} m · Races won: ${fmt(d.stats.racesWon)}`),
    );

    clear(this.list);
    d.missions.active.forEach((m, index) => {
      const done = isComplete(m);
      this.list.appendChild(
        h(
          `div.card.mission${done ? '.done' : ''}`,
          null,
          h('div.ic', null, ic(done ? 'check' : missionIcon(m))),
          h(
            'div.txt',
            null,
            h('b', null, describe(m)),
            progressBar(m.progress / m.target, done ? 'gold' : ''),
            h('span.prog', null, `${fmt(m.progress)} / ${fmt(m.target)}`),
          ),
          done
            ? button({
                label: 'Claim',
                icon: 'gem',
                cls: 'yellow pulse',
                onClick: async () => {
                  const reward = claimMission(store.data, index);
                  if (!reward) return;
                  store.addGems(reward);
                  await rewardModal('Mission complete!', reward, null, async () => {
                    const ok = await ads.showRewarded('double_mission');
                    if (ok) store.addGems(reward);
                    return ok;
                  });
                },
              })
            : h('div.price', { style: 'display:flex;align-items:center;gap:0.2rem;font-weight:700;color:var(--yellow)' }, ic('gem'), String(m.reward)),
        ),
      );
    });
  }
}
