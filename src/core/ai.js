// AI assistant core: OpenAI-compatible chat (streaming), tafsir fetch, ayah explanation, hifz plan.
import { S } from './store.js';
import { cloudChat } from './cloud.js';
import { loadQuran, ayah as ayahText, surahName } from './quran.js';

// Verified 2026-10-21 against https://github.com/pollinations/pollinations/blob/master/APIDOCS.md :
// "Advanced Text Generation (OpenAI Compatible)" = POST https://text.pollinations.ai/openai, model 'openai'.
// Works anonymously (no key, "Anonymous" tier) but rate-limited (~1 request / 15s).
export const FREE_URL = 'https://text.pollinations.ai/openai';
export const FREE_MODEL = 'openai';
const TAFSIR_URL = 'https://api.alquran.cloud/v1/ayah';
const TIMEOUT_MS = 45000;
const ERR_MSG = 'تعذّر الاتصال بالمساعد، تحقق من الإنترنت أو إعدادات الذكاء';

export const SYSTEM = `أنت "نور"، رفيق لطيف لتعلّم القرآن الكريم لعائلة عربية.
أجب بالعربية الفصحى الواضحة وبفقرات قصيرة.
في معاني الآيات اعتمد على التفاسير المعتبرة (الميسر، ابن كثير، السعدي) واذكر أيّها اعتمدت؛ وإذا وُجد مقتطف تفسير في الرسالة فابنِ إجابتك عليه.
لا تختلق آيات ولا أحاديث أبداً. عند الاستشهاد بالقرآن انقل فقط النص الوارد في المحادثة، وإلا فأشر إلى الآية برقمها (سورة:آية).
لا تُصدر فتاوى في المسائل الفقهية الخلافية؛ اعرض الأقوال الرئيسة باختصار وانصح بسؤال عالم ثقة.
ساعد في خطط الحفظ وأساسيات التجويد والتحفيز.
حافظ على نبرة محترمة ودافئة.`;

function providerConfig() {
  const ai = (S.settings && S.settings.ai) || {};
  if (ai.provider === 'custom' && ai.baseUrl) {
    return {
      url: `${ai.baseUrl.replace(/\/$/, '')}/chat/completions`,
      model: ai.model || 'gpt-4o-mini',
      headers: ai.apiKey ? { Authorization: `Bearer ${ai.apiKey}` } : {},
      custom: true
    };
  }
  return { url: FREE_URL, model: FREE_MODEL, headers: {} };
}

const CLOUD_NAMES = { gemini: 'Gemini', groq: 'Groq', cerebras: 'Cerebras', nvidia: 'NVIDIA', openrouter: 'OpenRouter', mistral: 'Mistral', cloudflare: 'Cloudflare', cohere: 'Cohere', pollinations: 'Pollinations' };
let lastLabel = '';
/** Short Arabic/Latin label of who answered the last chat() call. */
export function lastProvider() { return lastLabel; }

function abortErr() { const err = new Error('aborted'); err.name = 'AbortError'; return err; }

/** Send chat. Returns final assistant text. onDelta(textSoFar) is called while streaming (once with full text in auto mode). */
export async function chat(messages, { signal, onDelta, mode = 'fast' } = {}) {
  const ai = (S.settings && S.settings.ai) || {};
  const provider = ai.provider || 'auto';
  if (provider === 'auto') {
    try {
      const r = await cloudChat([{ role: 'system', content: SYSTEM }, ...messages], { signal, mode });
      const text = ((r && r.text) || '').trim();
      if (!text) throw new Error('empty');
      lastLabel = CLOUD_NAMES[String(r.provider || '').toLowerCase()] || r.provider || 'السحابة';
      if (onDelta) onDelta(text);
      return text;
    } catch (e) {
      if (signal && signal.aborted) throw abortErr();
      /* backend failed: fall through to the free endpoint */
    }
  }
  const cfg = providerConfig();
  const text = await directChat(cfg, messages, { signal, onDelta });
  lastLabel = cfg.custom ? 'مخصص' : 'المجاني';
  return text;
}

