// Ayah of the day: the same ayah all day, another one each day (a deterministic hash of the date, over all the ayahs).
// The hash is taken as an unsigned number: a negative index used to show up as the ayah number (e.g. «الفاتحة · -2312»).
export function ayahOfDay(date, ayahCountOf, surahCount = 114) {
  const doy = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5);
  let h = (date.getFullYear() * 366 + doy) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  let total = 0;
  for (let s = 1; s <= surahCount; s++) total += ayahCountOf(s);
  let idx = ((h ^ (h >>> 16)) >>> 0) % total;
  for (let s = 1; s <= surahCount; s++) {
    const n = ayahCountOf(s);
    if (idx < n) return { s, a: idx + 1 };
    idx -= n;
  }
  return { s: 1, a: 1 };
}