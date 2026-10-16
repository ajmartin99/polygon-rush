/**
 * Cosmetic catalog. Skins decorate the player polygon in every shape mode;
 * trails are particle effects left behind while rushing.
 * Purely cosmetic — nothing here changes gameplay (fair for everyone).
 */
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Pattern =
  | 'solid'
  | 'stripes'
  | 'dots'
  | 'checker'
  | 'gradient'
  | 'split'
  | 'scales'
  | 'rainbow'
  | 'galaxy'
  | 'gold'
  | 'neon'
  | 'ice'
  | 'lava'
  | 'pumpkin'
  | 'wisp'
  | 'bandage'
  | 'cape'
  | 'bones'
  | 'rip'
  | 'cornstripe';
export type Face = 'cute' | 'happy' | 'cool' | 'cat' | 'robot' | 'star' | 'sleepy' | 'wink' | 'dino' | 'jack' | 'ghost' | 'mummy' | 'vampire' | 'skull';
/** Something worn on top (drawn behind the body outline). */
export type Topper = 'stem' | 'witch' | 'bat';
/** A different body outline (cosmetic only: the hitbox never changes). */
export type Silhouette = 'ghost' | 'pumpkin' | 'tombstone' | 'skull' | 'candycorn';

export type Unlock =
  | { kind: 'free' }
  | { kind: 'gems'; price: number }
  | { kind: 'level'; level: number }
  | { kind: 'daily' }
  | { kind: 'starter' }
  | { kind: 'legend' }
  /** Seasonal: buyable (or the free gift) only while the event is on; owned forever. */
  | { kind: 'event'; event: 'halloween'; price: number };

export interface SkinDef {
  id: string;
  name: string;
  rarity: Rarity;
  unlock: Unlock;
  /** Main body colour. */
  body: string;
  /** Secondary colour used by patterns / gradients. */
  accent: string;
  /** Outline colour. */
  outline: string;
  pattern: Pattern;
  face: Face;
  topper?: Topper;
  silhouette?: Silhouette;
}

export interface TrailDef {
  id: string;
  name: string;
  rarity: Rarity;
  unlock: Unlock;
  colors: string[];
  style: 'none' | 'lines' | 'sparkle' | 'bubbles' | 'hearts' | 'stars' | 'notes' | 'pixels' | 'rainbow' | 'comet' | 'confetti' | 'bats' | 'candycorn' | 'mist';
}

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9fb4ff',
  rare: '#3ee6b0',
  epic: '#c27bff',
  legendary: '#ffd23f',
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

const gems = (price: number): Unlock => ({ kind: 'gems', price });
const spooky = (price: number): Unlock => ({ kind: 'event', event: 'halloween', price });

