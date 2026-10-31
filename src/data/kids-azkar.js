// Kids azkar (text and audio from Hisn al-Muslim, hisnmuslim.com; reader: Sheikh Fares Abbad).
// Audio is hotlinked per item; text is the exact text of that clip (HTML/brackets stripped).

import { HISN_MORE, QURAN_AZKAR } from './kids-azkar-more.js';

const HISN_BASE = [
  {
    id: "wake", kind: "hisn", title: "عند الاستيقاظ", when: "حين أستيقظ من النوم", emoji: "1f305", img: null,
    items: [
      {text:"الْحَمْدُ للَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا، وَإِلَيْهِ النُّشُورُ", audio:"https://hisnmuslim.com/audio/ar/1.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"الْحَمْدُ لِلَّهِ الَّذِي عَافَانِي فِي جَسَدِي، وَرَدَّ عَلَيَّ رُوحِي، وَأَذِنَ لي بِذِكْرِهِ", audio:"https://hisnmuslim.com/audio/ar/3.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "sleep", kind: "hisn", title: "عند النوم", when: "قبل أن أنام في سريري", emoji: "1f634", img: null,
    items: [
      {text:"بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا", audio:"https://hisnmuslim.com/audio/ar/105.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ", audio:"https://hisnmuslim.com/audio/ar/104.mp3", repeat:1, ref:"حصن المسلم"},
      {text:"بِاسْمِكَ رَبِّي وَضَعْتُ جَنْبِي، وَبِكَ أَرْفَعُهُ، فَإِن أَمْسَكْتَ نَفْسِي فارْحَمْهَا، وَإِنْ أَرْسَلْتَهَا فَاحْفَظْهَا، بِمَا تَحْفَظُ بِهِ عِبَادَكَ الصَّالِحِينَ", audio:"https://hisnmuslim.com/audio/ar/102.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "eat_before", kind: "hisn", title: "قبل الطعام", when: "قبل أن آكل", emoji: "1f37d", img: null,
    items: [
      {text:"إِذَا أَكَلَ أَحَدُكُمْ طَعَاماً فَلْيَقُلْ بِسْمِ اللَّهِ، فَإِنْ نَسِيَ فِي أَوَّلِهِ فَلْيَقُلْ بسمِ اللَّهِ فِي أَوَّلِهِ وَآخِرِهِ", audio:"https://hisnmuslim.com/audio/ar/178.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "eat_after", kind: "hisn", title: "بعد الطعام", when: "بعد أن أنتهي من الأكل", emoji: "1f37d", img: null,
    items: [
      {text:"الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنِي هَذَا، وَرَزَقَنِيهِ، مِنْ غَيْرِ حَوْلٍ مِنِّي وَلاَ قُوَّةٍ", audio:"https://hisnmuslim.com/audio/ar/180.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "home_enter", kind: "hisn", title: "دخول المنزل", when: "حين أدخل بيتي", emoji: "1f3e0", img: null,
    items: [
      {text:"بِسْمِ اللَّهِ وَلَجْنَا، وَبِسْمِ اللَّهِ خَرَجْنَا، وَعَلَى اللَّهِ رَبِّنَا تَوَكَّلْنَا، ثُمَّ لِيُسَلِّمْ عَلَى أَهْلِهِ", audio:"https://hisnmuslim.com/audio/ar/18.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "home_leave", kind: "hisn", title: "الخروج من المنزل", when: "حين أخرج من بيتي", emoji: "1f3e0", img: null,
    items: [
      {text:"بِسْمِ اللَّهِ، تَوَكَّلْتُ عَلَى اللَّهِ، وَلَاَ حَوْلَ وَلَا قُوَّةَ إِلاَّ بِاللَّهِ", audio:"https://hisnmuslim.com/audio/ar/16.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "toilet_enter", kind: "hisn", title: "دخول الخلاء", when: "قبل دخول الحمّام", emoji: "1f6bd", img: null,
    items: [
      {text:"بِسْمِ اللَّهِ اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْخُبْثِ وَالْخَبائِث", audio:"https://hisnmuslim.com/audio/ar/10.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "toilet_exit", kind: "hisn", title: "الخروج من الخلاء", when: "بعد الخروج من الحمّام", emoji: "1f6bd", img: null,
    items: [
      {text:"غُفْرَانَكَ", audio:"https://hisnmuslim.com/audio/ar/11.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "ride", kind: "hisn", title: "دعاء الركوب", when: "حين أركب السيارة أو أي وسيلة سفر", emoji: "1f697", img: null,
    items: [
      {text:"بِسْمِ اللَّهِ، وَالْحَمْدُ للَّهِ ﴿سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ، وَإِنَّا إِلَى رَبِّنَا لَمُنقَلِبُونَ﴾، الْحَمْدُ لِلَّهِ، الْحَمْدُ لِلَّهِ، الْحَمْدُ لِلَّهِ، اللَّهُ أَكْبَرُ، اللَّهُ أَكْبَرُ، اللَّهُ أَكْبَرُ، سُبْحَانَكَ اللَّهُمَّ إِنِّي ظَلَمْتُ نَفْسِي فَاغْفِرْ لِي؛ فَإِنَّهُ لاَ يَغْفِرُ الذُّنُوبَ إِلاَّ أَنْتَ", audio:"https://hisnmuslim.com/audio/ar/206.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "morning", kind: "hisn", title: "أذكار الصباح", when: "في الصباح بعد أن أستيقظ", emoji: "2600", img: null,
    items: [
      {text:"رَضِيتُ بِاللَّهِ رَبَّاً، وَبِالْإِسْلاَمِ دِيناً، وَبِمُحَمَّدٍ صلى الله عليه وسلم نَبِيّاً", audio:"https://hisnmuslim.com/audio/ar/87.mp3", repeat:3, ref:"حصن المسلم"},
      {text:"بِسْمِ اللَّهِ الَّذِي لاَ يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلاَ فِي السّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ", audio:"https://hisnmuslim.com/audio/ar/86.mp3", repeat:3, ref:"حصن المسلم"},
      {text:"سُبْحَانَ اللَّهِ وَبِحَمْدِهِ: عَدَدَ خَلْقِهِ، وَرِضَا نَفْسِهِ، وَزِنَةَ عَرْشِهِ، وَمِدَادَ كَلِمَاتِهِ", audio:"https://hisnmuslim.com/audio/ar/94.mp3", repeat:3, ref:"حصن المسلم"},
      {text:"اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبَيِّنَا مُحَمَّدٍ", audio:"https://hisnmuslim.com/audio/ar/98.mp3", repeat:10, ref:"حصن المسلم"}
    ]
  },
  {
    id: "evening", kind: "hisn", title: "أذكار المساء", when: "في المساء قبل الغروب", emoji: "1f319", img: null,
    items: [
      {text:"رَضِيتُ بِاللَّهِ رَبَّاً، وَبِالْإِسْلاَمِ دِيناً، وَبِمُحَمَّدٍ صلى الله عليه وسلم نَبِيّاً", audio:"https://hisnmuslim.com/audio/ar/87.mp3", repeat:3, ref:"حصن المسلم"},
      {text:"بِسْمِ اللَّهِ الَّذِي لاَ يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلاَ فِي السّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ", audio:"https://hisnmuslim.com/audio/ar/86.mp3", repeat:3, ref:"حصن المسلم"},
      {text:"أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ", audio:"https://hisnmuslim.com/audio/ar/97.mp3", repeat:3, ref:"حصن المسلم"},
      {text:"اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبَيِّنَا مُحَمَّدٍ", audio:"https://hisnmuslim.com/audio/ar/98.mp3", repeat:10, ref:"حصن المسلم"}
    ]
  },
  {
    id: "mosque_enter", kind: "hisn", title: "دخول المسجد", when: "حين أدخل المسجد", emoji: "1f54c", img: null,
    items: [
      {text:"يَبْدَأُ بِرِجْلِهِ الْيُمْنَى، وَيَقُولُ: أَعُوذُ بِاللَّهِ العَظِيمِ، وَبِوَجْهِهِ الْكَرِيمِ، وَسُلْطَانِهِ الْقَدِيمِ، مِنَ الشَّيْطَانِ الرَّجِيمِ بِسْمِ اللَّهِ، وَالصَّلَاةُ وَالسَّلَامُ عَلَى رَسُولِ اللَّهِ اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ", audio:"https://hisnmuslim.com/audio/ar/20.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "mosque_exit", kind: "hisn", title: "الخروج من المسجد", when: "حين أخرج من المسجد", emoji: "1f54c", img: null,
    items: [
      {text:"يَبْدَأُ بِرِجْلِهِ الْيُسْرَى وَيَقُولُ: بِسْمِ اللَّهِ وَالصّلَاةُ وَالسَّلَامُ عَلَى رَسُولِ اللَّهِ، اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِك، اللَّهُمَّ اعْصِمْنِي مِنَ الشَّيْطَانِ الرَّجِيمِ", audio:"https://hisnmuslim.com/audio/ar/21.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "wear_clothes", kind: "hisn", title: "لبس الثوب", when: "حين ألبس ملابسي", emoji: "1f455", img: null,
    items: [
      {text:"الْحَمْدُ للَّهِ الَّذِي كَسَانِي هَذَا الثَّوْبَ وَرَزَقَنِيهِ مِنْ غَيْرِ حَوْلٍ مِنِّي وَلاَ قُوَّةٍ", audio:"https://hisnmuslim.com/audio/ar/5.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "sneeze", kind: "hisn", title: "عند العطاس", when: "حين أعطس", emoji: "1f927", img: null,
    items: [
      {text:"إِذَا عَطَسَ أَحَدُكُم فَلْيَقُلِ الْحَمْدُ لِلَّهِ، وَلْيَقُلْ لَهُ أَخُوهُ أَوْ صَاحِبُهُ: يَرْحَمُكَ اللَّهُ، فَإِذَا قَالَ لَهُ: يَرحَمُكَ اللَّهُ، فَلْيَقُلْ: يَهْدِيكُمُ اللَّهُ وَيُصْلِحُ بَالَكُمْ", audio:"https://hisnmuslim.com/audio/ar/188.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  },
  {
    id: "rain", kind: "hisn", title: "عند نزول المطر", when: "حين تمطر السماء", emoji: "1f327", img: null,
    items: [
      {text:"اللَّهُمَّ صَيِّباً نَافِعاً", audio:"https://hisnmuslim.com/audio/ar/172.mp3", repeat:1, ref:"حصن المسلم"}
    ]
  }
];

// kind 'hisn': text + hisnmuslim audio per item. kind 'quran': items carry {quran:{s,from,to}} references only.
export const KIDS_AZKAR = [...HISN_BASE, ...HISN_MORE, ...QURAN_AZKAR];

export const AZKAR_CREDIT = 'الأصوات: موقع حصن المسلم hisnmuslim.com';
