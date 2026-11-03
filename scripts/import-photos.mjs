// Imports the Gemini-generated photographs (kept outside git in .router/gemini/*.jpg) into the app as WebP.
// Source: realistic photographs generated for this project through Gemini (no text, logos or watermarks), reviewed one by one.
//   node scripts/import-photos.mjs
// steps/cards: 960x720 (4:3), azkar: 960x720. quality 82.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

export const MAP = {
  'kids/steps': ['wudu', 'takbir', 'qiyam', 'ruku', 'itidal', 'sujud', 'julus', 'salam'],
  'kids/photo': { 'prayer-tile': 'card-prayer', 'dua-hands': 'card-dua', 'letters-book': 'card-letters', 'surahs-mosque': 'card-surahs', 'quiz-star': 'card-quiz' },
  azkar: { morning: 'azkar-morning', evening: 'azkar-evening', afterPrayer: 'azkar-afterprayer', sleep: 'azkar-sleep', food: 'azkar-food', travel: 'azkar-travel', home: 'azkar-home', clothes: 'azkar-clothes', rain: 'azkar-rain', moon: 'azkar-moon' }
};
const src = n => new URL(`../.router/gemini/${n}.jpg`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const out = (d, n) => new URL(`../public/${d}/${n}.webp`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
async function conv(from, to) { await sharp(from).resize(960, 720, { fit: 'cover', position: 'centre' }).webp({ quality: 82, effort: 5 }).toFile(to); console.log('->', to); }

/** Square portrait for the kids entry buttons / header (replaces the old symbolic mascot): face + star of the quiz photo. */
async function entry() {
  const to = out('kids/photo', 'mascot');
  await sharp(src('card-quiz')).extract({ left: 200, top: 40, width: 760, height: 760 }).resize(320, 320).webp({ quality: 82 }).toFile(to);
  console.log('->', to);
}

if (import.meta.url === new URL(process.argv[1], 'file://').href || process.argv[1].endsWith('import-photos.mjs')) {
  for (const [dir, m] of Object.entries(MAP)) {
    mkdirSync(new URL(`../public/${dir}/`, import.meta.url), { recursive: true });
    if (Array.isArray(m)) for (const n of m) await conv(src(n), out(dir, n));
    else for (const [id, f] of Object.entries(m)) await conv(src(f), out(dir, id));
  }
  await entry();
}
