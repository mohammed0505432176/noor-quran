// Client for the "noor-ai" backend (Supabase Edge Function). The backend holds the AI provider keys
// (Gemini, Groq, OpenRouter) so no secret ever ships inside the app or the public repo.
// CONTRACT:
//   cloudStatus()                                  -> { ok, providers:{gemini,groq,openrouter}, stt, tajweed }
//   cloudChat(messages, { signal, mode })          -> { text, provider, model }      mode: 'fast' | 'smart'
//   transcribe(blob, { prompt, signal })           -> { text, provider }            Quran-aware speech-to-text
//   tajweedReview(blob, { s, from, to, text, signal }) -> { score, summary, mistakes[], tajweed[], advice, provider }
// All functions throw Error with an Arabic message on failure.

export const CLOUD = {
  url: 'https://xdrrrquzxoinqwknfrgt.supabase.co/functions/v1/noor-ai',
  appToken: 'noor-family-2026'
};

async function call(action, payload = {}, { signal, timeout = 60000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  const onAbort = () => ctl.abort();
  if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
  try {
    const r = await fetch(CLOUD.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-noor-app': CLOUD.appToken },
      body: JSON.stringify({ action, ...payload }),
      signal: ctl.signal
    });
    let data = null;
    try { data = await r.json(); } catch (e) {}
    if (!r.ok || !data || data.error) {
      const code = data && data.error;
      if (r.status === 429 || code === 'rate_limited') throw new Error('الخدمة مشغولة الآن، حاول بعد قليل');
      if (code === 'no_provider') throw new Error('خدمة الذكاء غير متاحة حالياً');
      throw new Error('تعذّر الاتصال بخادم نور');
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError' && signal && signal.aborted) throw e;
    if (e.name === 'AbortError') throw new Error('انتهت مهلة الاتصال بخادم نور');
    if (/^[؀-ۿ]/.test(e.message)) throw e;
    throw new Error('تعذّر الاتصال بخادم نور، تحقق من الإنترنت');
  } finally {
    clearTimeout(t);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

let statusCache = null, statusAt = 0;
export async function cloudStatus({ force = false } = {}) {
  if (!force && statusCache && Date.now() - statusAt < 5 * 60e3) return statusCache;
  try { statusCache = await call('status', {}, { timeout: 12000 }); }
  catch (e) { statusCache = { ok: false, providers: {}, stt: false, tajweed: false, error: e.message }; }
  statusAt = Date.now();
  return statusCache;
}

export function cloudChat(messages, { signal, mode = 'fast' } = {}) {
  return call('chat', { messages, mode }, { signal, timeout: 80000 });
}

export async function transcribe(blob, { prompt = '', signal } = {}) {
  const audio = await blobToBase64(blob);
  return call('transcribe', { audio, mime: blob.type || 'audio/webm', prompt }, { signal, timeout: 30000 });
}

export async function tajweedReview(blob, { s, from, to, text, signal } = {}) {
  const audio = await blobToBase64(blob);
  return call('tajweed', { audio, mime: blob.type || 'audio/webm', s, from, to, text }, { signal, timeout: 120000 });
}
