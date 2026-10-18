import { BOSSES, bossLevel, bossReward, bossUnlocked, type BossDef } from '../meta/bosses';
import { store } from '../state/store';
import { button } from './components';
import { fmt, h } from './dom';
import { nav } from './nav';
import { ui } from './ui';

/** Fight a boss (Retry fights it again; Back returns to Modes). */
export function fightBoss(b: BossDef): void {
  nav.play({ mode: 'custom', level: bossLevel(b), boss: b.id, exit: () => nav.go('modes'), onRetry: () => fightBoss(b) });
}

/** Boss Battles: pick a boss. Each is beaten in one song; the next opens once you win. */
export function openBosses(): void {
  const d = store.data;
  const rows = BOSSES.map((b) => {
    const rec = d.bosses[b.id];
    const open = bossUnlocked(d.bosses, b);
    const beaten = (rec?.wins ?? 0) > 0;
    return h(
      'div.boss-row',
      { style: `--boss:${b.color}` },
      h(`div.boss-mark.${b.shape}`, null),
      h(
        'div.grow',
        null,
        h('b', null, b.name),
        h('span.muted.small', null, ` · ${b.title}`),
        h('p.small', null, !open ? `Beat ${BOSSES[BOSSES.indexOf(b) - 1].name} to unlock` : beaten ? `Beaten ${rec!.wins}× · win again for +${fmt(b.repeat)}` : rec?.best ? `Best: ${Math.round(rec.best * 100)}% of its health · win for +${fmt(b.reward)}` : `Win for +${fmt(bossReward(d.bosses, b))} gems`),
      ),
      button({
        label: beaten ? 'Rematch' : 'Fight',
        icon: open ? 'bolt' : 'lock',
        cls: open ? 'pink' : 'ghost',
        disabled: !open,
        onClick: () => {
          m.close();
          fightBoss(b);
        },
      }),
    );
  });
  const m = ui.modal(
    h(
      'div.col',
      { style: 'gap:0.6rem' },
      h('h2', null, '👑 Boss Battles'),
      h('p.muted.small', null, 'Each boss throws its attacks on the beat of its song: jump right on the beat to clear them. Grab the glowing orbs to fire them back and drain its health before the song ends!'),
      ...rows,
    ),
    { showClose: true },
  );
}
