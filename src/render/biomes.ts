/** The six worlds of Polygon Rush. Endless cycles through them every 500 m. */
export interface Palette {
  name: string;
  skyTop: string;
  skyBottom: string;
  far: string;
  mid: string;
  ground: string;
  groundDark: string;
  groundEdge: string;
  groundTile: string;
  block: string;
  blockDark: string;
  blockEdge: string;
  hazard: string;
  hazardDark: string;
  hazardEdge: string;
  accent: string;
  /** 0..1 how many stars to draw. */
  stars: number;
}

export const BIOMES: Palette[] = [
  {
    name: 'Bubblegum Bay',
    skyTop: '#ff9ad5',
    skyBottom: '#7b4fd8',
    far: '#ffe0f5',
    mid: '#d061c9',
    ground: '#5b2a9c',
    groundDark: '#32125f',
    groundEdge: '#ffc2ec',
    groundTile: '#6c35b4',
    block: '#9356e8',
    blockDark: '#5b2a9c',
    blockEdge: '#ffe0f8',
    hazard: '#ff3d7f',
    hazardDark: '#a5124b',
    hazardEdge: '#ffffff',
    accent: '#ffd23f',
    stars: 0,
  },
  {
    name: 'Mint Meadow',
    skyTop: '#b5f7de',
    skyBottom: '#2a9f93',
    far: '#ecfff7',
    mid: '#4cc9a3',
    ground: '#1b6a5b',
    groundDark: '#0d4239',
    groundEdge: '#c7ffe9',
    groundTile: '#237e6c',
    block: '#30bf98',
    blockDark: '#1b6a5b',
    blockEdge: '#eafff7',
    hazard: '#ff5f4f',
    hazardDark: '#b02718',
    hazardEdge: '#ffffff',
    accent: '#ffe066',
    stars: 0,
  },
  {
    name: 'Sunset Circuit',
    skyTop: '#ffb347',
    skyBottom: '#8e2de2',
    far: '#ffe2b0',
    mid: '#e0548f',
    ground: '#3d1d5c',
    groundDark: '#220e38',
    groundEdge: '#ffd27a',
    groundTile: '#4b2470',
    block: '#c94381',
    blockDark: '#7d1f52',
    blockEdge: '#ffe0bd',
    hazard: '#ff2e63',
    hazardDark: '#8c0030',
    hazardEdge: '#fff3d6',
    accent: '#ffd23f',
    stars: 0.25,
  },
  {
    name: 'Ocean Prism',
    skyTop: '#86eaff',
    skyBottom: '#1f4fd1',
    far: '#d6f8ff',
    mid: '#3fa9ef',
    ground: '#143b8c',
    groundDark: '#0a245c',
    groundEdge: '#a8f3ff',
    groundTile: '#1a4aa3',
    block: '#3184ff',
    blockDark: '#143b8c',
    blockEdge: '#d9f8ff',
    hazard: '#ff5a87',
    hazardDark: '#a6164a',
    hazardEdge: '#ffffff',
    accent: '#fff27a',
    stars: 0,
  },
  {
    name: 'Candy Cosmos',
    skyTop: '#2b1257',
    skyBottom: '#0a0420',
    far: '#7a4fe6',
    mid: '#9b3fd6',
    ground: '#2a1460',
    groundDark: '#140834',
    groundEdge: '#ff8af2',
    groundTile: '#361a78',
    block: '#5f2fcf',
    blockDark: '#2a1460',
    blockEdge: '#ffc2f8',
    hazard: '#ff4f9a',
    hazardDark: '#9a0f52',
    hazardEdge: '#ffffff',
    accent: '#7ff9ff',
    stars: 1,
  },
  {
    name: 'Lemon Lab',
    skyTop: '#fff7b0',
    skyBottom: '#56c24c',
    far: '#fffce6',
    mid: '#a8dc4a',
    ground: '#2e6a1f',
    groundDark: '#1a4512',
    groundEdge: '#fbffc2',
    groundTile: '#3a7f26',
    block: '#7bcf3a',
    blockDark: '#3f8a24',
    blockEdge: '#fdffe0',
    hazard: '#ff6a3a',
    hazardDark: '#a93810',
    hazardEdge: '#ffffff',
    accent: '#ff7af0',
    stars: 0,
  },
];

export const BIOME_LENGTH = 500;

type RGB = [number, number, number];
const cache = new Map<string, RGB>();

export function hexToRgb(hex: string): RGB {
  let c = cache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    cache.set(hex, c);
  }
  return c;
}

export function mix(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const r = Math.round(x[0] + (y[0] - x[0]) * t);
  const g = Math.round(x[1] + (y[1] - x[1]) * t);
  const bb = Math.round(x[2] + (y[2] - x[2]) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bb).toString(16).slice(1)}`;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function lighten(hex: string, t: number): string {
  return mix(hex, '#ffffff', t);
}

export function darken(hex: string, t: number): string {
  return mix(hex, '#000000', t);
}

/** Palette blended between two worlds. */
export function blendPalette(a: Palette, b: Palette, t: number): Palette {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = { ...a } as Palette;
  for (const k of Object.keys(a) as (keyof Palette)[]) {
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'string' && typeof vb === 'string' && va.startsWith('#')) (out[k] as string) = mix(va, vb, t);
    else if (typeof va === 'number' && typeof vb === 'number') (out[k] as number) = va + (vb - va) * t;
  }
  out.name = t < 0.5 ? a.name : b.name;
  return out;
}

/** World index at a track position (endless) — transitions over the last 40 m. */
export function paletteAt(x: number, offset = 0): { palette: Palette; index: number } {
  const span = BIOME_LENGTH;
  const i = Math.floor(x / span);
  const local = x - i * span;
  const a = BIOMES[(i + offset) % BIOMES.length];
  const b = BIOMES[(i + 1 + offset) % BIOMES.length];
  const t = local > span - 40 ? (local - (span - 40)) / 40 : 0;
  return { palette: blendPalette(a, b, t), index: (i + offset) % BIOMES.length };
}
