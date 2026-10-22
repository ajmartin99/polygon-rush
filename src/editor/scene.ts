import { audio } from '../core/audio';
import { CEIL, VIEW_BOTTOM, VIEW_TOP } from '../game/constants';
import { buildWorld, LEVEL_ROWS, LEVEL_START_X, MAX_LENGTH, MIN_LENGTH, slotOf, START_ZONE, VARIANTS, type Piece } from '../game/level';
import type { Scene } from '../game/scene';
import type { World } from '../game/world';
import { BIOMES, rgba } from '../render/biomes';
import { drawCharacter } from '../render/character';
import type { FreeView, Renderer } from '../render/renderer';
import { skinById } from '../meta/catalog';
import { store } from '../state/store';
import type { EditOp } from './doc';
import { PLAYER_COLORS, type EditorSession } from './session';
import { nextVariant, pieceFor, TOOLS, toolIndex, type Tool } from './tools';

const MINIMAP_H = 26; // CSS px
const EDGE_SCROLL = 44; // CSS px

interface Cell {
  x: number;
  y: number;
}

/** Feedback the screen shows (toasts, button states). */
export interface SceneHooks {
  notice(text: string): void;
  changed(): void;
}

/**
 * The level editor's canvas: draws the level with a free camera plus a grid,
 * the start zone, builders' cursors and a minimap, and turns taps and drags
 * into edits. Two fingers (or the Move tool) pan.
 */
export class EditorScene implements Scene {
  /** Screen chrome around the playfield (CSS px). */
  insets = { left: 0, top: 0, right: 0, bottom: 0 };
  private world: World | null = null;
  private dirty = true;
  private view: FreeView | null = null;
  private renderer: Renderer | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private stroke: { pointer: number; last: Cell | null; mode: 'paint' | 'erase' | 'none'; first: boolean; client: { x: number; y: number } } | null = null;
  private pan: { x: number; camX: number; ids: number[] } | null = null;
  private minimapDrag: number | null = null;
  private hover: Cell | null = null;
  private flashCell: { cell: Cell; until: number } | null = null;
  private time = 0;
  private offs: (() => void)[] = [];
  private noticeAt = new Map<string, number>();
  private readonly canvas: HTMLCanvasElement;

  constructor(
    private readonly session: EditorSession,
    canvas: HTMLCanvasElement,
    private readonly hooks: SceneHooks,
  ) {
    this.canvas = canvas;
    this.offs.push(session.on('change', () => (this.dirty = true)));
  }

