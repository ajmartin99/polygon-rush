// Regenerates Android launcher icons, splash screens and Play Store art from
// tools/art.ts (which uses the game's own renderer).
//
//   npm run dev            # in one terminal
//   npx -y -p playwright@1 node scripts/generate-art.mjs   # in another
//
// Playwright is only needed for this optional tool, so it is not a dependency.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const URL = process.env.ART_URL ?? 'http://localhost:5173/tools/art.html';
const res = 'android/app/src/main/res';
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const splashSizes = {
  'drawable/splash.png': [480, 320],
  'drawable-land-mdpi/splash.png': [480, 320],
  'drawable-land-hdpi/splash.png': [800, 480],
  'drawable-land-xhdpi/splash.png': [1280, 720],
  'drawable-land-xxhdpi/splash.png': [1600, 960],
  'drawable-land-xxxhdpi/splash.png': [1920, 1280],
  'drawable-port-mdpi/splash.png': [320, 480],
  'drawable-port-hdpi/splash.png': [480, 800],
  'drawable-port-xhdpi/splash.png': [720, 1280],
  'drawable-port-xxhdpi/splash.png': [960, 1600],
  'drawable-port-xxxhdpi/splash.png': [1280, 1920],
};

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
await page.goto(URL);
await page.waitForFunction(() => typeof window.renderArt === 'function');

async function save(path, kind, w, h) {
  const dataUrl = await page.evaluate(([k, ww, hh]) => window.renderArt(k, ww, hh), [kind, w, h]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', path, `${w}x${h}`);
}

for (const [name, k] of Object.entries(densities)) {
  await save(`${res}/mipmap-${name}/ic_launcher.png`, 'legacy', 48 * k, 48 * k);
  await save(`${res}/mipmap-${name}/ic_launcher_round.png`, 'round', 48 * k, 48 * k);
  await save(`${res}/mipmap-${name}/ic_launcher_foreground.png`, 'fg', 108 * k, 108 * k);
  await save(`${res}/mipmap-${name}/ic_launcher_background.png`, 'bg', 108 * k, 108 * k);
  await save(`${res}/mipmap-${name}/ic_launcher_monochrome.png`, 'mono', 108 * k, 108 * k);
}
for (const [path, [w, h]] of Object.entries(splashSizes)) await save(`${res}/${path}`, 'splash', w, h);
await save('store/icon-512.png', 'store', 512, 512);
await save('store/feature-graphic-1024x500.png', 'feature', 1024, 500);
// Spooky Season: Play listing icon and feature graphic to swap in by hand for the event,
// and the Haunted Run cast for the website (convert to webp: site/polygon-rush/img/haunted-cast.webp).
await save('store/seasonal/spooky-icon-512.png', 'spooky-store', 512, 512);
await save('store/seasonal/spooky-feature-1024x500.png', 'spooky-feature', 1024, 500);
await save('store/seasonal/haunted-cast.png', 'spooky-cast', 1200, 420);
await browser.close();
