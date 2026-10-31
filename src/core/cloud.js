// Client for the noor-ai backend (Supabase Edge Function). The app signs in anonymously so every
// device gets its own identity and daily quota — no keys are ever shipped in the app.
// CONTRACT:
//   status({force}) -> { ok, providers:{gemini,groq,cerebras,openrouter,mistral,pollinations}, stt, sttEngine, tajweed, limits } | null (offline/unreachable)
//   cloudChat(messages, { mode:'fast'|'smart', signal }) -> { text, provider, model }      (throws CloudError)
//   cloudChatStream(messages, { mode, signal, onDelta(fullTextSoFar) }) -> { text, provider, model }   (SSE; throws CloudError)
//   transcribe(blob|base64, { mime, prompt, signal, fast })   -> { text, provider, model }      (throws CloudError)
//   tajweedReview(blob, { s, from, to, text, signal, detected[] })  -> { score, summary, mistakes[], tajweed[], advice[], plan[], provider }
//   CloudError has .code: 'offline' | 'auth' | 'rate_limited' | 'daily_limit' | 'no_provider' | 'bad_audio' | 'server' | 'timeout' | 'aborted'

export const SUPABASE_URL = 'https://xdrrrquzxoinqwknfrgt.supabase.co';
// Public (publishable) anon key — safe to ship; it only allows anonymous sign-in. Protected by RLS + per-user limits.
export const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkcnJycXV6eG9pbnF3a25mcmd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNTkzNTMsImV4cCI6MjEwNzgzNTM1M30.AP6KmxaymJ7JT-mD5si3Xe4mFJLCujUfEExJnBp9dHM';
const FN_URL = SUPABASE_URL + '/functions/v1/noor-ai';
const AUTH_KEY = 'noor.auth';

export class CloudError extends Error {
  // message is always user-facing Arabic so existing callers can show e.message directly
  constructor(code) { super(ERROR_TEXT[code] || ERROR_TEXT.server); this.code = code; }
}

const now = () => Math.floor(Date.now() / 1000);
function loadSession() { try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || null; } catch (e) { return null; } }
export function setSession(s) { saveSession(s); }
function saveSession(s) { try { s ? localStorage.setItem(AUTH_KEY, JSON.stringify(s)) : localStorage.removeItem(AUTH_KEY); } catch (e) {} }

async function authCall(path, body) {
  let r;
  try {
    r = await fetch(SUPABASE_URL + '/auth/v1/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY },
      body: JSON.stringify(body), signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
    });
  } catch (e) { throw new CloudError('offline'); }
  if (!r.ok) { const e = new CloudError('auth'); e.status = r.status; throw e; }
  const d = await r.json();
  if (!d.access_token) throw new CloudError('auth');
  return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || (now() + (d.expires_in || 3600)) };
}

let pending = null;
/** Returns a valid access token, creating an anonymous account on first use. */
export async function ensureSession(force = false) {
  const s = loadSession();
  if (!force && s && s.access_token && s.expires_at - now() > 90) return s.access_token;
  if (pending) return pending;
  pending = (async () => {
    try {
      if (s && s.refresh_token) {
        try { const n = await authCall('token?grant_type=refresh_token', { refresh_token: s.refresh_token }); saveSession(n); return n.access_token; }
        catch (e) {
          // Only a definitive rejection of the refresh token justifies a new identity (which would
          // drop family membership). Network errors / 5xx / 429 → keep the old session, report error.
          if (!(e.status === 400 || e.status === 401 || e.status === 403)) throw e;
        }
      }
      const n = await authCall('signup', { data: {} });
      saveSession(n); return n.access_token;
    } finally { pending = null; }
  })();
  return pending;
}

