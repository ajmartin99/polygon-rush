import { describe, expect, it } from 'vitest';
import { History, LevelDoc, SyncedDoc, type EditOp } from '../src/editor/doc';
import { slotOf, START_ZONE, type LevelContent, type Piece } from '../src/game/level';
import { mulberry32 } from '../src/core/rng';

const base = (): LevelContent => ({ name: [1, 2], authors: [], theme: 0, speed: 1, hearts: 3, length: 100, pieces: [] });
const put = (p: Piece): EditOp => ({ s: slotOf(p), p });
const clear = (p: Piece): EditOp => ({ s: slotOf(p), p: null });

describe('level doc', () => {
  it('applies, validates and reports changes', () => {
    const doc = new LevelDoc(base());
    const ch = doc.apply([
      put({ t: 'block', x: 10, y: 0, v: 0 }),
      put({ t: 'block', x: 2, y: 0, v: 0 }), // start zone
      put({ t: 'spike', x: 200, y: 0, v: 0 }), // past the finish
      { s: 999, p: { t: 'gem', x: 11, y: 1, v: 0 } }, // wrong slot
    ]);
    expect(ch).toHaveLength(1);
    expect(doc.count).toBe(1);
    expect(doc.apply([put({ t: 'block', x: 10, y: 0, v: 0 })])).toHaveLength(0);
  });

  it('undo and redo restore exactly, including length cuts', () => {
    const doc = new LevelDoc(base());
    const hist = new History();
    const commit = (ops: EditOp[]) => hist.record(doc.apply(ops));
    commit([put({ t: 'block', x: 10, y: 0, v: 0 }), put({ t: 'gem', x: 90, y: 3, v: 1 })]);
    commit([{ set: { length: 50 } }]);
    expect(doc.count).toBe(1);
    expect(doc.settings.length).toBe(50);
    const u = hist.undo(doc);
    u.push(doc.apply(u.ops));
    expect(doc.settings.length).toBe(100);
    expect(doc.get(slotOf({ t: 'gem', x: 90, y: 3 }))).toEqual({ t: 'gem', x: 90, y: 3, v: 1 });
    const u2 = hist.undo(doc);
    u2.push(doc.apply(u2.ops));
    expect(doc.count).toBe(0);
    const r = hist.redo(doc);
    r.push(doc.apply(r.ops));
    expect(doc.count).toBe(2);
    expect(doc.toContent().pieces.map((p) => p.t)).toEqual(['block', 'gem']);
  });

  it('undo never wipes a slot someone else changed since', () => {
    const doc = new LevelDoc(base());
    const hist = new History();
    hist.record(doc.apply([put({ t: 'block', x: 10, y: 0, v: 0 })]));
    doc.apply([put({ t: 'spike', x: 10, y: 0, v: 0 })]); // a friend replaced it
    const u = hist.undo(doc);
    expect(u.ops).toHaveLength(0);
  });
});

describe('co-op sync', () => {
  /** Host + clients with random message delays; everyone must end with the host's level. */
  it('converges for random concurrent edits', () => {
    for (let trial = 0; trial < 25; trial++) {
      const rand = mulberry32(1000 + trial);
      const host = new LevelDoc(base());
      const clients = [0, 1, 2].map(() => new SyncedDoc(new LevelDoc(base())));
      type Msg = { at: number; ops: EditOp[]; by: number; seq: number };
      const toHost: Msg[] = [];
      const toClient: Msg[][] = clients.map(() => []);
      let now = 0;
      const randomOp = (): EditOp => {
        const r = rand();
        if (r < 0.04) return { set: { length: 40 + Math.floor(rand() * 60) } };
        const x = START_ZONE + Math.floor(rand() * 20);
        const y = Math.floor(rand() * 3);
        const p: Piece = rand() < 0.5 ? { t: 'block', x, y, v: 0 } : { t: 'spike', x, y, v: rand() < 0.5 ? 1 : 0 };
        return rand() < 0.3 ? clear(p) : put(p);
      };
      const deliverHost = (m: Msg) => {
        // Host orders it, applies and broadcasts the accepted ops with the sender's seq.
        const ch = host.apply(m.ops);
        void ch;
        clients.forEach((_, i) => toClient[i].push({ at: now + 1 + rand() * 5, ops: m.ops, by: m.by, seq: m.seq }));
      };
      for (let step = 0; step < 400; step++) {
        now += 1;
        const who = Math.floor(rand() * 4); // 3 = host edits
        if (who === 3) deliverHost({ at: now, ops: [randomOp()], by: -1, seq: 0 });
        else {
          const ops = [randomOp(), randomOp()];
          const { seq } = clients[who].local(ops);
          toHost.push({ at: now + 1 + rand() * 5, ops, by: who, seq });
        }
        // Deliver due messages in order (channels are ordered per sender).
        while (toHost.length && toHost[0].at <= now) deliverHost(toHost.shift()!);
        toClient.forEach((q, i) => {
          while (q.length && q[0].at <= now) {
            const m = q.shift()!;
            clients[i].remote(m.ops, m.by === i ? m.seq : null);
          }
        });
      }
      // Drain.
      now += 100;
      while (toHost.length) deliverHost(toHost.shift()!);
      toClient.forEach((q, i) => {
        for (const m of q) clients[i].remote(m.ops, m.by === i ? m.seq : null);
      });
      const want = JSON.stringify(host.toContent());
      for (const c of clients) {
        expect(c.pendingCount).toBe(0);
        expect(JSON.stringify(c.doc.toContent())).toBe(want);
      }
    }
  });
});
