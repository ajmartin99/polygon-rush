/**
 * Kid-safe racer names. Players pick from generated names only — there is no
 * free-text entry anywhere in the game, so no personal info can be shared.
 */
const ADJECTIVES = [
  'Speedy', 'Happy', 'Zippy', 'Bouncy', 'Sparkly', 'Turbo', 'Cosmic', 'Jolly', 'Mighty', 'Sunny',
  'Rocket', 'Neon', 'Fuzzy', 'Lucky', 'Swift', 'Brave', 'Cheery', 'Dizzy', 'Snappy', 'Pixel',
  'Giggly', 'Super', 'Hyper', 'Jumpy', 'Breezy', 'Wobbly', 'Shiny', 'Groovy', 'Comet', 'Frosty',
  'Zoomy', 'Peppy', 'Mega', 'Ultra', 'Nimble', 'Plucky', 'Bubbly', 'Starry', 'Wiggly', 'Dashing',
];

const NOUNS = [
  'Square', 'Hexagon', 'Triangle', 'Diamond', 'Pentagon', 'Octagon', 'Prism', 'Cube', 'Comet', 'Rocket',
  'Panda', 'Otter', 'Fox', 'Koala', 'Penguin', 'Dragon', 'Unicorn', 'Tiger', 'Bunny', 'Turtle',
  'Falcon', 'Dolphin', 'Robot', 'Wizard', 'Ninja', 'Pirate', 'Comet', 'Meteor', 'Pickle', 'Muffin',
  'Waffle', 'Noodle', 'Taco', 'Donut', 'Llama', 'Gecko', 'Hamster', 'Puffin', 'Narwhal', 'Yeti',
];

export function randomName(rand: () => number = Math.random): string {
  const a = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)];
  let n = NOUNS[Math.floor(rand() * NOUNS.length)];
  if (n === a) n = 'Polygon';
  const num = 1 + Math.floor(rand() * 99);
  return `${a} ${n} ${num}`;
}

/** Racer names pack into 3 bytes (adjective, noun, number) for level codes. */
export function encodeName(name: string): [number, number, number] | null {
  const m = /^([A-Za-z]+) ([A-Za-z]+) (\d{1,2})$/.exec(name);
  if (!m) return null;
  const a = ADJECTIVES.indexOf(m[1]);
  const n = m[2] === 'Polygon' ? 255 : NOUNS.indexOf(m[2]);
  const num = Number(m[3]);
  if (a < 0 || n < 0 || num < 1 || num > 99) return null;
  return [a, n, num];
}

export function decodeName(b: [number, number, number]): string | null {
  const a = ADJECTIVES[b[0]];
  const n = b[1] === 255 ? 'Polygon' : NOUNS[b[1]];
  if (!a || !n || b[2] < 1 || b[2] > 99) return null;
  return `${a} ${n} ${b[2]}`;
}

/** True for names this game generates (the only names allowed online). */
export function isGeneratedName(name: string): boolean {
  return typeof name === 'string' && encodeName(name) !== null;
}

/** Friendly CPU rival names (clearly labelled "CPU" in the UI). */
export const CPU_NAMES = [
  'Bolt Bot', 'Zigzag Bot', 'Hexy Bot', 'Pointy Bot', 'Roly Bot', 'Glidey Bot', 'Sparky Bot', 'Blocky Bot',
  'Wavy Bot', 'Prism Bot', 'Turbo Bot', 'Comet Bot',
];
