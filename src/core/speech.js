// Unified speech recognition: Capacitor native plugin on Android, Web Speech API in browsers.
import { isNative } from './platform.js';
import { registerPlugin } from '@capacitor/core';

// App's own continuous recognizer (scripts/android/NoorSpeechPlugin.java); older APKs fall back to the community plugin.
const NoorSpeech = registerPlugin('NoorSpeech');
let noorOk = null;
async function hasNoorSpeech() {
  if (noorOk !== null) return noorOk;
  try { const r = await NoorSpeech.available(); noorOk = !!(r && r.available && r.version); } catch (e) { noorOk = false; }
  return noorOk;
}

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
      if (await hasNoorSpeech()) return 'native';
      const SR = await nativePlugin();
      const r = await SR.available();
      if (r && r.available) return 'native';
    }
  } catch (e) { /* fall through */ }
  return webCtor() ? 'web' : 'none';
}

/**
 * Start a continuous listening session. onText(fullTranscript, isFinal) gets the whole session text
 * (committed + current partial) on EVERY partial/interim result; isFinal is true when the recognizer
 * committed the segment. onState('listening'|'stopped'), onError('permission'|'unsupported'|'error').
 * pick(fullCandidates[]) -> index: optional chooser among the recognizer's alternatives (e.g. the one
 * that best matches the expected next words). Returns stop().
 */
export async function startListening({ onText = () => {}, onState = () => {}, onError = () => {}, pick = null, onLevel = null } = {}) {
  const mode = await speechSupport();
  if (mode === 'none') { onError('unsupported'); return () => {}; }
  if (mode === 'native' && await hasNoorSpeech()) return startNoor({ onText, onState, onError, pick, onLevel });
  return mode === 'native' ? startNative({ onText, onState, onError, pick }) : startWeb({ onText, onState, onError, pick });
}

/**
 * NoorSpeech: segments are restarted natively with no gap. Each segment keeps its own text; a final result
 * replaces its segment's partial (never appended twice).
 */
async function startNoor({ onText, onState, onError, pick, onLevel }) {
  let active = true;
  const segs = new Map();          // seg id -> text (insertion order = speaking order)
  const handles = [];
  try {
    let perm = await NoorSpeech.checkPermissions();
    if (!perm || perm.microphone !== 'granted') perm = await NoorSpeech.requestPermissions();
    if (!perm || perm.microphone !== 'granted') { onError('permission'); return () => {}; }
  } catch (e) { onError('permission'); return () => {}; }

  const fullBefore = seg => { let t = ''; for (const [k, v] of segs) { if (k === seg) break; t = join(t, v); } return t; };
  const fullText = () => { let t = ''; for (const v of segs.values()) t = join(t, v); return t; };
  const onResult = fin => d => {
    if (!active || !d) return;
    const seg = d.seg | 0;
    const m = Array.isArray(d.matches) ? d.matches : [];
    const t = choose(m, fullBefore(seg), pick);
    if (!t && !fin) return;
    if (!t && fin && segs.has(seg)) { onText(fullText(), true); return; }   // empty final: keep the partial
    if (segs.get(seg) === t && !fin) return;
    segs.set(seg, t);
    onText(fullText(), fin);
  };
  try {
    handles.push(await NoorSpeech.addListener('partial', onResult(false)));
    handles.push(await NoorSpeech.addListener('final', onResult(true)));
    handles.push(await NoorSpeech.addListener('state', d => { if (active && d) onState(d.status === 'stopped' ? 'stopped' : 'listening'); }));
    handles.push(await NoorSpeech.addListener('error', d => {
      if (!active || !d || !d.fatal) return;
      active = false;
      onError(d.code === 'permission' ? 'permission' : 'error');
    }));
    if (onLevel) handles.push(await NoorSpeech.addListener('level', d => { if (active && d) onLevel(+d.v || 0); }));
    await NoorSpeech.start({ language: LANG, maxResults: 3 });
  } catch (e) {
    active = false;
    handles.forEach(h => { try { h.remove(); } catch (er) {} });
    onError(e && /permission/.test(String(e.message || e.code)) ? 'permission' : 'error');
    return () => {};
  }
  return function stop() {
    if (!active) { handles.forEach(h => { try { h.remove(); } catch (e) {} }); return; }
    active = false;
    onState('stopped');
    NoorSpeech.stop().catch(() => {});
    handles.forEach(h => { try { h.remove(); } catch (e) {} });
  };
}

