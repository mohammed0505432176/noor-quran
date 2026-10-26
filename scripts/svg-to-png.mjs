// Converts assets/*.svg to the PNGs required by @capacitor/assets and the PWA.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...a) => resolve(root, ...a);
mkdirSync(p('assets'), { recursive: true });
mkdirSync(p('public'), { recursive: true });

const BG = '#082620';
const jobs = [
  ['assets/icon.svg', 'assets/icon-only.png', 1024],
  ['assets/icon-foreground.svg', 'assets/icon-foreground.png', 1024],
  ['assets/splash.svg', 'assets/splash.png', 2732],
  ['assets/splash.svg', 'assets/splash-dark.png', 2732],
  ['assets/icon.svg', 'public/icon-192.png', 192],
  ['assets/icon.svg', 'public/icon-512.png', 512],
];

for (const [src, out, size] of jobs) {
  await sharp(p(src), { density: 300 }).resize(size, size).png().toFile(p(out));
  console.log('wrote', out, size);
}

await sharp({ create: { width: 1024, height: 1024, channels: 3, background: BG } })
  .png().toFile(p('assets/icon-background.png'));
console.log('wrote assets/icon-background.png 1024');
