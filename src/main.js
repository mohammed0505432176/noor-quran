// App shell: router, bottom navigation, global event wiring.
// CONTRACT for views: each file in src/views exports default { render(el, params) }
//   - el: the <main> element to fill (view owns its innerHTML)
//   - params: { id: string|undefined (path segment after the route name), q: URLSearchParams }
//   - render may return a cleanup function, called when navigating away.
// Navigation: any element with data-go="route/id?x=1" navigates on click. Or call go('route/id').
import '@fontsource/amiri-quran/400.css';
import '@fontsource/amiri/400.css';
import '@fontsource/amiri/700.css';
import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/500.css';
import '@fontsource/tajawal/700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/mushaf.css';
import './styles/reader.css';
import './styles/kids.css';
import './styles/prayer.css';
import './styles/hifz.css';
import { S, on } from './core/store.js';
import { icon, celebrate, toast, keepFocusVisible } from './ui.js';
import { loadQuran } from './core/quran.js';
import { initSync, initNativeReturn } from './core/sync.js';
import { showWelcome } from './core/welcome.js';

const ROUTES = {
  home: () => import('./views/home.js'),
  mushaf: () => import('./views/mushaf.js'),       // surah/juz index; mushaf/<s>?a=<ayah> opens reader
  search: () => import('./views/search.js'),
  recite: () => import('./views/recite.js'),       // recite/<s>?from=&to= starts session
  review: () => import('./views/review.js'),       // spaced-repetition hifz review
  prayer: () => import('./views/prayer.js'),
  qibla: () => import('./views/qibla.js'),
  ai: () => import('./views/ai.js'),               // ai?s=&a= opens with ayah context
  stats: () => import('./views/stats.js'),         // reports + achievements
  azkar: () => import('./views/azkar.js'),
  tasbeeh: () => import('./views/tasbeeh.js'),
  train: () => import('./views/train.js'),          // memorization drills
  family: () => import('./views/family.js'),        // family circle board & challenges
  recordings: () => import('./views/recordings.js'),// my saved recitations
  kids: () => import('./views/kids.js'),           // kids corner: kids/<azkar|letters|quran|quiz>/<id>
  hifz: () => import('./views/hifz.js'),           // memorization tracker + goals
  more: () => import('./views/more.js'),
  settings: () => import('./views/settings.js')
};
const TABS = [['home', 'home', 'الرئيسية'], ['mushaf', 'book', 'المصحف'], ['recite', 'mic', 'التسميع'], ['prayer', 'mosque', 'الصلاة'], ['more', 'grid', 'المزيد']];
const TAB_OF = { search: 'mushaf', train: 'recite', family: 'more', recordings: 'recite', review: 'more', hifz: 'more', qibla: 'prayer', ai: 'more', stats: 'more', azkar: 'more', kids: 'more', tasbeeh: 'more', settings: 'more' };

const main = document.getElementById('app');
const nav = document.getElementById('tabs');
let cleanup = null, seq = 0;

export function go(path) { const h = '#/' + path.replace(/^#?\/?/, ''); if (location.hash === h) route(); else location.hash = h; }
window.noorGo = go;

function parse() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [p, qs] = raw.split('?');
  const [name, id] = p.split('/');
  return { name: ROUTES[name] ? name : 'home', id, q: new URLSearchParams(qs || '') };
}

async function route() {
  const my = ++seq;
  const { name, id, q } = parse();
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) {} }
  cleanup = null;
  document.querySelectorAll('.sheet-wrap').forEach(w => w.remove()); // never leave a sheet over the next page
  const tab = TAB_OF[name] || name;
  nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.go === tab));
  document.body.dataset.route = name;
  document.body.classList.remove('rd-mode'); // the reader re-adds it (full-screen, no tab bar)
  try {
    const mod = await ROUTES[name]();
    if (my !== seq) return;
    main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter');
    main.innerHTML = '';
    const c = await mod.default.render(main, { id, q });
    if (my !== seq) { if (typeof c === 'function') { try { c(); } catch (e) {} } return; }
    cleanup = c;
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="card empty"><p>حدث خطأ أثناء فتح الصفحة.</p><button class="btn" data-go="home">العودة للرئيسية</button></div>`;
  }
}

function applyTheme() {
  const t = S.settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  document.documentElement.style.setProperty('--mushaf-size', S.settings.fontSize + 'px');
}

function init() {
  nav.innerHTML = TABS.map(([r, ic, label]) => `<button data-go="${r}" aria-label="${label}">${icon(ic, 23)}<span>${label}</span></button>`).join('');
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-go]');
    if (t) { e.preventDefault(); go(t.dataset.go); }
  });
  window.addEventListener('hashchange', route);
  on('badge', b => celebrate(b.icon, 'إنجاز جديد: ' + b.title, b.desc));
  on('goal', () => celebrate('🎯', 'حققت هدف اليوم', 'بارك الله فيك، استمر'));
  on('change', applyTheme);
  applyTheme();
  loadQuran().catch(() => toast('تعذر تحميل نص المصحف'));
  initSync(toast);
  route();
  const openWidgetRoute = () => import('./core/widget.js').then(w => w.consumeWidgetRoute()).then(r => { if (r === 'prayer') go('prayer'); }).catch(() => {});
  openWidgetRoute();
  (async () => {
    await initNativeReturn(toast).catch(() => {});
    keepFocusVisible();
    showWelcome();
  })();
  // Native extras: status bar + reschedule prayer alerts on launch
  import('./core/platform.js').then(async ({ isNative }) => {
    if (!isNative()) return;
    try { const { StatusBar, Style } = await import('@capacitor/status-bar'); await StatusBar.setStyle({ style: Style.Dark }); await StatusBar.setBackgroundColor({ color: '#06120d' }); } catch (e) {}
    try {
      const { App } = await import('@capacitor/app');
      App.addListener('resume', () => { openWidgetRoute(); import('./core/prayer.js').then(p => p.startAdhanWatcher()).catch(() => {}); });
      App.addListener('backButton', ({ canGoBack }) => {
        if (document.getElementById('adhan-ov')) { import('./core/prayer.js').then(p => p.stopAdhan()); return; }
        const s = document.querySelector('.sheet-wrap.open');
        if (s && s.close) return s.close();
        const c = document.querySelector('.celebrate'); if (c) return c.remove();
        if (canGoBack && location.hash && location.hash !== '#/home') history.back(); else App.exitApp();
      });
    } catch (e) {}
  });
  import('./core/prayer.js').then(p => { p.startAdhanWatcher(); /* startAdhanWatcher already triggers refreshSchedule on cold start */ }).catch(() => {});
  import('./core/widget.js').then(w => w.updatePrayerWidget()).catch(() => {});
  import('./core/family.js').then(f => f.startFamilySync && f.startFamilySync()).catch(() => {});
  const sp = document.getElementById('splash');
  if (sp) { const rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; setTimeout(() => { sp.classList.add('hide'); setTimeout(() => sp.remove(), 650); }, rm ? 500 : 1750); }
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor?.isNativePlatform?.()) {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
  }
}
init();
