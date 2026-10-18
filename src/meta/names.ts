/**
 * Kid-safe racer names. Everyone can pick a generated name; players 13+ may
 * type their own instead (checked by the shared filter, see
 * `checkDisplayText` in shared/chat-filter.ts and `isAllowedName` in net).
 */
const ADJECTIVES = [
  'Speedy', 'Happy', 'Zippy', 'Bouncy', 'Sparkly', 'Turbo', 'Cosmic', 'Jolly', 'Mighty', 'Sunny',
  'Rocket', 'Neon', 'Fuzzy', 'Lucky', 'Swift', 'Brave', 'Cheery', 'Dizzy', 'Snappy', 'Pixel',
  'Giggly', 'Super', 'Hyper', 'Jumpy', 'Breezy', 'Wobbly', 'Shiny', 'Groovy', 'Comet', 'Frosty',
  'Zoomy', 'Peppy', 'Mega', 'Ultra', 'Nimble', 'Plucky', 'Bubbly', 'Starry', 'Wiggly', 'Dashing',
  // Appended (order is the save/level-code format: only ever add to the end).
  'Atomic', 'Blazing', 'Bold', 'Bright', 'Chill', 'Clever', 'Crafty', 'Daring', 'Electric', 'Epic',
  'Fearless', 'Fiery', 'Flashy', 'Funky', 'Galactic', 'Gentle', 'Glowing', 'Golden', 'Grand', 'Hasty',
  'Icy', 'Jazzy', 'Keen', 'Lively', 'Loopy', 'Lunar', 'Magic', 'Merry', 'Misty', 'Mystic',
  'Nifty', 'Noble', 'Orbit', 'Peachy', 'Quick', 'Quirky', 'Radiant', 'Rapid', 'Rusty', 'Silly',
  'Silver', 'Sleek', 'Slick', 'Solar', 'Spicy', 'Spiffy', 'Sporty', 'Steady', 'Stellar', 'Stormy',
  'Swirly', 'Tiny', 'Tricky', 'Twisty', 'Vivid', 'Wacky', 'Wild', 'Witty', 'Zesty', 'Zany',
];

const NOUNS = [
  'Square', 'Hexagon', 'Triangle', 'Diamond', 'Pentagon', 'Octagon', 'Prism', 'Cube', 'Comet', 'Rocket',
  'Panda', 'Otter', 'Fox', 'Koala', 'Penguin', 'Dragon', 'Unicorn', 'Tiger', 'Bunny', 'Turtle',
  'Falcon', 'Dolphin', 'Robot', 'Wizard', 'Ninja', 'Pirate', 'Comet', 'Meteor', 'Pickle', 'Muffin',
  'Waffle', 'Noodle', 'Taco', 'Donut', 'Llama', 'Gecko', 'Hamster', 'Puffin', 'Narwhal', 'Yeti',
  // Appended (order is the save/level-code format: only ever add to the end).
  'Badger', 'Beetle', 'Bison', 'Cactus', 'Capybara', 'Cheetah', 'Cookie', 'Coyote', 'Cricket', 'Cupcake',
  'Dingo', 'Eagle', 'Ferret', 'Firefly', 'Flamingo', 'Frog', 'Gazelle', 'Giraffe', 'Goblin', 'Gopher',
  'Hedgehog', 'Hippo', 'Jaguar', 'Jellybean', 'Kiwi', 'Lemur', 'Lynx', 'Mango', 'Meerkat', 'Moose',
  'Nacho', 'Ocelot', 'Owl', 'Panther', 'Parrot', 'Peanut', 'Pebble', 'Phoenix', 'Pretzel', 'Pudding',
  'Quokka', 'Raccoon', 'Raven', 'Rhino', 'Sloth', 'Sparrow', 'Squid', 'Starfish', 'Sushi', 'Toucan',
  'Tornado', 'Volcano', 'Walrus', 'Wombat', 'Zebra', 'Pancake', 'Pixie', 'Satellite', 'Kraken', 'Gizmo',
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
