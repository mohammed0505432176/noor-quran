// Generates public/quran.json (compact) from the quran-json package (Uthmani text, CC BY 4.0, quranenc.com).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const src = require.resolve('quran-json/dist/quran.json');
const data = JSON.parse(fs.readFileSync(src, 'utf8'));
const out = data.map(c => ({ n: c.name, t: c.type === 'meccan' ? 'm' : 'd', v: c.verses.map(v => v.text) }));
const total = out.reduce((a, c) => a + c.v.length, 0);
if (out.length !== 114 || total !== 6236) throw new Error(`Unexpected Quran data: ${out.length} surahs, ${total} ayahs`);
fs.writeFileSync(new URL('../public/quran.json', import.meta.url), JSON.stringify(out));
console.log(`quran.json: 114 surahs, ${total} ayahs`);