export const SKINS: SkinDef[] = [
  { id: 'classic', name: 'Classic', rarity: 'common', unlock: { kind: 'free' }, body: '#ffd23f', accent: '#ff9f1c', outline: '#3b2a00', pattern: 'solid', face: 'cute' },
  { id: 'mint', name: 'Minty', rarity: 'common', unlock: { kind: 'level', level: 3 }, body: '#3ee6b0', accent: '#16b98a', outline: '#063d2e', pattern: 'solid', face: 'happy' },
  { id: 'bubblegum', name: 'Bubblegum', rarity: 'common', unlock: gems(300), body: '#ff7ac6', accent: '#ff4fa3', outline: '#4a0b2c', pattern: 'solid', face: 'cute' },
  { id: 'sky', name: 'Sky Blue', rarity: 'common', unlock: { kind: 'level', level: 6 }, body: '#4dc9ff', accent: '#1e94d6', outline: '#06304a', pattern: 'solid', face: 'wink' },
  { id: 'tangerine', name: 'Tangerine', rarity: 'common', unlock: gems(300), body: '#ff8a3d', accent: '#e8611a', outline: '#4a1d00', pattern: 'solid', face: 'happy' },
  { id: 'grape', name: 'Grape', rarity: 'common', unlock: gems(300), body: '#9b6bff', accent: '#6d3bea', outline: '#1d0b4a', pattern: 'solid', face: 'sleepy' },
  { id: 'candy', name: 'Candy Stripe', rarity: 'rare', unlock: gems(800), body: '#ffffff', accent: '#ff4f7b', outline: '#5a0a22', pattern: 'stripes', face: 'cute' },
  { id: 'polka', name: 'Polka Dots', rarity: 'rare', unlock: gems(800), body: '#ff5f5f', accent: '#ffffff', outline: '#4a0b0b', pattern: 'dots', face: 'happy' },
  { id: 'checkers', name: 'Checkers', rarity: 'rare', unlock: gems(800), body: '#ffffff', accent: '#2b2b3d', outline: '#101018', pattern: 'checker', face: 'cool' },
  { id: 'kitty', name: 'Kitty', rarity: 'rare', unlock: { kind: 'level', level: 10 }, body: '#ffb35c', accent: '#ff8a1f', outline: '#4a2600', pattern: 'stripes', face: 'cat' },
  { id: 'shades', name: 'Shades', rarity: 'rare', unlock: gems(900), body: '#2ad4c4', accent: '#0f9e92', outline: '#003c37', pattern: 'solid', face: 'cool' },
  { id: 'melon', name: 'Watermelon', rarity: 'rare', unlock: gems(900), body: '#ff6b81', accent: '#3fbf5f', outline: '#14401f', pattern: 'split', face: 'wink' },
  { id: 'robo', name: 'Robo', rarity: 'epic', unlock: gems(1600), body: '#c9d3e6', accent: '#7d8aa8', outline: '#1d2333', pattern: 'checker', face: 'robot' },
  { id: 'sunset', name: 'Sunset', rarity: 'epic', unlock: gems(1600), body: '#ffcf4a', accent: '#ff4f9a', outline: '#4a0b30', pattern: 'gradient', face: 'happy' },
  { id: 'ocean', name: 'Deep Ocean', rarity: 'epic', unlock: gems(1600), body: '#42e8ff', accent: '#2a5bff', outline: '#061a4a', pattern: 'gradient', face: 'cute' },
  { id: 'dino', name: 'Dino', rarity: 'epic', unlock: { kind: 'level', level: 15 }, body: '#7ed957', accent: '#4caf3a', outline: '#173d0f', pattern: 'scales', face: 'dino' },
  { id: 'lucky', name: 'Lucky Clover', rarity: 'epic', unlock: { kind: 'daily' }, body: '#5be37d', accent: '#ffd23f', outline: '#0f4020', pattern: 'dots', face: 'star' },
  { id: 'frosty', name: 'Frosty', rarity: 'epic', unlock: gems(2000), body: '#dff6ff', accent: '#8fd8ff', outline: '#21506b', pattern: 'ice', face: 'sleepy' },
  { id: 'rainbow', name: 'Rainbow', rarity: 'legendary', unlock: { kind: 'legend' }, body: '#ff5f5f', accent: '#5f8bff', outline: '#22104a', pattern: 'rainbow', face: 'star' },
  { id: 'galaxy', name: 'Galaxy', rarity: 'legendary', unlock: { kind: 'legend' }, body: '#2a1b6b', accent: '#ff7af0', outline: '#0b0626', pattern: 'galaxy', face: 'cute' },
  { id: 'neon', name: 'Neon Glow', rarity: 'legendary', unlock: gems(3500), body: '#18122e', accent: '#39ffe1', outline: '#39ffe1', pattern: 'neon', face: 'cool' },
  { id: 'magma', name: 'Magma', rarity: 'legendary', unlock: { kind: 'legend' }, body: '#ff6a2b', accent: '#ffd23f', outline: '#3d0a00', pattern: 'lava', face: 'happy' },
  { id: 'golden', name: 'Golden', rarity: 'legendary', unlock: { kind: 'starter' }, body: '#ffd84a', accent: '#ffb300', outline: '#5a3b00', pattern: 'gold', face: 'cool' },
  // Halloween (Spooky Season)
  { id: 'witch', name: 'Wicked Witch', rarity: 'epic', unlock: spooky(0), body: '#7b3fd1', accent: '#3ee6b0', outline: '#1d0b4a', pattern: 'dots', face: 'wink', topper: 'witch' },
  { id: 'boo', name: 'Boo', rarity: 'rare', unlock: spooky(700), body: '#f4f1ff', accent: '#c9c2ff', outline: '#3a3260', pattern: 'wisp', face: 'ghost' },
  { id: 'mummy', name: 'Mummy', rarity: 'rare', unlock: spooky(900), body: '#efe3c2', accent: '#c8b48a', outline: '#4a3b1c', pattern: 'bandage', face: 'mummy' },
  { id: 'jack', name: 'Jack-o’-Lantern', rarity: 'epic', unlock: spooky(1200), body: '#ff8a1f', accent: '#d95f00', outline: '#4a1d00', pattern: 'pumpkin', face: 'jack', topper: 'stem' },
  { id: 'vampire', name: 'Count Polygon', rarity: 'epic', unlock: spooky(1500), body: '#2e1438', accent: '#c4183a', outline: '#0e0410', pattern: 'cape', face: 'vampire', topper: 'bat' },
  // Halloween body shapes (same hitbox, new outline)
  { id: 'phantom', name: 'Phantom', rarity: 'epic', unlock: spooky(1800), body: '#f1f0ff', accent: '#b9b4ff', outline: '#3a3260', pattern: 'wisp', face: 'ghost', silhouette: 'ghost' },
  { id: 'patch', name: 'Pumpkin Patch', rarity: 'epic', unlock: spooky(2000), body: '#ff8a1f', accent: '#d95f00', outline: '#4a1d00', pattern: 'pumpkin', face: 'jack', topper: 'stem', silhouette: 'pumpkin' },
  { id: 'grave', name: 'Tombstone', rarity: 'epic', unlock: spooky(1500), body: '#a3a9bd', accent: '#6c7288', outline: '#2a2d3a', pattern: 'rip', face: 'sleepy', silhouette: 'tombstone' },
  { id: 'skullhead', name: 'Bone Head', rarity: 'legendary', unlock: spooky(2400), body: '#f2f0e6', accent: '#c9c4b0', outline: '#1c1a26', pattern: 'solid', face: 'skull', silhouette: 'skull' },
  { id: 'cornkid', name: 'Candy Corn Kid', rarity: 'rare', unlock: spooky(1200), body: '#ffffff', accent: '#ff8a1f', outline: '#5a2a00', pattern: 'cornstripe', face: 'happy', silhouette: 'candycorn' },
  { id: 'bones', name: 'Rattle Bones', rarity: 'legendary', unlock: spooky(2500), body: '#1c1a26', accent: '#f2f0e6', outline: '#000000', pattern: 'bones', face: 'skull' },
];