async function call(action, payload = {}, { signal, timeout = 45000 } = {}, retried = false) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new CloudError('offline');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort('timeout'), timeout);
  const onAbort = () => ctl.abort('aborted');
  if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); }
  try {
    let token;
    try {
      token = await Promise.race([
        ensureSession(),
        new Promise((_, rej) => ctl.signal.addEventListener('abort', () =>
          rej(new CloudError(ctl.signal.reason === 'aborted' ? 'aborted' : 'timeout')), { once: true }))
      ]);
    } catch (e) { throw e instanceof CloudError ? e : new CloudError('offline'); }
    let r;
    try {
      r = await fetch(FN_URL, {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action, ...payload })
      });
    } catch (e) {
      if (ctl.signal.aborted) throw new CloudError(ctl.signal.reason === 'aborted' ? 'aborted' : 'timeout');
      throw new CloudError('offline');
    }
    if (r.status === 401 && !retried) { await ensureSession(true).catch(() => {}); return call(action, payload, { signal, timeout }, true); }
    let d = null; try { d = await r.json(); } catch (e) {}
    if (!r.ok) {
      const code = d && d.error;
      const MAP = { no_provider: 'no_provider', bad_audio: 'bad_audio', not_found: 'not_found', bad_code: 'not_found', family_full: 'family_full', bad_name: 'bad_name' };
      throw new CloudError(r.status === 429 ? (code === 'daily_limit' ? 'daily_limit' : 'rate_limited')
        : MAP[code] || (r.status === 401 ? 'auth' : 'server'));
    }
    return d;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

let statusCache = null;
export async function status({ force = false } = {}) {
  if (!force && statusCache && Date.now() - statusCache.at < 10 * 60_000) return statusCache.d;
  try { const d = await call('status', {}, { timeout: 12000 }); statusCache = { d, at: Date.now() }; return d; }
  catch (e) { return null; }
}

/** Back-compat shape used by views: never throws; { ok:false } when unreachable. */
export async function cloudStatus(opts) {
  return (await status(opts)) || { ok: false, providers: {}, stt: false, tajweed: false, error: ERROR_TEXT.offline };
}

export function cloudChat(messages, { mode = 'fast', signal } = {}) {
  return call('chat', { messages, mode }, { signal, timeout: 60000 });
}