const join = (a, b) => (a && b ? a + ' ' + b : a || b || '');

/** Pick the best alternative (by the caller's chooser) — falls back to the first one. */
function choose(alts, prefix, pick) {
  const list = alts.map(a => String(a || '').trim()).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1 || typeof pick !== 'function') return list[0];
  try {
    const i = pick(list.map(a => join(prefix, a)));
    return list[i >= 0 && i < list.length ? i : 0];
  } catch (e) { return list[0]; }
}

async function startNative({ onText, onState, onError, pick }) {
  const SR = await nativePlugin();
  let active = true, committed = '', cur = '', starting = false, restartTimer = null;
  const handles = [];

  try {
    const perm = await SR.requestPermissions();
    if (perm && perm.speechRecognition && perm.speechRecognition !== 'granted') { onError('permission'); return () => {}; }
  } catch (e) { onError('permission'); return () => {}; }

  const emitText = (fin = false) => onText(join(committed, cur), fin);
  const commit = () => { if (cur) { committed = join(committed, cur); cur = ''; return true; } return false; };

  async function begin() {
    if (!active || starting) return;
    clearTimeout(restartTimer);
    if (commit()) emitText(true);
    starting = true;
    try {
      // partialResults streams hypotheses (~200 ms); popup:false is required for partials on Android.
      await SR.start({ language: LANG, partialResults: true, popup: false, maxResults: 3 });
      onState('listening');
    } catch (e) {
      if (active) { onError('error'); }
    } finally { starting = false; }
  }
  function scheduleRestart() {
    if (!active) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(begin, 60);
  }

  try {
    handles.push(await SR.addListener('partialResults', d => {
      if (!active) return;
      const m = d && Array.isArray(d.matches) ? d.matches : [];
      const t = choose(m, committed, pick);
      if (t && t !== cur) { cur = t; emitText(); }
    }));
  } catch (e) { /* ignore */ }
  try {
    handles.push(await SR.addListener('listeningState', d => {
      if (!active || !d) return;
      if (d.status === 'stopped') { if (commit()) emitText(true); scheduleRestart(); }
      else onState('listening');
    }));
  } catch (e) { /* event not available */ }

  begin();
  // Watchdog: Android's recognizer can end on silence/errors without a 'stopped' event.
  const watchdog = setInterval(async () => {
    if (!active || starting) return;
    try { const r = await SR.isListening(); if (active && !starting && r && r.listening === false) scheduleRestart(); } catch (e) {}
  }, 800);

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

function startWeb({ onText, onState, onError, pick }) {
  const Ctor = webCtor();
  let active = true, committed = '', cur = '', rec = null, restartTimer = null;

  const emitText = (fin = false) => onText(join(committed, cur), fin);

  function make() {
    const r = new Ctor();
    r.lang = LANG; r.continuous = true; r.interimResults = true; r.maxAlternatives = 3;
    r.onstart = () => onState('listening');
    r.onresult = ev => {
      let t = '';
      const n = ev.results.length;
      for (let i = 0; i < n - 1; i++) t = join(t, String(ev.results[i][0].transcript || '').trim());
      const lastRes = n ? ev.results[n - 1] : null;
      if (lastRes) {
        const alts = [];
        for (let k = 0; k < lastRes.length; k++) alts.push(lastRes[k].transcript);
        t = join(t, choose(alts, join(committed, t), pick));
      }
      cur = t; emitText(!!(lastRes && lastRes.isFinal));
    };
    r.onerror = ev => {
      const err = ev && ev.error;
      if (err === 'not-allowed' || err === 'service-not-allowed') { active = false; onState('stopped'); onError('permission'); }
      else if (err === 'audio-capture') { active = false; onState('stopped'); onError('error'); }
      // 'no-speech' / 'aborted' / 'network': let onend restart
    };
    r.onend = () => {
      if (cur) { committed = join(committed, cur); cur = ''; emitText(true); }
      if (active) { clearTimeout(restartTimer); restartTimer = setTimeout(begin, 40); }
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
