// Unified speech recognition: Capacitor native plugin on Android, Web Speech API in browsers.
import { isNative } from './platform.js';

const LANG = 'ar-SA';
const webCtor = () => (typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null);

async function nativePlugin() {
  const m = await import('@capacitor-community/speech-recognition');
  return m.SpeechRecognition;
}

/** 'native' | 'web' | 'none' */
export async function speechSupport() {
  try {
    if (isNative()) {
      const SR = await nativePlugin();
      const r = await SR.available();
      if (r && r.available) return 'native';
    }
  } catch (e) { /* fall through */ }
  return webCtor() ? 'web' : 'none';
}

/**
 * Start a continuous listening session. onText(fullTranscript) gets the whole session text
 * (committed + current partial). onState('listening'|'stopped'), onError('permission'|'unsupported'|'error').
 * Returns stop().
 */
export async function startListening({ onText = () => {}, onState = () => {}, onError = () => {} } = {}) {
  const mode = await speechSupport();
  if (mode === 'none') { onError('unsupported'); return () => {}; }
  return mode === 'native' ? startNative({ onText, onState, onError }) : startWeb({ onText, onState, onError });
}

const join = (a, b) => (a && b ? a + ' ' + b : a || b || '');

async function startNative({ onText, onState, onError }) {
  const SR = await nativePlugin();
  let active = true, committed = '', cur = '', starting = false, restartTimer = null;
  const handles = [];

  try {
    const perm = await SR.requestPermissions();
    if (perm && perm.speechRecognition && perm.speechRecognition !== 'granted') { onError('permission'); return () => {}; }
  } catch (e) { onError('permission'); return () => {}; }

  const emitText = () => onText(join(committed, cur));
  const commit = () => { if (cur) { committed = join(committed, cur); cur = ''; } };

  async function begin() {
    if (!active || starting) return;
    starting = true;
    try {
      await SR.start({ language: LANG, partialResults: true, popup: false, maxResults: 1 });
      onState('listening');
    } catch (e) {
      if (active) { onError('error'); }
    } finally { starting = false; }
  }
  function scheduleRestart() {
    if (!active) return;
    commit(); emitText();
    clearTimeout(restartTimer);
    restartTimer = setTimeout(begin, 250);
  }

  try {
    handles.push(await SR.addListener('partialResults', d => {
      if (!active) return;
      const t = d && d.matches && d.matches[0];
      if (typeof t === 'string') { cur = t; emitText(); }
    }));
  } catch (e) { /* ignore */ }
  try {
    handles.push(await SR.addListener('listeningState', d => {
      if (!active || !d) return;
      if (d.status === 'stopped') scheduleRestart();
      else onState('listening');
    }));
  } catch (e) { /* event not available */ }

  begin();
  // Watchdog: Android's recognizer can end on silence/errors without a 'stopped' event.
  const watchdog = setInterval(async () => {
    if (!active || starting) return;
    try { const r = await SR.isListening(); if (r && r.listening === false) scheduleRestart(); } catch (e) {}
  }, 2500);

  return function stop() {
    if (!active) return;
    active = false;
    clearInterval(watchdog);
    clearTimeout(restartTimer);
    onState('stopped');
    Promise.resolve().then(() => SR.stop()).catch(() => {});
    handles.forEach(h => { try { h.remove(); } catch (e) {} });
  };
}

function startWeb({ onText, onState, onError }) {
  const Ctor = webCtor();
  let active = true, committed = '', cur = '', rec = null, restartTimer = null;

  const emitText = () => onText(join(committed, cur));

  function make() {
    const r = new Ctor();
    r.lang = LANG; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onstart = () => onState('listening');
    r.onresult = ev => {
      let t = '';
      for (let i = 0; i < ev.results.length; i++) t = join(t, ev.results[i][0].transcript.trim());
      cur = t; emitText();
    };
    r.onerror = ev => {
      const err = ev && ev.error;
      if (err === 'not-allowed' || err === 'service-not-allowed') { active = false; onState('stopped'); onError('permission'); }
      else if (err === 'audio-capture') { active = false; onState('stopped'); onError('error'); }
      // 'no-speech' / 'aborted' / 'network': let onend restart
    };
    r.onend = () => {
      if (cur) { committed = join(committed, cur); cur = ''; emitText(); }
      if (active) { clearTimeout(restartTimer); restartTimer = setTimeout(begin, 200); }
      else onState('stopped');
    };
    return r;
  }
  function begin() {
    if (!active) return;
    try { rec = make(); rec.start(); } catch (e) { active = false; onState('stopped'); onError('error'); }
  }
  begin();

  return function stop() {
    if (!active && !rec) return;
    active = false;
    clearTimeout(restartTimer);
    try { rec && rec.stop(); } catch (e) {}
    onState('stopped');
  };
}
