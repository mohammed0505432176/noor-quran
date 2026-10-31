// Arabic text helpers shared by search and recitation matching.

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]/g;

/** Normalize Arabic for comparison: strip tashkeel/Quranic marks, unify alef/ya/ta-marbuta/hamza forms, keep letters only. */
export function norm(text) {
  return String(text)
    .replace(/ٱ/g, 'ا')
    .replace(DIACRITICS, '')
    .replace(/[أإآٲٳ]/g, 'ا')
    .replace(/[ىۦ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/ء/g, '')
    .replace(/[^ء-ي\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Search skeleton: norm() without the alif letters. The Uthmani text writes long vowels with marks that norm() drops,
 * so «السَّمَٰوَٰتِ» reads «السموت» while the usual spelling is «السماوات»: both give the same skeleton.
 */
export const skel = text => norm(text).replace(/ا/g, '');

/** Split Quran text into display words, dropping standalone waqf/pause marks. */
export function words(text) {
  return String(text).split(/\s+/).filter(w => norm(w).length > 0);
}

/** Convert numbers to Arabic-Indic digits. */
export function N(x) { return Number(x).toLocaleString('ar-EG', { useGrouping: false }); }