  attach(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.down, { passive: false });
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    c.addEventListener('wheel', this.wheel, { passive: false });
    window.addEventListener('keydown', this.key);
  }

  detach(): void {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.up);
    c.removeEventListener('wheel', this.wheel);
    window.removeEventListener('keydown', this.key);
    for (const off of this.offs.splice(0)) off();
  }

  private get tool(): Tool {
    return TOOLS[toolIndex(this.session.tool)] ?? TOOLS[0];
  }

  // ================================================================== frame
  frame(renderer: Renderer, dt: number, time: number): void {
    this.renderer = renderer;
    this.time = time;
    const doc = this.session.doc;
    if (this.dirty || !this.world) {
      this.world = buildWorld(doc.toContent());
      this.dirty = false;
    }
    const dpr = renderer.dpr;
    const area = {
      x: this.insets.left * dpr,
      y: this.insets.top * dpr,
      w: Math.max(10, renderer.width - (this.insets.left + this.insets.right) * dpr),
      h: Math.max(10, renderer.height - (this.insets.top + this.insets.bottom + MINIMAP_H) * dpr),
    };
    if (this.session.camX < -50) this.session.camX = -1;
    this.edgeScroll(dt, area);
    const view = renderer.frameView(area, this.session.camX);
    this.clampCamera(view, area);
    this.view = renderer.frameView(area, this.session.camX);
    const pal = BIOMES[doc.settings.theme % BIOMES.length];
    renderer.highContrast = store.settings.highContrast;
    renderer.renderScene(this.world, this.view, {
      palette: pal,
      time,
      beat: audio.beatPhase(),
      dt,
      overlay: (ctx, v) => this.overlay(ctx, v, area, dpr),
    });
  }

  private clampCamera(view: FreeView, area: { w: number }): void {
    const visible = area.w / view.scale;
    const max = this.session.doc.settings.length + 12 - visible;
    this.session.camX = Math.max(-3, Math.min(Math.max(-3, max), this.session.camX));
  }

  /** While painting near the left/right edge, scroll the level. */
  private edgeScroll(dt: number, area: { x: number; w: number }): void {
    const st = this.stroke;
    if (!st || st.mode === 'none' || !this.view || !this.renderer) return;
    const dpr = this.renderer.dpr;
    const px = this.localX(st.client.x) * dpr;
    let dir = 0;
    if (px < area.x + EDGE_SCROLL * dpr) dir = -1;
    else if (px > area.x + area.w - EDGE_SCROLL * dpr) dir = 1;
    if (!dir) return;
    this.session.camX += dir * dt * 14;
    this.strokeTo(st.client.x, st.client.y);
  }

  // ================================================================== overlay
  private overlay(ctx: CanvasRenderingContext2D, v: FreeView, area: { x: number; y: number; w: number; h: number }, dpr: number): void {
    const s = v.scale;
    const doc = this.session.doc;
    const L = doc.settings.length;
    const top = v.sy(LEVEL_ROWS);
    const bottom = v.sy(0);
    const xa = Math.floor(v.wx(area.x)) - 1;
    const xb = Math.ceil(v.wx(area.x + area.w)) + 1;

    // Start zone and the area past the finish.
    ctx.fillStyle = 'rgba(16,8,48,0.35)';
    ctx.fillRect(v.sx(-20), v.sy(VIEW_TOP), (START_ZONE + 20) * s, (VIEW_TOP - VIEW_BOTTOM) * s);
    ctx.fillRect(v.sx(L), v.sy(VIEW_TOP), (MAX_LENGTH + 200) * s, (VIEW_TOP - VIEW_BOTTOM) * s);
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.sx(-20), top, (START_ZONE + 20) * s, bottom - top);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = s * 0.18;
    ctx.beginPath();
    for (let k = -30; k < START_ZONE + 10; k++) {
      ctx.moveTo(v.sx(k), bottom);
      ctx.lineTo(v.sx(k + LEVEL_ROWS), top);
    }
    ctx.stroke();
    ctx.restore();
    const skin = skinById(store.data.skins.equipped);
    drawCharacter(ctx, v.sx(LEVEL_START_X), v.sy(0.43), s * 0.86, 'square', skin, { time: this.time, alpha: 0.85, lookX: 1 });
    this.label(ctx, 'START', v.sx(START_ZONE / 2), v.sy(2.4), s * 0.55, 'rgba(255,255,255,0.8)');

    // Grid.
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.beginPath();
    for (let x = Math.max(START_ZONE, xa); x <= Math.min(L, xb); x++) {
      ctx.moveTo(v.sx(x), top);
      ctx.lineTo(v.sx(x), bottom);
    }
    const gx0 = v.sx(Math.max(START_ZONE, xa));
    const gx1 = v.sx(Math.min(L, xb));
    for (let y = 0; y <= LEVEL_ROWS; y++) {
      ctx.moveTo(gx0, v.sy(y));
      ctx.lineTo(gx1, v.sy(y));
    }
    ctx.stroke();
    // Distance labels every 10 tiles.
    for (let x = Math.ceil(xa / 10) * 10; x <= Math.min(L, xb); x += 10) {
      if (x < START_ZONE) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(v.sx(x) - dpr, top, 2 * dpr, bottom - top);
      this.label(ctx, `${x}`, v.sx(x), v.sy(-0.75), s * 0.36, 'rgba(255,255,255,0.65)');
    }
    // Finish flag label.
    this.label(ctx, 'FINISH', v.sx(L), v.sy(CEIL + 0.55), s * 0.42, '#ffffff');

    // Hover / last touch.
    const tool = this.tool;
    const showCell = (c: Cell, color: string, alpha: number) => {
      const column = tool.piece === 'portal' || tool.piece === 'pit' || tool.id === 'finish';
      ctx.strokeStyle = rgba(color, alpha);
      ctx.fillStyle = rgba(color, alpha * 0.18);
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.beginPath();
      if (column) ctx.roundRect(v.sx(c.x) + 1, v.sy(LEVEL_ROWS), s - 2, LEVEL_ROWS * s + s * 0.9, s * 0.15);
      else ctx.roundRect(v.sx(c.x) + 1, v.sy(c.y + 1) + 1, s - 2, s - 2, s * 0.15);
      ctx.fill();
      ctx.stroke();
    };
    if (this.hover && this.session.canEdit && tool.id !== 'pan') showCell(this.hover, tool.id === 'erase' ? '#ff4f5e' : '#ffffff', 0.85);
    if (this.flashCell && this.time < this.flashCell.until) {
      showCell(this.flashCell.cell, tool.id === 'erase' ? '#ff4f5e' : '#ffd23f', (this.flashCell.until - this.time) / 0.5);
    }

    // Other builders.
    const room = this.session.room;
    if (room) {
      const now = performance.now();
      for (const c of this.session.cursors.values()) {
        if (now - c.at > 6000) continue;
        const p = room.player(c.id);
        if (!p) continue;
        const col = PLAYER_COLORS[p.color % PLAYER_COLORS.length];
        const t = TOOLS[c.tool];
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(2, s * 0.1);
        ctx.setLineDash([s * 0.18, s * 0.12]);
        ctx.beginPath();
        if (t?.piece === 'portal' || t?.piece === 'pit') ctx.roundRect(v.sx(c.x) + 1, v.sy(LEVEL_ROWS), s - 2, LEVEL_ROWS * s, s * 0.15);
        else ctx.roundRect(v.sx(c.x) + 1, v.sy(c.y + 1) + 1, s - 2, s - 2, s * 0.15);
        ctx.stroke();
        ctx.setLineDash([]);
        const tagY = v.sy(Math.min(LEVEL_ROWS - 0.2, c.y + 1.15));
        this.tag(ctx, p.name.replace(/ \d+$/, ''), v.sx(c.x + 0.5), tagY, s * 0.38, col);
        // Latest quick chat bubble from this builder.
        const said = [...this.session.chat.lines].reverse().find((l) => l.from === c.id && l.kind !== 'system' && now - l.at < 4000);
        if (said) this.bubble(ctx, said.text, v.sx(c.x + 0.5), tagY - s * 0.62, s * 0.42);
      }
    }

    this.minimap(ctx, area, dpr);
  }

  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string): void {
    ctx.font = `700 ${Math.round(size)}px Fredoka, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.22);
    ctx.strokeStyle = 'rgba(16,8,48,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  private tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string): void {
    ctx.font = `700 ${Math.round(size)}px Fredoka, system-ui, sans-serif`;
    const w = ctx.measureText(text).width + size * 0.9;
    const h = size * 1.45;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#160a3c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + size * 0.05);
  }

  private bubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number): void {
    ctx.font = `700 ${Math.round(size)}px Fredoka, system-ui, sans-serif`;
    const w = Math.min(ctx.measureText(text).width + size * 1.2, size * 20);
    const h = size * 1.7;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h, w, h, size * 0.6);
    ctx.moveTo(x - size * 0.4, y);
    ctx.lineTo(x, y + size * 0.5);
    ctx.lineTo(x + size * 0.4, y);
    ctx.fill();
    ctx.fillStyle = '#160a3c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - h / 2, w - size * 0.6);
  }

  // ================================================================== minimap
  private minimapRect(area: { x: number; w: number; y: number; h: number }, dpr: number) {
    return { x: area.x + 8 * dpr, y: area.y + area.h + 4 * dpr, w: area.w - 16 * dpr, h: (MINIMAP_H - 8) * dpr };
  }

  private minimap(ctx: CanvasRenderingContext2D, area: { x: number; y: number; w: number; h: number }, dpr: number): void {
    const doc = this.session.doc;
    const L = doc.settings.length;
    const r = this.minimapRect(area, dpr);
    ctx.fillStyle = 'rgba(16,8,48,0.75)';
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
    ctx.fill();
    const span = L + 12;
    const mx = (x: number) => r.x + ((x + 3) / span) * r.w;
    const rowH = r.h / (LEVEL_ROWS + 2);
    for (const p of doc.pieces()) {
      ctx.fillStyle = MINI_COLORS[p.t];
      if (p.t === 'portal' || p.t === 'pit') ctx.fillRect(mx(p.x), r.y + rowH * 0.5, Math.max(dpr, r.w / span), r.h - rowH);
      else ctx.fillRect(mx(p.x), r.y + r.h - rowH * (p.y + 2), Math.max(dpr, r.w / span), rowH);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mx(L) - dpr, r.y, 2 * dpr, r.h);
    const v = this.view;
    if (v) {
      const x0 = mx(this.session.camX);
      const x1 = mx(this.session.camX + area.w / v.scale);
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.roundRect(x0, r.y - dpr, Math.max(6 * dpr, x1 - x0), r.h + 2 * dpr, 3 * dpr);
      ctx.stroke();
    }
  }

  private minimapHit(clientY: number): boolean {
    if (!this.renderer) return false;
    const dpr = this.renderer.dpr;
    const py = this.localY(clientY) * dpr;
    const areaBottom = this.renderer.height - (this.insets.bottom + MINIMAP_H) * dpr;
    return py >= areaBottom && py <= this.renderer.height - this.insets.bottom * dpr;
  }

  private scrollMinimap(clientX: number): void {
    if (!this.renderer || !this.view) return;
    const dpr = this.renderer.dpr;
    const area = { x: this.insets.left * dpr, w: this.renderer.width - (this.insets.left + this.insets.right) * dpr, y: 0, h: 0 };
    const r = this.minimapRect(area, dpr);
    const span = this.session.doc.settings.length + 12;
    const wx = ((this.localX(clientX) * dpr - r.x) / r.w) * span - 3;
    const visible = area.w / this.view.scale;
    this.session.camX = wx - visible / 2;
  }

  // ================================================================== input
  private localX(clientX: number): number {
    return clientX - this.canvas.getBoundingClientRect().left;
  }

  private localY(clientY: number): number {
    return clientY - this.canvas.getBoundingClientRect().top;
  }

  private cellAt(clientX: number, clientY: number): Cell | null {
    const v = this.view;
    const r = this.renderer;
    if (!v || !r) return null;
    const x = Math.floor(v.wx(this.localX(clientX) * r.dpr));
    const y = Math.floor(v.wy(this.localY(clientY) * r.dpr));
    return { x, y };
  }

  private down = (e: PointerEvent): void => {
    e.preventDefault();
    audio.unlock();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size >= 2) {
      // Second finger: switch to panning.
      this.stroke = null;
      const ids = [...this.pointers.keys()];
      this.pan = { x: this.avgX(), camX: this.session.camX, ids };
      return;
    }
    if (this.minimapHit(e.clientY)) {
      this.minimapDrag = e.pointerId;
      this.scrollMinimap(e.clientX);
      return;
    }
    if (this.tool.id === 'pan' || e.button === 1 || e.button === 2) {
      this.pan = { x: e.clientX, camX: this.session.camX, ids: [e.pointerId] };
      return;
    }
    if (!this.session.canEdit) {
      this.notice('locked', 'The host paused building for now.');
      return;
    }
    this.stroke = { pointer: e.pointerId, last: null, mode: 'paint', first: true, client: { x: e.clientX, y: e.clientY } };
    this.strokeTo(e.clientX, e.clientY);
  };

  private move = (e: PointerEvent): void => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.minimapDrag === e.pointerId) {
      this.scrollMinimap(e.clientX);
      return;
    }
    if (this.pan && this.pan.ids.includes(e.pointerId) && this.view && this.renderer) {
      const x = this.pan.ids.length > 1 ? this.avgX() : e.clientX;
      this.session.camX = this.pan.camX - ((x - this.pan.x) * this.renderer.dpr) / this.view.scale;
      return;
    }
    const st = this.stroke;
    if (st && st.pointer === e.pointerId) {
      st.client = { x: e.clientX, y: e.clientY };
      this.strokeTo(e.clientX, e.clientY);
      return;
    }
    if (e.pointerType === 'mouse' && e.target === this.canvas) {
      const c = this.cellAt(e.clientX, e.clientY);
      this.hover = c && this.validCell(c) ? c : null;
      if (this.hover) this.session.sendCursor(this.hover.x, this.hover.y, toolIndex(this.session.tool));
    }
  };

  private up = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.minimapDrag === e.pointerId) this.minimapDrag = null;
    if (this.stroke?.pointer === e.pointerId) this.stroke = null;
    if (this.pan && this.pan.ids.includes(e.pointerId)) this.pan = null;
  };

  private wheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (!this.view || !this.renderer) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    this.session.camX += (d * this.renderer.dpr) / this.view.scale;
  };

  private key = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.session.redo();
      else this.session.undo();
      this.hooks.changed();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.session.redo();
      this.hooks.changed();
    } else if (e.key === 'ArrowRight') {
      this.session.camX += 4;
    } else if (e.key === 'ArrowLeft') {
      this.session.camX -= 4;
    }
  };

  private avgX(): number {
    let sum = 0;
    for (const p of this.pointers.values()) sum += p.x;
    return sum / Math.max(1, this.pointers.size);
  }

  private notice(key: string, text: string): void {
    const now = performance.now();
    if ((this.noticeAt.get(key) ?? 0) > now) return;
    this.noticeAt.set(key, now + 2500);
    this.hooks.notice(text);
  }

  private validCell(c: Cell): boolean {
    const t = this.tool;
    const column = t.piece === 'portal' || t.piece === 'pit' || t.id === 'finish';
    if (!column && (c.y < 0 || c.y >= LEVEL_ROWS)) return false;
    if (t.id === 'finish') return c.x >= MIN_LENGTH && c.x <= MAX_LENGTH;
    return c.x >= START_ZONE && c.x < this.session.doc.settings.length;
  }

  /** Continue the current stroke to a pointer position (fills skipped cells). */
  private strokeTo(clientX: number, clientY: number): void {
    const st = this.stroke;
    const c = this.cellAt(clientX, clientY);
    if (!st || !c) return;
    const last = st.last;
    if (last && last.x === c.x && last.y === c.y) return;
    const cells: Cell[] = [];
    if (last) {
      const n = Math.max(Math.abs(c.x - last.x), Math.abs(c.y - last.y));
      for (let i = 1; i <= n; i++) cells.push({ x: Math.round(last.x + ((c.x - last.x) * i) / n), y: Math.round(last.y + ((c.y - last.y) * i) / n) });
    } else cells.push(c);
    st.last = c;
    const ops: EditOp[] = [];
    for (const cell of cells) this.applyAt(cell, st, ops);
    if (ops.length) {
      const merge = !st.first;
      const changes = this.session.commit(ops, merge);
      if (changes.length) {
        st.first = false;
        audio.play(st.mode === 'erase' ? 'land' : 'gem');
        this.hooks.changed();
      }
    }
    this.hover = this.validCell(c) ? c : null;
    if (this.hover) {
      this.flashCell = { cell: this.hover, until: this.time + 0.5 };
      this.session.sendCursor(c.x, c.y, toolIndex(this.session.tool));
    }
  }

  private applyAt(cell: Cell, st: NonNullable<EditorScene['stroke']>, ops: EditOp[]): void {
    const tool = this.tool;
    const doc = this.session.doc;
    const L = doc.settings.length;
    const isFirst = st.first && ops.length === 0;
    if (tool.id === 'finish') {
      if (!isFirst) return;
      const length = Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, cell.x));
      if (length === L) return;
      const lost = doc.pieces().filter((p) => p.x >= length).length;
      ops.push({ set: { length } });
      if (lost) this.notice('cut', `Moved the finish: ${lost} piece${lost > 1 ? 's' : ''} past it removed (Undo brings them back).`);
      st.mode = 'none';
      return;
    }
    if (cell.x < START_ZONE) {
      this.notice('start', 'Keep the start clear so everyone can get going!');
      return;
    }
    if (cell.x >= L) {
      this.notice('end', 'That’s past the finish line. Use the Finish tool to make the level longer.');
      return;
    }
    if (tool.id === 'erase') {
      st.mode = 'erase';
      if (cell.y >= 0 && cell.y < LEVEL_ROWS) {
        const s = slotOf({ t: 'block', x: cell.x, y: cell.y });
        if (doc.get(s)) return void ops.push({ s, p: null });
      }
      if (isFirst || cell.y < 0 || cell.y >= LEVEL_ROWS) {
        // Tapping an empty cell (or the floor) erases the column's portal or pit.
        const portal = slotOf({ t: 'portal', x: cell.x, y: 0 });
        const pit = slotOf({ t: 'pit', x: cell.x, y: 0 });
        if (doc.get(portal)) ops.push({ s: portal, p: null });
        else if (doc.get(pit)) ops.push({ s: pit, p: null });
      }
      return;
    }
    const column = tool.piece === 'portal' || tool.piece === 'pit';
    if (!column && (cell.y < 0 || cell.y >= LEVEL_ROWS)) return;
    const variant = tool.piece === 'portal' ? (tool.v ?? 0) : (this.session.variants[tool.id] ?? 0);
    const piece = pieceFor(tool, cell.x, Math.max(0, cell.y), variant);
    if (!piece) return;
    const s = slotOf(piece);
    const existing = doc.get(s);
    if (isFirst && existing && existing.t === piece.t) {
      if (column) {
        // Same portal / pit again: toggle it off (and keep erasing while dragging).
        if (piece.t === 'pit' || existing.v === piece.v) {
          st.mode = 'erase';
          return void ops.push({ s, p: null });
        }
      } else if (VARIANTS[piece.t] > 1) {
        const v = nextVariant(existing);
        this.session.variants[tool.id] = v;
        st.mode = 'none';
        return void ops.push({ s, p: { ...existing, v } });
      } else {
        st.mode = 'none';
        return;
      }
    }
    if (st.mode === 'none') return;
    if (st.mode === 'erase') {
      if (existing && existing.t === piece.t) ops.push({ s, p: null });
      return;
    }
    if (!existing || existing.t !== piece.t || existing.v !== piece.v) ops.push({ s, p: piece as Piece });
  }
}

const MINI_COLORS: Record<Piece['t'], string> = {
  block: '#c9b8ff',
  platform: '#a58cff',
  spike: '#ff4f6d',
  saw: '#ff7a3d',
  gem: '#3ad7ff',
  pad: '#ffd23f',
  orb: '#ffe066',
  portal: '#3ee6b0',
  pickup: '#ff9ad5',
  pit: '#0b0520',
};
