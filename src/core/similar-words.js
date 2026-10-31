// Pure helper for the reader's "repeated phrases" highlight.
// Input: the normalized words of one ayah and the normalized texts of the other ayahs that
// src/core/mutashabih.js findSimilar() returned for it. Output: a boolean per word, true when the word
// sits inside a run of >= minRun consecutive words that also appears contiguously in one of those ayahs.
// No relation is invented here: it only compares the ayah text with texts findSimilar already returned.
export function sharedMask(words, otherTexts, minRun = 3) {
  const n = Array.isArray(words) ? words.length : 0;
  const mask = new Array(n).fill(false);
  if (!n || !Array.isArray(otherTexts) || !otherTexts.length) return mask;
  const hay = otherTexts.map(t => ' ' + String(t || '').trim().split(/\s+/).join(' ') + ' ');
  for (let st = 0; st < n; st++) {
    for (let len = n - st; len >= minRun; len--) {
      const seq = words.slice(st, st + len);
      if (seq.some(w => !w)) continue;
      const needle = ' ' + seq.join(' ') + ' ';
      if (hay.some(h => h.includes(needle))) {
        for (let k = st; k < st + len; k++) mask[k] = true;
        break;
      }
    }
  }
  return mask;
}