async function directChat(cfg, messages, { signal, onDelta } = {}) {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', onAbort); }
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json', ...cfg.headers },
      body: JSON.stringify({ model: cfg.model, stream: true, messages: [{ role: 'system', content: SYSTEM }, ...messages] }),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error('http ' + res.status);
    const type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    let text = '';
    if (/event-stream/i.test(type) && res.body && res.body.getReader) {
      text = await readSSE(res.body, onDelta);
    } else {
      const raw = await res.text();
      text = /^\s*data:/.test(raw) ? parseSSEText(raw, onDelta) : extractJson(raw);
      if (onDelta && text) onDelta(text);
    }
    text = (text || '').trim();
    if (!text) throw new Error('empty');
    return text;
  } catch (e) {
    if (signal && signal.aborted && !timedOut) throw abortErr();
    throw new Error(ERR_MSG);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

function extractJson(raw) {
  const j = JSON.parse(raw);
  return (j.choices && j.choices[0] && ((j.choices[0].message && j.choices[0].message.content) || j.choices[0].text)) || '';
}

// Handle one SSE line; returns delta string or ''.
function sseDelta(line) {
  if (!line.startsWith('data:')) return '';
  const data = line.slice(5).trim();
  if (!data || data === '[DONE]') return '';
  try {
    const j = JSON.parse(data);
    const c = j.choices && j.choices[0];
    return (c && ((c.delta && c.delta.content) || (c.message && c.message.content) || c.text)) || '';
  } catch (e) { return ''; }
}

async function readSSE(body, onDelta) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const ln of lines) {
      const d = sseDelta(ln.trim());
      if (d) { text += d; if (onDelta) onDelta(text); }
    }
  }
  const d = sseDelta(buf.trim());
  if (d) { text += d; if (onDelta) onDelta(text); }
  return text;
}

function parseSSEText(raw, onDelta) {
  let text = '';
  for (const ln of raw.split(/\r?\n/)) {
    const d = sseDelta(ln.trim());
    if (d) { text += d; if (onDelta) onDelta(text); }
  }
  return text;
}

// ---- tafsir with memory + localStorage cache ----
const mem = new Map();
const CAP = 300;

export async function tafsir(s, a, edition = 'ar.muyassar') {
  const k = `noor.tafsir.${edition}.${s}:${a}`;
  if (mem.has(k)) return mem.get(k);
  try { const c = localStorage.getItem(k); if (c) { mem.set(k, c); return c; } } catch (e) { /* ignore */ }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${TAFSIR_URL}/${s}:${a}/${edition}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error('http ' + res.status);
    const j = await res.json();
    const text = (j && j.data && j.data.text) || '';
    if (!text) throw new Error('empty');
    mem.set(k, text);
    try {
      const idxKey = `noor.tafsir.${edition}.idx`;
      const idx = JSON.parse(localStorage.getItem(idxKey) || '[]').filter(x => x !== k);
      idx.push(k);
      while (idx.length > CAP) localStorage.removeItem(idx.shift());
      localStorage.setItem(k, text);
      localStorage.setItem(idxKey, JSON.stringify(idx));
    } catch (e) { /* storage full or blocked */ }
    return text;
  } finally { clearTimeout(timer); }
}

export async function explainAyah(s, a, opts = {}) {
  await loadQuran();
  let tf = '';
  try { tf = await tafsir(s, a); } catch (e) { /* offline: continue without tafsir */ }
  const msg = `سورة ${surahName(s)}، الآية ${a}:\n«${ayahText(s, a)}»\n\n`
    + (tf ? `مقتطف من التفسير الميسر:\n${tf}\n\n` : '')
    + 'اشرح لي: ١) معنى الآية ٢) أبرز الفوائد ٣) كلمات غريبة ومعانيها.'
    + (tf ? ' ابنِ إجابتك على التفسير المذكور واذكر أنه التفسير الميسر.' : ' اذكر التفسير الذي تعتمد عليه.');
  return chat([{ role: 'user', content: msg }], { mode: 'smart', ...opts });
}

export async function hifzPlan({ pagesPerDay = 1, daysPerWeek = 5, startSurah = 78, goal = '' } = {}, opts = {}) {
  await loadQuran().catch(() => {});
  let name = '';
  try { name = surahName(startSurah); } catch (e) { /* ignore */ }
  const msg = `ضع لي خطة أسبوعية منظمة لحفظ القرآن بالمعطيات التالية:\n`
    + `- عدد الصفحات يومياً: ${pagesPerDay}\n- أيام الحفظ في الأسبوع: ${daysPerWeek}\n`
    + `- نقطة البداية: سورة ${name || startSurah}\n- الهدف: ${goal || 'حفظ متقن مع مراجعة'}\n\n`
    + 'قسّم الخطة إلى أيام الأسبوع (حفظ جديد، مراجعة قريبة، مراجعة بعيدة)، واجعلها واقعية ومختصرة، واختم بنصيحتين للثبات.';
  return chat([{ role: 'user', content: msg }], { mode: 'smart', ...opts });
}
