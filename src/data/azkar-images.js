// Photograph for every azkar category (Gemini photographs, public/<path>.webp, all 4:3). Categories without a photo of
// their own share the closest one (a prayer-related one shows the prayer, distress / forgiveness / need show the dua).
export const AZKAR_IMG = {
  morning: 'azkar/morning', evening: 'azkar/evening', afterPrayer: 'azkar/afterPrayer', sleep: 'azkar/sleep',
  wake: 'azkar/morning', wudu: 'kids/steps/wudu', toilet: 'azkar/home', adhan: 'kids/photo/surahs-mosque', mosque: 'kids/photo/surahs-mosque',
  prayer: 'kids/photo/prayer-tile', home: 'azkar/home', food: 'azkar/food', clothes: 'azkar/clothes', travel: 'azkar/travel',
  weather: 'azkar/rain', 'rain-prayer': 'azkar/rain', moon: 'azkar/moon', ramadan: 'azkar/moon', market: 'azkar/home'
};
export const AZKAR_IMG_DEFAULT = 'kids/photo/dua-hands';
export const azkarImg = id => AZKAR_IMG[id] || AZKAR_IMG_DEFAULT;
export const AZKAR_ALT = {
  'azkar/morning': 'شروق الشمس من نافذة هادئة', 'azkar/evening': 'غروب الشمس ومئذنة من نافذة', 'azkar/afterPrayer': 'مسبحة بين يدي طفل بعد الصلاة',
  'azkar/sleep': 'غرفة نوم هادئة ليلاً بهلال ونجوم', 'azkar/home': 'مدخل بيت مرتب وباب مفتوح على النهار', 'azkar/food': 'تمر وماء وخبز على طاولة بجانب النافذة',
  'azkar/clothes': 'ثياب بيضاء محتشمة مطوية', 'azkar/travel': 'طريق هادئ عند الشروق وسيارة بيضاء', 'azkar/rain': 'مطر على زجاج النافذة',
  'azkar/moon': 'هلال في سماء الغروب فوق النخيل', 'kids/steps/wudu': 'طفل يغسل يديه عند الوضوء', 'kids/photo/surahs-mosque': 'طفل يمشي نحو مسجد أبيض',
  'kids/photo/prayer-tile': 'طفل يصلّي في غرفة مضيئة', 'kids/photo/dua-hands': 'طفل يرفع يديه بالدعاء'
};