/** Streaming chat (SSE). onDelta(fullTextSoFar) fires as tokens arrive. First byte within 20 s, whole answer within 90 s. */
export async function cloudChatStream(messages, { mode = 'fast', signal, onDelta } = {}, retried = false) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new CloudError('offline');
  const ctl = new AbortController();
  let first = setTimeout(() => ctl.abort('timeout'), 20000);
  let idle = null; // inactivity timer (30 s), armed on the first received chunk of any kind (pings included)
  const total = setTimeout(() => ctl.abort('timeout'), 90000);
  const onAbort = () => ctl.abort('aborted');
  if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); }
  const abortErr = () => new CloudError(ctl.signal.reason === 'aborted' ? 'aborted' : 'timeout');
  try {
    let token;
    try {
      token = await Promise.race([
        ensureSession(),
        new Promise((_, rej) => ctl.signal.addEventListener('abort', () => rej(abortErr()), { once: true }))
      ]);
    } catch (e) { throw e instanceof CloudError ? e : new CloudError('offline'); }
    let r;
    try {
      r = await fetch(FN_URL, {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json', apikey: ANON_KEY, Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'chat', messages, mode, stream: true })
      });
    } catch (e) {
      if (ctl.signal.aborted) throw abortErr();
      throw new CloudError('offline');
    }
    if (r.status === 401 && !retried) {
      await ensureSession(true).catch(() => {});
      return cloudChatStream(messages, { mode, signal, onDelta }, true);
    }
    if (!r.ok) {
      let d = null; try { d = await r.json(); } catch (e) {}
      const code = d && d.error;
      throw new CloudError(r.status === 429 ? (code === 'daily_limit' ? 'daily_limit' : 'rate_limited')
        : code === 'no_provider' ? 'no_provider' : (r.status === 401 ? 'auth' : 'server'));
    }
    const type = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
    if (!/event-stream/i.test(type) || !r.body || !r.body.getReader) {
      // old backend (plain JSON): behave like cloudChat
      let d = null; try { d = await r.json(); } catch (e) {}
      const t = d && typeof d.text === 'string' ? d.text : '';
      if (!t) throw new CloudError('server');
      if (onDelta) onDelta(t);
      return { text: t, provider: d.provider, model: d.model };
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '', text = '', provider, model, err = null, gotByte = false, done = false;
    const line = ln => {
      if (!ln.startsWith('data:')) return; // also skips ':' comment lines (keepalive pings)
      const data = ln.slice(5).trim();
      if (!data) return;
      if (data === '[DONE]') { done = true; return; }
      let j; try { j = JSON.parse(data); } catch (e) { return; }
      if (j.error) { err = j.error; return; }
      if (j.provider) { provider = j.provider; model = j.model; return; }
      const c = j.choices && j.choices[0];
      const t = c && c.delta && c.delta.content;
      if (t) { text += t; if (onDelta) onDelta(text); }
    };
    try {
      while (!done) {
        const { done: end, value } = await reader.read();
        if (!gotByte) { gotByte = true; clearTimeout(first); }
        if (end) break;
        clearTimeout(idle); idle = setTimeout(() => ctl.abort('timeout'), 30000);
        buf += dec.decode(value, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop();
        for (const ln of lines) line(ln.trim());
      }
      if (buf) line(buf.trim());
    } catch (e) {
      if (!text) { if (ctl.signal.aborted) throw abortErr(); throw new CloudError('offline'); }
      // connection dropped after some text arrived: keep what we have
    }
    if (!text.trim()) throw new CloudError(err === 'no_provider' || !err ? 'no_provider' : 'server');
    return { text, provider, model };
  } finally {
    clearTimeout(first); clearTimeout(idle); clearTimeout(total);
    if (signal) signal.removeEventListener('abort', onAbort);
    try { ctl.abort('done'); } catch (e) {}
  }
}

/** Blob → base64 (no data: prefix). */
export function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

export async function transcribe(audio, { mime = 'audio/wav', prompt = '', signal, fast = false } = {}) {
  const b64 = typeof audio === 'string' ? audio : await blobToBase64(audio);
  // fast: backend tries whisper-large-v3-turbo first (lower latency for live sessions)
  return call('transcribe', { audio: b64, mime: (audio && audio.type) || mime, prompt: String(prompt).slice(0, 600), ...(fast ? { fast: true } : {}) }, { signal, timeout: 30000 });
}

export async function tajweedReview(blob, { s, from, to, text, signal, detected = [] } = {}) {
  const b64 = await blobToBase64(blob);
  return call('tajweed', { audio: b64, mime: blob.type || 'audio/wav', s, from, to, text: String(text).slice(0, 6000), detected: (Array.isArray(detected) ? detected : []).slice(0, 40) }, { signal, timeout: 120000 });
}

export const ERROR_TEXT = {
  offline: 'لا يوجد اتصال بالإنترنت',
  auth: 'تعذّر الاتصال بخادم نور، حاول مرة أخرى',
  rate_limited: 'طلبات كثيرة في وقت قصير، انتظر دقيقة',
  daily_limit: 'وصلت للحد اليومي لهذه الخدمة، تتجدد غداً',
  no_provider: 'خدمات الذكاء مشغولة الآن، حاول بعد قليل',
  bad_audio: 'التسجيل غير صالح أو طويل جداً',
  server: 'حدث خطأ في الخادم، حاول مرة أخرى',
  timeout: 'انتهت مهلة الاتصال، تحقق من الإنترنت',
  aborted: 'أُلغي الطلب',
  not_found: 'رمز الدائرة غير صحيح',
  family_full: 'الدائرة ممتلئة (٣٠ عضواً)',
  bad_name: 'أدخل اسماً صالحاً'
};
export const errText = e => ERROR_TEXT[e && e.code] || 'تعذّر الاتصال، تحقق من الإنترنت';

/** Family circle operations: 'create' {name, member, stats} | 'join' {code, member, stats} | 'sync' {stats, member?} | 'leave' | 'board'. */
export function familyOp(op, payload = {}) {
  return call('family', { op, ...payload }, { timeout: 20000 });
}
