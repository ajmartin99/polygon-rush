/** The four shape modes. Each polygon plays differently. */
export type ShapeMode = 'square' | 'triangle' | 'hexagon' | 'diamond';

export const SHAPE_INFO: Record<ShapeMode, { name: string; verb: string; hint: string; sub: string; color: string }> = {
  square: { name: 'Jumper', verb: 'Jump', hint: 'TAP to jump!', sub: 'Hold to keep bouncing · swipe down to drop', color: '#ffd23f' },
  triangle: { name: 'Glider', verb: 'Fly', hint: 'HOLD to fly up!', sub: 'Let go to glide · swipe down to dive', color: '#ff5fa2' },
  hexagon: { name: 'Roller', verb: 'Flip', hint: 'TAP to flip gravity!', sub: 'Flip any time, even mid-air', color: '#3ee6b0' },
  diamond: { name: 'Hopper', verb: 'Hop', hint: 'TAP to hop!', sub: 'Tap to stay up · swipe down to drop', color: '#3ad7ff' },
};

/** Unit polygon (radius ~0.5) for each shape, pointing right / up. */
export function shapePoints(shape: ShapeMode): [number, number][] {
  switch (shape) {
    case 'square':
      return [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ];
    case 'triangle':
      return [
        [0.62, 0],
        [-0.48, -0.52],
        [-0.48, 0.52],
      ];
    case 'hexagon': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        pts.push([Math.cos(a) * 0.56, Math.sin(a) * 0.56]);
      }
      return pts;
    }
    case 'diamond':
      return [
        [0, -0.6],
        [0.6, 0],
        [0, 0.6],
        [-0.6, 0],
      ];
  }
}
