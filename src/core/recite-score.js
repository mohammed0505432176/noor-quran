// Scoring of a range recitation (views/recite.js finalize). The session may end anywhere in the passage: the words after
// the last one reached were never recited, so they are not scored at all (not mistakes, not in the accuracy denominator).
// The words before it are scored: skipped, cut short, substituted or revealed words are mistakes, including words the
// reciter jumped over while reading on.

/**
 * @param {string[]} pre per word: 'ok' | 'uns' (unsure, counts as ok) | 'bad' | 'pending' (not judged)
 * @param {{ forced?: Set<number>, hard?: (i: number) => boolean, groups?: { a: number, start: number, end: number }[] }} [opts]
 *   forced: words the user revealed (peeked): mistakes. hard: words a correction rule flags as mistakes.
 *   groups: the ayah ranges over the flat word list (for the per-ayah statistics).
 * @returns {{ st: string[], reached: number, scoped: number, ok: number, acc: number, ayahStats: object[] }}
 *   st: per word 'ok' | 'bad' | 'na' (after the last word reached: not scored). scoped: words that were scored.
 */
export function scoreSession(pre, { forced = new Set(), hard = () => false, groups = [] } = {}) {
  let reached = -1;
  pre.forEach((x, i) => { if (x !== 'pending' || forced.has(i)) reached = i; });
  const st = pre.map((x, i) => {
    if (i > reached) return 'na';
    if (forced.has(i) || hard(i)) return 'bad';
    return x === 'ok' || x === 'uns' ? 'ok' : 'bad';
  });
  const scoped = reached + 1;
  const ok = st.filter(x => x === 'ok').length;
  const acc = scoped ? Math.round(100 * ok / scoped) : 0;
  const ayahStats = groups.map(g => {
    let n = 0, okN = 0;
    for (let k = g.start; k < g.end; k++) if (st[k] !== 'na') { n++; if (st[k] === 'ok') okN++; }
    return { a: g.a, ok: okN, n, acc: n ? Math.round(100 * okN / n) : 0 };
  }).filter(x => x.n > 0);
  return { st, reached, scoped, ok, acc, ayahStats };
}
