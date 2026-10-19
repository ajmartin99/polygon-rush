// Live updates: turn a web build (dist/) into a manifest plus content-addressed files.
//
//   node tools/ota-manifest.mjs --dir dist --out ota --ota 7 --native 10011 \
//     --base https://github.com/OWNER/REPO/releases/download/ota --notes "New maps"
//
// Writes ota/manifest.json and ota/files/<sha256> (one copy per distinct file). Phones
// only download files whose hash they don't already have (see src/services/updates.ts).
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split(/\s(?=--)/)
    .map((a) => a.replace(/^--/, '').split(/\s(.*)/s))
    .map(([k, v]) => [k, (v ?? '').trim()]),
);
const dir = args.dir || 'dist';
const out = args.out || 'ota';
const ota = Number(args.ota);
const native = Number(args.native);
if (!Number.isInteger(ota) || ota <= 0 || !Number.isInteger(native) || native <= 0 || !args.base) {
  console.error('Usage: --ota <n> --native <versionCode> --base <download url prefix> [--dir dist] [--out ota] [--notes text]');
  process.exit(1);
}

function walk(d) {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

mkdirSync(join(out, 'files'), { recursive: true });
const files = walk(dir)
  .sort()
  .map((p) => {
    const hash = createHash('sha256').update(readFileSync(p)).digest('hex');
    copyFileSync(p, join(out, 'files', hash));
    return { file_name: relative(dir, p).split(sep).join('/'), file_hash: hash, download_url: `${args.base}/${hash}` };
  });
if (!files.some((f) => f.file_name === 'index.html')) {
  console.error(`No index.html in ${dir}: build the web app first.`);
  process.exit(1);
}
const manifest = { ota, native, notes: (args.notes || '').slice(0, 120), files };
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`Live update ${ota} for native build ${native}: ${files.length} files.`);
