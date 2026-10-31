// Further authentic adhkar and du'a (the remaining occasions of Hisn al-Muslim). Each text is taken from the hadith
// collection named in its source; Quran du'a are references: { quran: { s, from, to } }. The same checks as azkar-more.js
// apply (tests/azkar.test.js). Proof-read the wording against a printed Hisn al-Muslim before a release.

export const MORE2_CATEGORIES = [
  { id: 'quran-dua', title: 'أدعية من القرآن الكريم', icon: '📖' },
  { id: 'fear', title: 'الخوف والفزع والعدو', icon: '🛡️' },
  { id: 'social', title: 'التهنئة والعطاس والدعاء للمسلم', icon: '🤝' },
  { id: 'debt', title: 'الدَّين والرزق والغنى', icon: '💰' },
  { id: 'ramadan', title: 'رمضان والصيام', icon: '🌙' },
  { id: 'rain-prayer', title: 'الاستسقاء', icon: '🌱' }
];

export const MORE2_AZKAR = {
  'quran-dua': [
    { quran: { s: 2, from: 201, to: 201 }, count: 1, source: 'سورة البقرة، من أدعية القرآن', virtue: 'من أكثر الدعاء بها' },
    { quran: { s: 3, from: 8, to: 8 }, count: 1, source: 'سورة آل عمران، من أدعية القرآن' },
    { quran: { s: 3, from: 147, to: 147 }, count: 1, source: 'سورة آل عمران، من أدعية القرآن' },
    { quran: { s: 7, from: 23, to: 23 }, count: 1, source: 'سورة الأعراف، من أدعية القرآن' },
    { quran: { s: 14, from: 40, to: 41 }, count: 1, source: 'سورة إبراهيم، من أدعية القرآن' },
    { quran: { s: 17, from: 24, to: 24 }, count: 1, source: 'سورة الإسراء، الدعاء للوالدين' },
    { quran: { s: 20, from: 25, to: 28 }, count: 1, source: 'سورة طه، دعاء موسى عليه السلام' },
    { quran: { s: 21, from: 87, to: 87 }, count: 1, source: 'سورة الأنبياء، دعاء ذي النون', virtue: 'ما دعا به مسلم في شيء إلا استجيب له' },
    { quran: { s: 25, from: 74, to: 74 }, count: 1, source: 'سورة الفرقان، من أدعية القرآن' },
    { quran: { s: 59, from: 10, to: 10 }, count: 1, source: 'سورة الحشر، من أدعية القرآن' }
  ],
  fear: [
    {
      text: 'أعوذ بكلمات الله التامة من غضبه وعقابه، وشر عباده، ومن همزات الشياطين وأن يحضرون',
      count: 1,
      source: 'رواه أبو داود والترمذي',
      virtue: 'تُقال عند الفزع في النوم'
    },
    {
      text: 'اللهم إنا نجعلك في نحورهم، ونعوذ بك من شرورهم',
      count: 1,
      source: 'رواه أبو داود',
      virtue: 'عند الخوف من العدو'
    },
    {
      quran: { s: 3, from: 173, to: 173 },
      count: 1,
      source: 'رواه البخاري',
      virtue: 'قولها إبراهيم عليه السلام حين أُلقي في النار'
    },
    {
      text: 'اللهم إني أعوذ بك من جهد البلاء، ودرك الشقاء، وسوء القضاء، وشماتة الأعداء',
      count: 1,
      source: 'متفق عليه'
    }
  ],
  social: [
    {
      text: 'بارك الله فيك',
      count: 1,
      source: 'رواه الترمذي',
      virtue: 'تُقال لمن أحسن إليك أو هنأك، والرد: وفيك بارك الله'
    },
    {
      text: 'جزاك الله خيراً',
      count: 1,
      source: 'رواه الترمذي',
      virtue: 'لمن صنع إليك معروفاً'
    },
    {
      text: 'ولك بمثل',
      count: 1,
      source: 'رواه مسلم',
      virtue: 'رداً على من دعا لك بالغيب: آمين ولك بمثل'
    },
    {
      text: 'الحمد لله',
      count: 1,
      source: 'رواه البخاري',
      virtue: 'يقولها العاطس'
    },
    {
      text: 'يرحمك الله',
      count: 1,
      source: 'رواه البخاري',
      virtue: 'يقولها من سمع العاطس يحمد الله'
    },
    {
      text: 'يهديكم الله ويصلح بالكم',
      count: 1,
      source: 'رواه أبو داود والترمذي',
      virtue: 'رد العاطس'
    }
  ],
  debt: [
    {
      text: 'اللهم اكفني بحلالك عن حرامك، وأغنني بفضلك عمّن سواك',
      count: 1,
      source: 'رواه الترمذي',
      virtue: 'دعاء قضاء الدين والغنى'
    }
  ],
  ramadan: [
    {
      text: 'اللهم إنك عفوٌّ تحب العفو فاعفُ عني',
      count: 1,
      source: 'رواه الترمذي',
      virtue: 'دعاء ليلة القدر'
    }
  ],
  'rain-prayer': [
    {
      text: 'اللهم أغثنا، اللهم أغثنا، اللهم أغثنا',
      count: 1,
      source: 'متفق عليه',
      virtue: 'دعاء الاستسقاء'
    },
    {
      text: 'اللهم اسقنا غيثاً مغيثاً، هنيئاً مريئاً، غير ضار ولا آجل',
      count: 1,
      source: 'رواه أبو داود',
      virtue: 'دعاء الاستسقاء'
    }
  ]
};
