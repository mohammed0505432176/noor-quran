// Random spot test of memorised pages: pick a random point inside a page the reader has memorised, show the ayah before it as
// the cue, and ask for the next `len` ayahs from memory. Pure functions (the caller passes the data and a random source).
//   pages: [page, ...] memorised pages; weight(p) >= 0: how much a page should be favoured (weaker / older memory = more)
//   contentOf(p): [{ s, from, to }] the ayah ranges printed on a page (core/pages.js pageContent)
//   ayahsIn(s): number of ayahs of a surah

/** Weight for a page: level 1..3 (3 = strong) and days since it was last recited. Weaker and older pages come up more often. */
export function pageWeight(level, daysAgo) {
  const lvl = Math.min(3, Math.max(1, level | 0 || 1));
  const age = Math.min(60, Math.max(0, +daysAgo || 0));
  return (4 - lvl) + age / 15;
}

function pickWeighted(items, weight, rnd) {
  let total = 0;
  const w = items.map(x => { const v = Math.max(0, weight(x)); total += v; return v; });
  if (!(total > 0)) return items[Math.min(items.length - 1, Math.floor(rnd() * items.length))];
  let r = rnd() * total;
  for (let i = 0; i < items.length; i++) { r -= w[i]; if (r < 0) return items[i]; }
  return items[items.length - 1];
}

/**
 * Pick a spot. Returns null when there is nothing memorised. -> { page, s, from, to, cue: { s, a } | null }
 * `to` never leaves the surah; cue is the ayah before `from` in the same surah (null at the start of a surah).
 */
export function pickSpot({ pages = [], weight = () => 1, contentOf, ayahsIn, len = 2, rnd = Math.random } = {}) {
  if (!pages.length || typeof contentOf !== 'function') return null;
  const page = pickWeighted(pages, weight, rnd);
  const ranges = (contentOf(page) || []).filter(g => g && g.to >= g.from);
  if (!ranges.length) return null;
  const count = ranges.reduce((n, g) => n + (g.to - g.from + 1), 0);
  let k = Math.min(count - 1, Math.floor(rnd() * count));
  for (const g of ranges) {
    const n = g.to - g.from + 1;
    if (k < n) {
      const a = g.from + k, last = typeof ayahsIn === 'function' ? ayahsIn(g.s) : g.to;
      return { page, s: g.s, from: a, to: Math.min(last, a + Math.max(1, len) - 1), cue: a > 1 ? { s: g.s, a: a - 1 } : null };
    }
    k -= n;
  }
  return null;
}