export const TRAILS: TrailDef[] = [
  { id: 'none', name: 'No Trail', rarity: 'common', unlock: { kind: 'free' }, colors: [], style: 'none' },
  { id: 'lines', name: 'Speed Lines', rarity: 'common', unlock: gems(200), colors: ['#ffffff'], style: 'lines' },
  { id: 'sparkle', name: 'Sparkles', rarity: 'rare', unlock: gems(500), colors: ['#fff6a8', '#ffffff', '#ffd23f'], style: 'sparkle' },
  { id: 'bubbles', name: 'Bubbles', rarity: 'rare', unlock: gems(500), colors: ['#a8ecff', '#ffffff'], style: 'bubbles' },
  { id: 'hearts', name: 'Hearts', rarity: 'rare', unlock: gems(600), colors: ['#ff5f8f', '#ff9fc0'], style: 'hearts' },
  { id: 'pixels', name: 'Pixels', rarity: 'epic', unlock: gems(1000), colors: ['#3ee6b0', '#4dc9ff', '#9b6bff'], style: 'pixels' },
  { id: 'stars', name: 'Stars', rarity: 'epic', unlock: gems(1000), colors: ['#ffd23f', '#ffffff'], style: 'stars' },
  { id: 'notes', name: 'Music Notes', rarity: 'epic', unlock: { kind: 'level', level: 8 }, colors: ['#ffffff', '#ff7ac6', '#4dc9ff'], style: 'notes' },
  { id: 'confetti', name: 'Confetti', rarity: 'epic', unlock: { kind: 'daily' }, colors: ['#ff5f5f', '#ffd23f', '#3ee6b0', '#4dc9ff', '#c27bff'], style: 'confetti' },
  { id: 'rainbow', name: 'Rainbow Road', rarity: 'legendary', unlock: { kind: 'legend' }, colors: ['#ff5f5f', '#ff9f1c', '#ffd23f', '#3ee6b0', '#4dc9ff', '#9b6bff'], style: 'rainbow' },
  { id: 'comet', name: 'Comet', rarity: 'legendary', unlock: { kind: 'legend' }, colors: ['#ffffff', '#8fe9ff', '#5f8bff'], style: 'comet' },
  // Halloween (Spooky Season)
  { id: 'candycorn', name: 'Candy Corn', rarity: 'rare', unlock: spooky(500), colors: ['#ffd23f', '#ff8a1f', '#ffffff'], style: 'candycorn' },
  { id: 'bats', name: 'Bat Swarm', rarity: 'epic', unlock: spooky(1000), colors: ['#1c1030', '#3a1f5a'], style: 'bats' },
  { id: 'mist', name: 'Ghostly Mist', rarity: 'epic', unlock: spooky(1000), colors: ['#c9ffd9', '#b9a8ff', '#ffffff'], style: 'mist' },
];

export const skinById = (id: string): SkinDef => SKINS.find((s) => s.id === id) ?? SKINS[0];
export const trailById = (id: string): TrailDef => TRAILS.find((t) => t.id === id) ?? TRAILS[0];

export function unlockLabel(u: Unlock): string {
  switch (u.kind) {
    case 'free':
      return 'Free';
    case 'gems':
      return String(u.price);
    case 'level':
      return `Reach level ${u.level}`;
    case 'daily':
      return '7-day gift';
    case 'starter':
      return 'Starter Pack';
    case 'legend':
      return 'Legend Pack';
    case 'event':
      return u.price ? `🎃 ${u.price}` : '🎃 Free gift';
  }
}

/** Items included in the Legend Pack IAP. */
export const LEGEND_PACK_SKINS = SKINS.filter((s) => s.unlock.kind === 'legend').map((s) => s.id);
export const LEGEND_PACK_TRAILS = TRAILS.filter((t) => t.unlock.kind === 'legend').map((t) => t.id);
