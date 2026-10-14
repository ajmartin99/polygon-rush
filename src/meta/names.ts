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

/** Friendly CPU rival names (clearly labelled "CPU" in the UI). */
export const CPU_NAMES = [
  'Bolt Bot', 'Zigzag Bot', 'Hexy Bot', 'Pointy Bot', 'Roly Bot', 'Glidey Bot', 'Sparky Bot', 'Blocky Bot',
  'Wavy Bot', 'Prism Bot', 'Turbo Bot', 'Comet Bot',
];
