// More kids azkar. HISN_MORE: text and audio from Hisn al-Muslim (hisnmuslim.com, Sheikh Fares Abbad);
// the audio id is the item id in hisnmuslim.com/api/ar/<chapter>.json and each text is the text of that clip
// (outer brackets and trailing count notes stripped). Counts above 10 in the source are shortened for kids.
// QURAN_AZKAR: Quran supplications stored as references only ({s, from, to}); the text comes from
// public/quran.json and the audio from everyayah (ayahUrl in kids-prayer.js). Never retype Quran text here.

export const HISN_MORE = [
  {
    id: "wudu_before", kind: "hisn", title: "قبل الوضوء", when: "حين أبدأ الوضوء", emoji: "1f932", img: null,
    items: [
      {text:"بِسْمِ اللَّهِ", audio:"https://hisnmuslim.com/audio/ar/12.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "wudu_after", kind: "hisn", title: "بعد الوضوء", when: "حين أنتهي من الوضوء", emoji: "1f932", img: null,
    items: [
      {text:"اللَّهُمَّ اجْعَلْنِي مِنَ التَّوَّابِينَ وَاجْعَلْنِي مِنَ الْمُتَطَهِّرِينَ", audio:"https://hisnmuslim.com/audio/ar/14.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"سُبْحانَكَ اللَّهُمَّ وَبِحَمْدِكَ، أَشْهَدُ أَنْ لاَ إِلَهَ إِلاَّ أَنْتَ، أَسْتَغْفِرُكَ وَأَتوبُ إِلَيْكَ", audio:"https://hisnmuslim.com/audio/ar/15.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"أَشْهَدُ أَنْ لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ وَأَشْهَدُ أَنَّ مُحَمَّداً عَبْدُهُ وَرَسُولُهُ", audio:"https://hisnmuslim.com/audio/ar/13.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "undress", kind: "hisn", title: "عند خلع الثوب", when: "حين أخلع ملابسي", emoji: "1f455", img: null,
    items: [
      {text:"بِسْمِ اللَّهِ", audio:"https://hisnmuslim.com/audio/ar/9.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "new_clothes", kind: "hisn", title: "لبس الثوب الجديد", when: "حين ألبس ثوباً جديداً", emoji: "1f455", img: null,
    items: [
      {text:"اللَّهُمَّ لَكَ الْحَمْدُ أَنْتَ كَسَوْتَنِيهِ، أَسْأَلُكَ مِنْ خَيْرِهِ وَخَيْرِ مَا صُنِعَ لَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّهِ وَشَرِّ مَا صُنِعَ لَهُ", audio:"https://hisnmuslim.com/audio/ar/6.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "new_clothes_for", kind: "hisn", title: "لمن لبس ثوباً جديداً", when: "حين أرى أحداً يلبس ثوباً جديداً", emoji: "1f389", img: null,
    items: [
      {text:"تُبْلِي وَيُخْلِفُ اللَّهُ تَعَالَى", audio:"https://hisnmuslim.com/audio/ar/7.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "adhan_reply", kind: "hisn", title: "عند سماع الأذان", when: "حين يؤذّن المؤذن", emoji: "1f54c", img: null,
    items: [
      {text:"يَقُولُ مِثْلَ مَا يَقُولُ المُؤَذِّنُ إِلاَّ فِي حَيَّ عَلَى الصَّلَاةِ وَحَيَّ عَلَى الْفَلَاحِ فَيقُولُ: لاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ", audio:"https://hisnmuslim.com/audio/ar/22.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"يَقُولُ: اللَّهُمَّ رَبَّ هَذِهِ الدَّعْوَةِ التَّامَّةِ، وَالصَّلاَةِ الْقَائِمَةِ، آتِ مُحَمَّداً الْوَسِيلَةَ وَالْفَضِيلَةَ، وَابْعَثْهُ مَقَامَاً مَحمُوداً الَّذِي وَعَدْتَهُ، إِنَّكَ لَا تُخْلِفُ الْمِيعَادَ", audio:"https://hisnmuslim.com/audio/ar/25.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "prayer_start", kind: "hisn", title: "دعاء الاستفتاح", when: "في بداية الصلاة", emoji: "1f54b", img: null,
    items: [
      {text:"سُبْحانَكَ اللَّهُمَّ وَبِحَمْدِكَ، وَتَبارَكَ اسْمُكَ، وَتَعَالَى جَدُّكَ، وَلاَ إِلَهَ غَيْرُكَ", audio:"https://hisnmuslim.com/audio/ar/28.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "ruku", kind: "hisn", title: "دعاء الركوع", when: "وأنا راكع في الصلاة", emoji: "1f54b", img: null,
    items: [
      {text:"سُبْحانَ رَبِّيَ الْعَظِيمِ", audio:"https://hisnmuslim.com/audio/ar/33.mp3", repeat:3, ref:"حصن المسلم"},
      {text:"سُبْحَانَكَ اللَّهُمَّ رَبَّنَا وَبِحَمْدِكَ، اللَّهُمَّ اغْفِرْ لِي", audio:"https://hisnmuslim.com/audio/ar/34.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "rise_ruku", kind: "hisn", title: "الرفع من الركوع", when: "حين أرفع من الركوع", emoji: "1f54b", img: null,
    items: [
      {text:"سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ", audio:"https://hisnmuslim.com/audio/ar/38.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"رَبَّنَا وَلَكَ الْحَمْدُ، حَمْداً كَثيراً طَيِّباً مُبارَكاً فِيهِ", audio:"https://hisnmuslim.com/audio/ar/39.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "sujud", kind: "hisn", title: "دعاء السجود", when: "وأنا ساجد في الصلاة", emoji: "1f54b", img: null,
    items: [
      {text:"سُبْحَانَ رَبِّيَ الأَعْلَى", audio:"https://hisnmuslim.com/audio/ar/41.mp3", repeat:3, ref:"حصن المسلم"},
      {text:"سُبْحَانَكَ اللَّهُمَّ رَبَّنَا وَبِحَمْدِكَ، اللَّهُمَّ اغْفِرْ لِي", audio:"https://hisnmuslim.com/audio/ar/42.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"اللَّهُمَّ اغْفِرْ لِي ذَنْبِي كُلَّهُ: دِقَّهُ وَجِلَّهُ، وَأَوَّلَهُ وَآخِرَهُ، وَعَلاَنِيَّتَهُ وَسِرَّهُ", audio:"https://hisnmuslim.com/audio/ar/46.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "between_sajda", kind: "hisn", title: "بين السجدتين", when: "حين أجلس بين السجدتين", emoji: "1f54b", img: null,
    items: [
      {text:"رَبِّ اغْفِرْ لِي، رَبِّ اغْفِرْ لِي", audio:"https://hisnmuslim.com/audio/ar/48.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"اللَّهُمَّ اغْفِرْ لِي، وَارْحَمْنِي، وَاهْدِنِي، وَاجْبُرْنِي، وَعَافِنِي، وَارْزُقْنِي، وَارْفَعْنِي", audio:"https://hisnmuslim.com/audio/ar/49.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "before_salam", kind: "hisn", title: "قبل السلام من الصلاة", when: "في آخر الصلاة قبل السلام", emoji: "1f54b", img: null,
    items: [
      {text:"اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ، وَشُكْرِكَ، وَحُسْنِ عِبادَتِكَ", audio:"https://hisnmuslim.com/audio/ar/59.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"اللَّهُمَّ إِنِّي أَسْأَلُكَ الْجَنَّةَ وَأَعُوذُ بِكَ مِنَ النَّارِ", audio:"https://hisnmuslim.com/audio/ar/61.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "after_prayer", kind: "hisn", title: "بعد السلام من الصلاة", when: "حين أسلّم وأنتهي من الصلاة", emoji: "1f54b", img: null,
    items: [
      {text:"أَسْتَغْفِرُ اللَّهَ (ثَلاَثَاً) اللَّهُمَّ أَنْتَ السَّلاَمُ، وَمِنْكَ السَّلاَمُ، تَبَارَكْتَ يَا ذَا الْجَلاَلِ وَالْإِكْرَامِ", audio:"https://hisnmuslim.com/audio/ar/66.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "after_fajr", kind: "hisn", title: "بعد صلاة الفجر", when: "بعد السلام من صلاة الفجر", emoji: "1f305", img: null,
    items: [
      {text:"اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْماً نافِعاً، وَرِزْقاً طَيِّباً، وَعَمَلاً مُتَقَبَّلاً", audio:"https://hisnmuslim.com/audio/ar/73.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "after_maghrib", kind: "hisn", title: "بعد المغرب والفجر", when: "بعد صلاة المغرب وصلاة الفجر", emoji: "1f319", img: null,
    items: [
      {text:"لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ يُحْيِي وَيُمِيتُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ", audio:"https://hisnmuslim.com/audio/ar/72.mp3", repeat:10, ref:"حصن المسلم"}
    ]
  },
  {
    id: "night_turn", kind: "hisn", title: "إذا تقلّبت ليلاً", when: "حين أستيقظ في الليل", emoji: "1f634", img: null,
    items: [
      {text:"لاَ إِلَهَ إِلاَّ اللَّهُ الْوَاحِدُ الْقَهّارُ، رَبُّ السَّمَوَاتِ وَالْأَرْضِ وَمَا بَيْنَهُمَا الْعَزيزُ الْغَفَّارُ", audio:"https://hisnmuslim.com/audio/ar/112.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "bad_dream", kind: "hisn", title: "عند الفزع في النوم", when: "حين أخاف في نومي", emoji: "1f634", img: null,
    items: [
      {text:"أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ غَضَبِهِ وَعِقَابِهِ، وَشَرِّ عِبَادِهِ، وَمِنْ هَمَزَاتِ الشَّياطِينِ وَأَنْ يَحْضُرُونِ", audio:"https://hisnmuslim.com/audio/ar/113.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "sad", kind: "hisn", title: "عند الهم والحزن", when: "حين أشعر بالحزن أو القلق", emoji: "2601", img: null,
    items: [
      {text:"اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْبُخْلِ وَالْجُبْنِ، وَضَلَعِ الدَّيْنِ وَغَلَبَةِ الرِّجَالِ", audio:"https://hisnmuslim.com/audio/ar/121.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "distress", kind: "hisn", title: "عند الكرب", when: "حين أكون في ضيق", emoji: "2601", img: null,
    items: [
      {text:"اللَّهُمَّ رَحْمَتَكَ أَرْجُو، فَلاَ تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ، وَأَصْلِحْ لِي شَأْنِي كُلَّهُ، لاَ إِلَهَ إِلاَّ أَنْتَ", audio:"https://hisnmuslim.com/audio/ar/123.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"لاَ إِلَهَ إِلاَّ أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظّالِمِينَ", audio:"https://hisnmuslim.com/audio/ar/124.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"اللَّهُ اللَّهُ رَبِّي لاَ أُشْرِكُ بِهِ شَيْئاً", audio:"https://hisnmuslim.com/audio/ar/125.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "hard_task", kind: "hisn", title: "إذا صعُب عليّ أمر", when: "حين أجد شيئاً صعباً", emoji: "2b50", img: null,
    items: [
      {text:"اللَّهُمَّ لاَ سَهْلَ إِلاَّ مَا جَعَلْتَهُ سَهْلاً، وَأَنْتَ تَجْعَلُ الْحَزْنَ إِذَا شِئْتَ سَهْلاً", audio:"https://hisnmuslim.com/audio/ar/139.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "fear", kind: "hisn", title: "عند الخوف", when: "حين أخاف من شيء", emoji: "1f31f", img: null,
    items: [
      {text:"حَسْبُنا اللَّهُ وَنِعْمَ الْوَكِيلُ", audio:"https://hisnmuslim.com/audio/ar/128.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"اللَّهُمَّ اكْفِنِيهِمْ بِمَا شِئْتَ", audio:"https://hisnmuslim.com/audio/ar/132.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "anger", kind: "hisn", title: "عند الغضب", when: "حين أغضب", emoji: "2601", img: null,
    items: [
      {text:"أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ", audio:"https://hisnmuslim.com/audio/ar/193.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "unwanted", kind: "hisn", title: "إذا حدث ما لا أحب", when: "حين يحدث شيء لا يعجبني", emoji: "2601", img: null,
    items: [
      {text:"قَدَرُ اللَّهُ وَمَا شَاءَ فَعَلَ", audio:"https://hisnmuslim.com/audio/ar/144.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "visit_sick", kind: "hisn", title: "عيادة المريض", when: "حين أزور مريضاً", emoji: "1f339", img: null,
    items: [
      {text:"لاَ بأْسَ طَهُورٌ إِنْ شَاءَ اللَّهُ", audio:"https://hisnmuslim.com/audio/ar/147.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"أَسْأَلُ اللَّهَ الْعَظيمَ رَبَّ الْعَرْشِ الْعَظِيمِ أَنْ يَشْفيَكَ", audio:"https://hisnmuslim.com/audio/ar/148.mp3", repeat:7, ref:"حصن المسلم"}
    ]
  },
  {
    id: "pain", kind: "hisn", title: "عند الألم", when: "حين أشعر بألم في جسدي", emoji: "1f339", img: null,
    items: [
      {text:"ضَعْ يَدَكَ عَلَى الَّذِي تَألَّمَ مِنْ جَسَدِكَ وَقُلْ: بِسْمِ اللَّهِ، ثَلاَثاً، وَقُلْ سَبْعَ مَرَّاتٍ: أَعُوذُ بِاللَّهِ وَقُدْرَتِهِ مِنْ شَرِّ مَا أَجِدُ وَأُحَاذِرُ", audio:"https://hisnmuslim.com/audio/ar/243.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "disaster", kind: "hisn", title: "عند المصيبة", when: "حين تصيبني مصيبة", emoji: "2601", img: null,
    items: [
      {text:"إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ، اللَّهُمَّ أْجُرْنِي فِي مُصِيبَتِي، وَأَخْلِفْ لِي خَيْرَاً مِنْهَا", audio:"https://hisnmuslim.com/audio/ar/154.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "wind", kind: "hisn", title: "عند هبوب الريح", when: "حين تهبّ الريح", emoji: "2601", img: null,
    items: [
      {text:"اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَهَا، وَأَعُوذُ بِكَ مِنْ شَرِّهَا", audio:"https://hisnmuslim.com/audio/ar/166.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "thunder", kind: "hisn", title: "عند سماع الرعد", when: "حين أسمع صوت الرعد", emoji: "2601", img: null,
    items: [
      {text:"سُبْحَانَ الَّذِي يُسَبِّحُ الرَّعْدُ بِحَمْدِهِ وَالْمَلاَئِكةُ مِنْ خِيفَتِهِ", audio:"https://hisnmuslim.com/audio/ar/168.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "rain_ask", kind: "hisn", title: "طلب المطر", when: "حين نطلب من الله المطر", emoji: "1f327", img: null,
    items: [
      {text:"اللَّهُمَّ اسْقِنَا غَيْثاً مُغِيثاً مَرِيئاً مَرِيعاً، نَافِعاً غَيْرَ ضَارٍّ، عَاجِلاً غَيْرَ آجِلٍ", audio:"https://hisnmuslim.com/audio/ar/169.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"اللَّهُمَّ اسْقِ عِبَادَكَ، وَبَهَائِمَكَ، وَانْشُرْ رَحْمَتَكَ، وَأَحْيِي بَلَدَكَ الْمَيِّتَ", audio:"https://hisnmuslim.com/audio/ar/171.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "rain_after", kind: "hisn", title: "بعد نزول المطر", when: "بعد أن ينتهي المطر", emoji: "1f327", img: null,
    items: [
      {text:"مُطِرْنَا بِفَضْلِ اللَّهِ وَرَحْمَتِهِ", audio:"https://hisnmuslim.com/audio/ar/173.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "clear_sky", kind: "hisn", title: "عند كثرة المطر", when: "حين يكثر المطر", emoji: "1f327", img: null,
    items: [
      {text:"اللَّهُمَّ حَوَالَيْنَا وَلاَ عَلَيْنَا، اللَّهُمَّ عَلَى الآكَامِ وَالظِّرَابِ، وَبُطُونِ الْأَوْدِيَةِ، وَمَنَابِتِ الشَّجَرِ", audio:"https://hisnmuslim.com/audio/ar/174.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "new_moon", kind: "hisn", title: "عند رؤية الهلال", when: "حين أرى الهلال الجديد", emoji: "1f319", img: null,
    items: [
      {text:"اللَّهُ أَكْبَرُ، اللَّهُمَّ أَهِلَّهُ عَلَيْنَا بِالْأَمْنِ وَالْإِيمَانِ، وَالسَّلاَمَةِ وَالْإِسْلاَمِ، وَالتَّوْفِيقِ لِمَا تُحِبُّ رَبَّنَا وَتَرْضَى، رَبُّنَا وَرَبُّكَ اللَّهُ", audio:"https://hisnmuslim.com/audio/ar/175.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "iftar", kind: "hisn", title: "عند الإفطار", when: "حين أفطر في رمضان", emoji: "1f319", img: null,
    items: [
      {text:"ذَهَبَ الظَّمَأُ وَابْتَلَّتِ العُرُوقُ، وَثَبَتَ الْأَجْرُ إِنْ شَاءَ اللَّهُ", audio:"https://hisnmuslim.com/audio/ar/176.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "thank_feeder", kind: "hisn", title: "لمن أطعمني", when: "حين يطعمني أحد أو يسقيني", emoji: "1f37d", img: null,
    items: [
      {text:"اللَّهُمَّ أَطْعِمْ مَنْ أَطْعَمَنِي، وَاسْقِ مَنْ سَقَانِي", audio:"https://hisnmuslim.com/audio/ar/183.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "guest_dua", kind: "hisn", title: "دعاء الضيف", when: "حين آكل عند أحد", emoji: "1f37d", img: null,
    items: [
      {text:"اللَّهُمَّ بَارِكْ لَهُمْ فِيمَا رَزَقْتَهُم، وَاغْفِرْ لَهُمْ وَارْحَمْهُمْ", audio:"https://hisnmuslim.com/audio/ar/182.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "iftar_guest", kind: "hisn", title: "الإفطار عند أهل بيت", when: "حين أفطر عند أحد", emoji: "1f37d", img: null,
    items: [
      {text:"أَفْطَرَ عِنْدَكُمُ الصَّائِمُونَ، وَأَكَلَ طَعَامَكُمُ الْأَبْرَارُ، وَصَلَّتْ عَلَيْكُمُ الْمَلاَئِكَةُ", audio:"https://hisnmuslim.com/audio/ar/184.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "eat_after_alt", kind: "hisn", title: "بعد الطعام (دعاء آخر)", when: "بعد أن أنتهي من الأكل", emoji: "1f37d", img: null,
    items: [
      {text:"الْحَمْدُ لِلَّهِ حَمْداً كَثِيراً طَيِّباً مُبَارَكاً فِيهِ، غَيْرَ مَكْفِيٍّ وَلاَ مُوَدَّعٍ، وَلاَ مُسْتَغْنَىً عَنْهُ رَبَّنَا", audio:"https://hisnmuslim.com/audio/ar/181.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "fasting_insult", kind: "hisn", title: "إذا سابّني أحد وأنا صائم", when: "حين أكون صائماً ويشتمني أحد", emoji: "1f319", img: null,
    items: [
      {text:"إِنِّي صَائِمٌ، إِنِّي صَائِمٌ", audio:"https://hisnmuslim.com/audio/ar/186.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "first_fruit", kind: "hisn", title: "عند رؤية أول الثمر", when: "حين أرى ثمراً جديداً", emoji: "1f34e", img: null,
    items: [
      {text:"اللَّهُمَّ بَارِكْ لَنَا فِي ثَمَرِنَا، وَبَارِكْ لَنَا فِي مَدِينَتِنَا، وَبَارِكْ لَنَا فِي صَاعِنَا، وَبَارِكْ لَنَا فِي مُدِّنَا", audio:"https://hisnmuslim.com/audio/ar/187.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "wedding", kind: "hisn", title: "الدعاء للمتزوج", when: "حين أدعو لعروسين", emoji: "1f389", img: null,
    items: [
      {text:"بَارَكَ اللَّهُ لَكَ، وَبَارَكَ عَلَيْكَ، وَجَمَعَ بَيْنَكُمَا فِي خَيْرٍ", audio:"https://hisnmuslim.com/audio/ar/190.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "seen_trial", kind: "hisn", title: "إذا رأيت من ابتُلي", when: "حين أرى شخصاً مبتلى", emoji: "1f339", img: null,
    items: [
      {text:"الْحَمْدُ لِلَّهِ الَّذِي عَافَانِي مِمَّا ابْتَلاَكَ بِهِ، وَفَضَّلَنِي عَلَى كَثِيرٍ مِمَّنْ خَلَقَ تَفْضِيلاً", audio:"https://hisnmuslim.com/audio/ar/194.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "majlis_end", kind: "hisn", title: "كفارة المجلس", when: "حين أقوم من مجلس جلست فيه", emoji: "1f31f", img: null,
    items: [
      {text:"سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، أَشْهَدُ أَنْ لاَ إِلَهَ إِلاَّ أَنْتَ، أَسْتَغْفِرُكَ وَأَتُوبُ إِلَيْكَ", audio:"https://hisnmuslim.com/audio/ar/196.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "reply_forgive", kind: "hisn", title: "لمن قال غفر الله لك", when: "حين يدعو لي أحد بالمغفرة", emoji: "1f339", img: null,
    items: [
      {text:"وَلَكَ", audio:"https://hisnmuslim.com/audio/ar/197.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "jazak", kind: "hisn", title: "لمن صنع إليّ معروفاً", when: "حين يفعل أحد لي خيراً", emoji: "1f339", img: null,
    items: [
      {text:"جَزَاكَ اللَّهُ خَيْراً", audio:"https://hisnmuslim.com/audio/ar/198.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "love_god", kind: "hisn", title: "لمن قال إني أحبك في الله", when: "حين يقول لي أحد إنه يحبني في الله", emoji: "1f339", img: null,
    items: [
      {text:"أَحَبَّكَ الَّذِي أَحْبَبْتَنِي لَهُ", audio:"https://hisnmuslim.com/audio/ar/200.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "offer_money", kind: "hisn", title: "لمن عرض عليّ ماله", when: "حين يعرض عليّ أحد ماله", emoji: "1f339", img: null,
    items: [
      {text:"بَارَكَ اللَّهُ لَكَ فِي أَهْلِكَ وَمَالِكَ", audio:"https://hisnmuslim.com/audio/ar/201.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "baraka_reply", kind: "hisn", title: "لمن قال بارك الله فيك", when: "حين يدعو لي أحد بالبركة", emoji: "1f339", img: null,
    items: [
      {text:"وَفِيكَ بَارَكَ اللَّهُ", audio:"https://hisnmuslim.com/audio/ar/204.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "shirk_fear", kind: "hisn", title: "الخوف من الشرك", when: "حين أريد أن أحفظ إيماني", emoji: "1f31f", img: null,
    items: [
      {text:"اللَّهُمَّ إِنِّي أَعُوذُ بِكَ أَنْ أُشْرِكَ بِكَ وَأَنَا أَعْلَمُ، وَأَسْتَغْفِرُكَ لِمَا لاَ أَعْلَمُ", audio:"https://hisnmuslim.com/audio/ar/203.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "tayra", kind: "hisn", title: "دعاء كراهية الطيرة", when: "حين أتشاءم من شيء", emoji: "2b50", img: null,
    items: [
      {text:"اللَّهُمَّ لاَ طَيْرَ إِلاَّ طَيْرُكَ، وَلاَ خَيْرَ إِلاَّ خَيْرُكَ، وَلاَ إِلَهَ غَيْرُكَ", audio:"https://hisnmuslim.com/audio/ar/205.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "debt", kind: "hisn", title: "دعاء قضاء الدين", when: "حين أحتاج إلى الغنى عن الناس", emoji: "2b50", img: null,
    items: [
      {text:"اللَّهُمَّ اكْفِنِي بِحَلاَلِكَ عَنْ حَرَامِكَ، وَأَغْنِنِي بِفَضْلِكِ عَمَّنْ سِوَاكَ", audio:"https://hisnmuslim.com/audio/ar/136.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "stumble", kind: "hisn", title: "إذا تعثّر ما أركبه", when: "حين يتعثر ما أركبه", emoji: "1f697", img: null,
    items: [
      {text:"بِسْمِ اللَّهِ", audio:"https://hisnmuslim.com/audio/ar/210.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "traveler_to_home", kind: "hisn", title: "دعاء المسافر للمقيم", when: "حين أودّع أهلي لأسافر", emoji: "1f697", img: null,
    items: [
      {text:"أَسْتَوْدِعُكُمُ اللَّهَ الَّذِي لاَ تَضِيعُ وَدَائِعُهُ", audio:"https://hisnmuslim.com/audio/ar/211.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "home_to_traveler", kind: "hisn", title: "دعاء المقيم للمسافر", when: "حين أودّع مسافراً", emoji: "1f697", img: null,
    items: [
      {text:"أَسْتَوْدِعُ اللَّهَ دِينَكَ، وَأَمَانَتَكَ، وَخَوَاتِيمَ عَمَلِكَ", audio:"https://hisnmuslim.com/audio/ar/212.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"زَوَّدَكَ اللَّهُ التَّقْوَى، وَغَفَرَ ذَنْبَكَ، وَيَسَّرَ لَكَ الخَيْرَ حَيْثُ ما كُنْتَ", audio:"https://hisnmuslim.com/audio/ar/213.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "dawn_travel", kind: "hisn", title: "دعاء المسافر إذا أسحر", when: "حين أكون مسافراً وقت السحر", emoji: "1f305", img: null,
    items: [
      {text:"سَمَّعَ سَامِعٌ بِحَمْدِ اللَّهِ، وَحُسْنِ بَلاَئِهِ عَلَيْنَا، رَبَّنَا صاحِبْنَا، وَأَفْضِلْ عَلَيْنَا، عَائِذاً بِاللَّهِ مِنَ النَّارِ", audio:"https://hisnmuslim.com/audio/ar/215.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "stop_place", kind: "hisn", title: "النزول في مكان جديد", when: "حين أنزل في مكان جديد", emoji: "1f3e0", img: null,
    items: [
      {text:"أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ", audio:"https://hisnmuslim.com/audio/ar/216.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "market", kind: "hisn", title: "دخول السوق", when: "حين أدخل السوق", emoji: "1f34e", img: null,
    items: [
      {text:"لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ، وَلَهُ الْحَمْدُ، يُحْيِي وَيُمِيتُ، وَهُوَ حَيٌّ لاِ يَمُوتُ، بِيَدِهِ الْخَيْرُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ", audio:"https://hisnmuslim.com/audio/ar/209.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "joy_or_not", kind: "hisn", title: "عند الأمر السار أو المكروه", when: "حين يأتيني خبر يسرّني أو يحزنني", emoji: "1f389", img: null,
    items: [
      {text:"كَانَ النَّبِيُّ صلى الله عليه وسلم إِذَا أَتَاهُ الْأَمْرُ يَسُرُّهُ قَالَ: الْحَمْدُ لِلَّهِ الَّذِي بِنِعْمَتِهِ تَتِمُّ الصَّالِحَاتُ وَإِذَا أَتَاهُ الْأَمْرُ يَكْرَهُهُ قَالَ: الْحَمْدُ لِلَّهِ عَلَى كُلِّ حَالٍ", audio:"https://hisnmuslim.com/audio/ar/218.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "wonder", kind: "hisn", title: "عند التعجب", when: "حين أتعجب من شيء جميل", emoji: "1f389", img: null,
    items: [
      {text:"سُبْحَانَ اللَّهِ!", audio:"https://hisnmuslim.com/audio/ar/240.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"اللَّهُ أَكْبَرُ!", audio:"https://hisnmuslim.com/audio/ar/241.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "fright", kind: "hisn", title: "إذا فزعت", when: "حين أفزع من شيء", emoji: "1f31f", img: null,
    items: [
      {text:"لاَ إِلَهَ إِلاَّ اللَّهُ!", audio:"https://hisnmuslim.com/audio/ar/245.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "salawat", kind: "hisn", title: "الصلاة على النبي", when: "حين أصلي على النبي", emoji: "1f31f", img: null,
    items: [
      {text:"اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبَيِّنَا مُحَمَّدٍ", audio:"https://hisnmuslim.com/audio/ar/98.mp3", repeat:10, ref:"حصن المسلم"}
    ]
  },
  {
    id: "istighfar", kind: "hisn", title: "الاستغفار", when: "حين أطلب المغفرة من الله", emoji: "1f932", img: null,
    items: [
      {text:"أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ", audio:"https://hisnmuslim.com/audio/ar/96.mp3", repeat:3, ref:"حصن المسلم"}
    ]
  },
  {
    id: "tasbih", kind: "hisn", title: "التسبيح", when: "حين أذكر الله", emoji: "1f31f", img: null,
    items: [
      {text:"سُبْحَانَ اللَّهِ وَبِحَمْدِهِ", audio:"https://hisnmuslim.com/audio/ar/91.mp3", repeat:3, ref:"حصن المسلم"}
    ]
  },
  {
    id: "hasbi", kind: "hisn", title: "حسبي الله", when: "حين أتوكل على الله", emoji: "1f31f", img: null,
    items: [
      {text:"حَسْبِيَ اللَّهُ لاَ إِلَهَ إِلاَّ هُوَ عَلَيهِ تَوَكَّلتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ", audio:"https://hisnmuslim.com/audio/ar/83.mp3", repeat:7, ref:"حصن المسلم"}
    ]
  },
  {
    id: "ya_hayy", kind: "hisn", title: "يا حيّ يا قيوم", when: "حين أطلب العون من الله", emoji: "1f31f", img: null,
    items: [
      {text:"يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغيثُ أَصْلِحْ لِي شَأْنِيَ كُلَّهُ وَلاَ تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ", audio:"https://hisnmuslim.com/audio/ar/88.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "knowledge", kind: "hisn", title: "دعاء العلم النافع", when: "في الصباح قبل المدرسة", emoji: "1f4d6", img: null,
    items: [
      {text:"اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْماً نَافِعاً، وَرِزْقاً طَيِّباً، وَعَمَلاً مُتَقَبَّلاً", audio:"https://hisnmuslim.com/audio/ar/95.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "child_protect", kind: "hisn", title: "ما يُعوَّذ به الأولاد", when: "حين تحمي الأم أو الأب أولادهما", emoji: "1f339", img: null,
    items: [
      {text:"كَانَ رَسُولُ اللَّهِ صلى الله عليه وسلم يُعَوِّذُ الحَسَنَ وَالحُسَينَ رضي الله عنهما أُعِيذُكُمَا بِكَلِمَاتِ اللَّهِ التَّامَّةِ مِنْ كُلِّ شَيْطَانٍ وَهَامَّةٍ، وَمِنْ كُلِّ عَيْنٍ لاَمَّةٍ", audio:"https://hisnmuslim.com/audio/ar/146.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  }
];

export const QURAN_AZKAR = [
  {
    id: "q_kursi", kind: "quran", title: "آية الكرسي", when: "قبل النوم وبعد الصلاة", emoji: "1f31f", img: null,
    items: [
      {quran:{s:2, from:255, to:255}, repeat:1, ref:"القرآن الكريم"}
    ]
  },
  {
    id: "q_baqarah_end", kind: "quran", title: "آخر آيتين من البقرة", when: "قبل أن أنام", emoji: "1f319", img: null,
    items: [
      {quran:{s:2, from:285, to:286}, repeat:1, ref:"القرآن الكريم"}
    ]
  },
  {
    id: "q_muawwidhat", kind: "quran", title: "المعوّذات", when: "في الصباح والمساء وقبل النوم", emoji: "1f31f", img: null,
    items: [
      {quran:{s:112, from:1, to:4}, repeat:3, ref:"القرآن الكريم"},
      {quran:{s:113, from:1, to:5}, repeat:3, ref:"القرآن الكريم"},
      {quran:{s:114, from:1, to:6}, repeat:3, ref:"القرآن الكريم"}
    ]
  },
  {
    id: "q_fatiha", kind: "quran", title: "سورة الفاتحة", when: "في كل ركعة من الصلاة", emoji: "1f4d6", img: null,
    items: [
      {quran:{s:1, from:1, to:7}, repeat:1, ref:"القرآن الكريم"}
    ]
  },
  {
    id: "q_dunya_akhira", kind: "quran", title: "ربنا آتنا في الدنيا حسنة", when: "دعاء جامع للخير", emoji: "1f932", img: null,
    items: [
      {quran:{s:2, from:201, to:201}, repeat:1, ref:"القرآن الكريم"}
    ]
  },
  {
    id: "q_firm_heart", kind: "quran", title: "ثبّت قلبي", when: "حين أطلب الهداية والثبات", emoji: "1f932", img: null,
    items: [
      {quran:{s:3, from:8, to:8}, repeat:1, ref:"القرآن الكريم"}
    ]
  },
  {
    id: "q_knowledge", kind: "quran", title: "ربّ زدني علماً", when: "حين أذاكر وأتعلم", emoji: "1f4d6", img: null,
    items: [
      {quran:{s:20, from:114, to:114}, repeat:1, ref:"القرآن الكريم"}
    ]
  },
  {
    id: "q_ease", kind: "quran", title: "اشرح لي صدري ويسّر لي أمري", when: "حين أبدأ عملاً صعباً", emoji: "2b50", img: null,
    items: [
      {quran:{s:20, from:25, to:28}, repeat:1, ref:"القرآن الكريم"}
    ]
  },
  {
    id: "q_family", kind: "quran", title: "قرة أعين", when: "دعاء لي ولأهلي", emoji: "1f3e0", img: null,
    items: [
      {quran:{s:25, from:74, to:74}, repeat:1, ref:"القرآن الكريم"}
    ]
  },
  {
    id: "q_prayer_parents", kind: "quran", title: "اجعلني مقيم الصلاة", when: "دعاء إبراهيم عليه السلام لنفسه ولوالديه", emoji: "1f54b", img: null,
    items: [
      {quran:{s:14, from:40, to:41}, repeat:1, ref:"القرآن الكريم"}
    ]
  },
  {
    id: "q_parents", kind: "quran", title: "دعاء للوالدين", when: "حين أدعو لأمي وأبي", emoji: "1f339", img: null,
    items: [
      {quran:{s:17, from:24, to:24}, repeat:1, ref:"القرآن الكريم"}
    ]
  },
  {
    id: "q_mercy", kind: "quran", title: "اغفر وارحم", when: "حين أطلب المغفرة والرحمة", emoji: "1f932", img: null,
    items: [
      {quran:{s:23, from:118, to:118}, repeat:1, ref:"القرآن الكريم"}
    ]
  },
  {
    id: "q_repent", kind: "quran", title: "ربنا ظلمنا أنفسنا", when: "حين أخطئ وأتوب", emoji: "1f932", img: null,
    items: [
      {quran:{s:7, from:23, to:23}, repeat:1, ref:"القرآن الكريم"}
    ]
  },
  {
    id: "q_yunus", kind: "quran", title: "لا إله إلا أنت سبحانك", when: "دعاء يونس عليه السلام", emoji: "2601", img: null,
    items: [
      {quran:{s:21, from:87, to:87}, repeat:1, ref:"القرآن الكريم"}
    ]
  },
  {
    id: "q_good_offspring", kind: "quran", title: "ذرية طيبة", when: "دعاء زكريا عليه السلام", emoji: "1f339", img: null,
    items: [
      {quran:{s:3, from:38, to:38}, repeat:1, ref:"القرآن الكريم"}
    ]
  }
];
