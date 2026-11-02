// Unified duotone icon set for «أذكاري» (public/kids/icons/<name>.svg). One icon per category id;
// ids that are not listed fall back to a keyword match on the title, then to `general`.
export const ICONS = ['sun', 'moon', 'bed', 'food', 'home', 'mosque', 'travel', 'wudu-drop', 'heart-care', 'shield', 'quran-book', 'hands-dua', 'lantern', 'family', 'star', 'general'];

export const ICON_BY_ID = {
  wake: 'sun', sleep: 'bed', eat_before: 'food', eat_after: 'food', home_enter: 'home', home_leave: 'home',
  toilet_enter: 'wudu-drop', toilet_exit: 'wudu-drop', ride: 'travel', morning: 'sun', evening: 'moon',
  mosque_enter: 'mosque', mosque_exit: 'mosque', wear_clothes: 'general', sneeze: 'heart-care', rain: 'wudu-drop',
  wudu_before: 'wudu-drop', wudu_after: 'wudu-drop', undress: 'general', new_clothes: 'general', new_clothes_for: 'general',
  adhan_reply: 'mosque', prayer_start: 'mosque', ruku: 'mosque', rise_ruku: 'mosque', sujud: 'mosque', between_sajda: 'mosque',
  before_salam: 'mosque', after_prayer: 'hands-dua', after_fajr: 'sun', after_maghrib: 'moon', night_turn: 'bed', bad_dream: 'bed',
  sad: 'heart-care', distress: 'heart-care', hard_task: 'star', fear: 'shield', anger: 'heart-care', unwanted: 'heart-care',
  visit_sick: 'heart-care', pain: 'heart-care', disaster: 'shield', wind: 'shield', thunder: 'shield',
  rain_ask: 'wudu-drop', rain_after: 'wudu-drop', clear_sky: 'wudu-drop', new_moon: 'moon', iftar: 'food',
  thank_feeder: 'food', guest_dua: 'food', iftar_guest: 'food', eat_after_alt: 'food', fasting_insult: 'heart-care',
  first_fruit: 'food', wedding: 'family', seen_trial: 'heart-care', majlis_end: 'family', reply_forgive: 'heart-care',
  jazak: 'heart-care', love_god: 'heart-care', offer_money: 'heart-care', baraka_reply: 'heart-care', shirk_fear: 'shield',
  tayra: 'shield', debt: 'general', stumble: 'travel', traveler_to_home: 'travel', home_to_traveler: 'travel', dawn_travel: 'travel',
  stop_place: 'home', market: 'general', joy_or_not: 'star', wonder: 'star', fright: 'shield', salawat: 'star',
  istighfar: 'hands-dua', tasbih: 'star', hasbi: 'shield', ya_hayy: 'lantern', knowledge: 'quran-book', child_protect: 'family',
  q_kursi: 'shield', q_baqarah_end: 'quran-book', q_muawwidhat: 'shield', q_fatiha: 'quran-book', q_dunya_akhira: 'star',
  q_firm_heart: 'heart-care', q_knowledge: 'quran-book', q_ease: 'lantern', q_family: 'family', q_prayer_parents: 'mosque',
  q_parents: 'family', q_mercy: 'hands-dua', q_repent: 'hands-dua', q_yunus: 'lantern'
};

const KEYWORDS = [
  [/صباح|استيقاظ|شمس/, 'sun'], [/مساء|ليل|هلال/, 'moon'], [/نوم|فراش/, 'bed'], [/طعام|أكل|إفطار|ثمر/, 'food'],
  [/منزل|بيت/, 'home'], [/مسجد|صلاة|سجود|ركوع|أذان/, 'mosque'], [/سفر|ركوب|مسافر/, 'travel'],
  [/وضوء|خلاء|مطر/, 'wudu-drop'], [/حزن|مريض|ألم|كرب/, 'heart-care'], [/خوف|حفظ|تعوّذ|حماية/, 'shield'],
  [/قرآن|علم|سورة|آية/, 'quran-book'], [/دعاء|استغفار/, 'hands-dua'], [/أهل|والد|أولاد|زواج/, 'family'], [/تسبيح|صلاة على النبي/, 'star']
];

/** Icon name for a category object ({id, title}); always one of ICONS. */
export function iconFor(cat) {
  if (cat && ICON_BY_ID[cat.id]) return ICON_BY_ID[cat.id];
  const t = String((cat && cat.title) || '');
  for (const [re, name] of KEYWORDS) if (re.test(t)) return name;
  return 'general';
}
