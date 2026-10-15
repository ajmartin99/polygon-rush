import { VARIANTS, type Piece, type PieceType } from '../game/level';

export type ToolId =
  | 'block'
  | 'platform'
  | 'spike'
  | 'saw'
  | 'gem'
  | 'pad'
  | 'orb'
  | 'pickup'
  | 'jumper'
  | 'glider'
  | 'roller'
  | 'hopper'
  | 'pit'
  | 'finish'
  | 'erase'
  | 'pan';

export interface Tool {
  id: ToolId;
  label: string;
  /** Shown when the tool is picked. */
  hint: string;
  piece?: PieceType;
  /** Portal mode index / fixed variant. */
  v?: number;
}

/** Palette order. Indexes are sent as cursor "tool" in co-op rooms. */
export const TOOLS: Tool[] = [
  { id: 'block', label: 'Block', hint: 'Drag to paint blocks. Run on top, don’t bump the sides!', piece: 'block' },
  { id: 'spike', label: 'Spike', hint: 'Tap a spike again to flip it upside down.', piece: 'spike' },
  { id: 'gem', label: 'Gem', hint: 'Tap a gem again to make it a big gem.', piece: 'gem' },
  { id: 'platform', label: 'Ledge', hint: 'Thin floating ledges to land on.', piece: 'platform' },
  { id: 'saw', label: 'Saw', hint: 'Tap a saw again to make it huge.', piece: 'saw' },
  { id: 'pad', label: 'Pad', hint: 'Bounce pads launch you high. Tap again to flip.', piece: 'pad' },
  { id: 'orb', label: 'Orb', hint: 'Tap in mid-air while touching an orb to jump again.', piece: 'orb' },
  { id: 'pickup', label: 'Power', hint: 'Heart, shield or magnet. Tap again to switch.', piece: 'pickup' },
  { id: 'jumper', label: 'Jumper', hint: 'Portal: become the Jumper (square).', piece: 'portal', v: 0 },
  { id: 'glider', label: 'Glider', hint: 'Portal: become the Glider. A roof appears automatically.', piece: 'portal', v: 1 },
  { id: 'roller', label: 'Roller', hint: 'Portal: become the Roller (tap flips gravity).', piece: 'portal', v: 2 },
  { id: 'hopper', label: 'Hopper', hint: 'Portal: become the Hopper (little hops).', piece: 'portal', v: 3 },
  { id: 'pit', label: 'Pit', hint: 'Tap a column to dig a hole in the floor. Tap again to fill it.', piece: 'pit' },
  { id: 'finish', label: 'Finish', hint: 'Tap where the finish line should go.' },
  { id: 'erase', label: 'Eraser', hint: 'Drag to erase.' },
  { id: 'pan', label: 'Move', hint: 'Drag to look around. (Two fingers work with any tool.)' },
];

export function toolIndex(id: ToolId): number {
  return TOOLS.findIndex((t) => t.id === id);
}

/** The piece a placing tool puts at a cell (null for non-placing tools). */
export function pieceFor(tool: Tool, x: number, y: number, v = tool.v ?? 0): Piece | null {
  if (!tool.piece) return null;
  if (tool.piece === 'pit' || tool.piece === 'portal') return { t: tool.piece, x, y: 0, v };
  return { t: tool.piece, x, y, v };
}

/** Next variant when tapping an existing piece of the same kind. */
export function nextVariant(p: Piece): number {
  return (p.v + 1) % VARIANTS[p.t];
}
