// noor-ai — AI backend for the "نور" Quran app (Supabase Edge Function, project shared with Ibrahim).
//
// Keys live ONLY in the project's secrets — never in the app or the repo. Every provider whose key is
// missing is skipped automatically, so adding a key in Supabase → Edge Functions → Secrets enables it
// with no app update:
//   GEMINI_API_KEY      Google AI Studio (chat + audio understanding / tajweed)      ← already set (Ibrahim)
//   GROQ_API_KEY        Groq (fast chat + Whisper large-v3 speech-to-text)           ← already set (Ibrahim)
//   OPENROUTER_API_KEY  OpenRouter ":free" models                                    ← already set (Ibrahim)
//   CEREBRAS_API_KEY    Cerebras (optional, very fast free tier)
//   MISTRAL_API_KEY     Mistral La Plateforme (optional, free experiment tier)
// Pollinations (keyless) is the last-resort fallback for chat.
//
// Auth: verify_jwt = true. The app signs in anonymously (Supabase Auth) and sends the user's JWT; the
// gateway verifies it, and we rate-limit per user per day in public.noor_usage (service role only).
//
// POST JSON { action, ... }
//   status                                       -> { ok, providers, stt, tajweed, limits, used }
//   chat       { messages, mode:'fast'|'smart' } -> { text, provider, model }
//   transcribe { audio(base64), mime, prompt }   -> { text, provider, model }
//   tajweed    { audio, mime, s, from, to, text } -> { score, summary, mistakes, tajweed, advice, provider }
//   family     { op:"create", name, member, stats } | { op:"join", code, member, stats } -> { ok, code, name, owner }
//              { op:"sync", stats, member? } | { op:"leave" } -> { ok }
//              { op:"board" } -> { ok, family:{code,name,owner}|null, members:[{name,stats,updated_at,me}] }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_KEY = env("GEMINI_API_KEY");
const GROQ_KEY = env("GROQ_API_KEY");
const OPENROUTER_KEY = env("OPENROUTER_API_KEY");
const CEREBRAS_KEY = env("CEREBRAS_API_KEY");
const MISTRAL_KEY = env("MISTRAL_API_KEY");
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const CEREBRAS_BASE = "https://api.cerebras.ai/v1";
const MISTRAL_BASE = "https://api.mistral.ai/v1";
const list = (k: string, d: string[]) => (env(k) ? env(k).split(",").map((s) => s.trim()).filter(Boolean) : d);

// Daily per-user limits (generous for a family, but stops a leaked token from draining the free quotas).
const DAILY: Record<string, number> = { chat: 200, transcribe: 3000, tajweed: 40, status: 500, family: 400 };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

// ---------- identity (JWT already verified by the gateway) ----------
function userId(req: Request): string | null {
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const part = tok.split(".")[1];
  if (!part) return null;
  try {
    const p = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    if (p?.role !== "authenticated" || typeof p?.sub !== "string") return null;
    return /^[0-9a-f-]{36}$/i.test(p.sub) ? p.sub : null;
  } catch { return null; }
}

// ---------- server-owned assistant persona (client "system" messages are ignored) ----------
const NOOR_SYSTEM = `أنت "نور"، رفيق لطيف لتعلّم القرآن الكريم لعائلة عربية، داخل تطبيق نور للقرآن.
أجب بالعربية الفصحى الواضحة وبفقرات قصيرة.
في معاني الآيات اعتمد على التفاسير المعتبرة (الميسر، ابن كثير، السعدي) واذكر أيّها اعتمدت؛ وإذا وُجد مقتطف تفسير في الرسالة فابنِ إجابتك عليه.
لا تختلق آيات ولا أحاديث أبداً. عند الاستشهاد بالقرآن انقل فقط النص الوارد في المحادثة، وإلا فأشر إلى الآية برقمها (سورة:آية).
لا تُصدر فتاوى في المسائل الفقهية الخلافية؛ اعرض الأقوال الرئيسة باختصار وانصح بسؤال عالم ثقة.
ساعد في خطط الحفظ وأساسيات التجويد والتحفيز والتدبر.
اقتصر على ما يتصل بالقرآن وعلومه والعبادة والتحفيز على الطاعة؛ إن طُلب منك شيء بعيد عن ذلك فاعتذر بلطف ووجّه الحديث إلى القرآن.
حافظ على نبرة محترمة ودافئة.`;

// ---------- usage accounting ----------
async function bump(uid: string, action: string, cost = 1): Promise<number> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/noor_bump`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ p_uid: uid, p_action: action, p_cost: cost }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) { await r.body?.cancel(); return 0; }
    return Number(await r.json()) || 0;
  } catch { return 0; } // never block the user because accounting failed
}
// Per-network (IP) and global daily ceilings, so creating many anonymous accounts can't drain the free quotas.
const IP_DAILY: Record<string, number> = { chat: 600, transcribe: 9000, tajweed: 120, status: 1500, family: 1500 };
const GLOBAL_DAILY: Record<string, number> = { chat: 4000, transcribe: 60000, tajweed: 600, status: 20000, family: 20000 };
const GLOBAL_ID = "00000000-0000-0000-0000-000000000000";
async function ipId(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("noor-ip:" + ip))).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80; // uuid-shaped
  const x = Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
// short-window burst limiter (per instance) on top of the daily cap
const hits = new Map<string, number[]>();
function burst(uid: string, action: string): boolean {
  const max = action === "transcribe" ? 120 : action === "tajweed" ? 6 : action === "family" ? 20 : 30, win = 60_000;
  const k = uid + "|" + action, now = Date.now();
  const arr = (hits.get(k) ?? []).filter((t) => now - t < win);
  arr.push(now); hits.set(k, arr);
  if (hits.size > 5000) { let n = 0; for (const key of hits.keys()) { hits.delete(key); if (++n >= 1000) break; } } // evict oldest, never wipe all
  return arr.length > max;
}

// ---------- provider cooldowns ----------
const cool = new Map<string, number>();
const cooling = (k: string) => (cool.get(k) ?? 0) > Date.now();
const coolFor = (k: string, ms: number) => cool.set(k, Date.now() + ms);

// ---------- Gemini (model list discovered, newest flash first) ----------
let gemModels: { names: string[]; at: number } | null = null;
const ver = (n: string) => parseFloat(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? "0");
async function geminiCandidates(mode: "fast" | "smart" | "audio"): Promise<string[]> {
  if (!gemModels || Date.now() - gemModels.at > 6 * 3600_000) {
    try {
      const r = await fetch(`${GEMINI_BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": GEMINI_KEY }, signal: AbortSignal.timeout(5000) });
      const d = r.ok ? await r.json() : { models: [] };
      const names = (d.models ?? [])
        .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
        .map((m: any) => String(m.name).replace("models/", ""))
        .filter((n: string) => /^gemini-\d/.test(n) && !/(image|tts|live|embedding|exp|thinking|computer|native-audio)/.test(n));
      gemModels = { names, at: Date.now() };
    } catch { gemModels = { names: [], at: Date.now() - 6 * 3600_000 + 60_000 }; }
  }
  const all = gemModels.names;
  const newest = (f: (n: string) => boolean) => all.filter(f).sort((a, b) => ver(b) - ver(a));
  const flash = newest((n) => n.includes("flash") && !n.includes("lite"));
  const lite = newest((n) => n.includes("flash-lite"));
  const pro = newest((n) => n.includes("pro"));
  let l = mode === "smart" ? [...flash.slice(0, 2), ...pro.slice(0, 1), ...lite.slice(0, 1)] : [...flash.slice(0, 2), ...lite.slice(0, 2)];
  if (!l.length) l = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  l = [...new Set(l)];
  return [...l.filter((m) => !cooling("gem:" + m)), ...l.filter((m) => cooling("gem:" + m))].slice(0, 4);
}
async function geminiGenerate(mode: "fast" | "smart" | "audio", payload: unknown, budgetMs: number) {
  if (!GEMINI_KEY) return null;
  const start = Date.now();
  for (const m of await geminiCandidates(mode)) {
    const left = budgetMs - (Date.now() - start);
    if (left < 3000) break;
    try {
      const r = await fetch(`${GEMINI_BASE}/models/${m}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Math.min(left, mode === "audio" ? 90_000 : 40_000)),
      });
      if (!r.ok) { await r.body?.cancel(); coolFor("gem:" + m, r.status === 429 ? 60_000 : r.status === 404 ? 6 * 3600_000 : 20_000); continue; }
      const d = await r.json();
      const text = (d?.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("").trim();
      if (text) return { text, model: m };
      coolFor("gem:" + m, 10_000);
    } catch { coolFor("gem:" + m, 15_000); }
  }
  return null;
}

// ---------- OpenAI-compatible providers ----------
type Msg = { role: string; content: string };
async function compatChat(base: string, key: string, models: string[], messages: Msg[], extra: Record<string, string>, tag: string, budgetMs: number) {
  if (!key) return null;
  const start = Date.now();
  for (const model of models) {
    const left = budgetMs - (Date.now() - start);
    if (left < 3000) break;
    if (cooling(tag + model)) continue;
    try {
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...extra },
        body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 1800 }),
        signal: AbortSignal.timeout(Math.min(left, 35_000)),
      });
      if (!r.ok) { await r.body?.cancel(); coolFor(tag + model, r.status === 429 ? 60_000 : r.status === 404 ? 6 * 3600_000 : 20_000); continue; }
      const d = await r.json();
      const text = String(d?.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (text) return { text, model };
    } catch { coolFor(tag + model, 15_000); }
  }
  return null;
}
async function pollinations(messages: Msg[]) {
  try {
    const r = await fetch("https://text.pollinations.ai/openai", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai", messages }), signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) { await r.body?.cancel(); return null; }
    const d = await r.json();
    const text = String(d?.choices?.[0]?.message?.content ?? "").trim();
    return text ? { text, model: "openai" } : null;
  } catch { return null; }
}

function sanitizeMessages(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-24).map((m: any) => ({
    role: m?.role === "assistant" ? "assistant" : m?.role === "system" ? "system" : "user",
    content: String(m?.content ?? "").slice(0, 12000),
  })).filter((m) => m.content);
}

async function chat(body: any) {
  let messages = sanitizeMessages(body.messages);
  if (!messages.some((m) => m.role === "user")) return json(400, { error: "bad_request" });
  const mode = body.mode === "smart" ? "smart" : "fast";
  const system = NOOR_SYSTEM;
  const convo = messages.filter((m) => m.role !== "system");
  messages = [{ role: "system", content: NOOR_SYSTEM }, ...convo];
  const g = await geminiGenerate(mode, {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: convo.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
  }, 45_000);
  if (g) return json(200, { text: g.text, provider: "gemini", model: g.model });
  const chain: [string, string, string[], Record<string, string>, string, number][] = [
    ["groq", GROQ_BASE, list("GROQ_CHAT_MODELS", ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3-32b"]), {}, GROQ_KEY, 30_000],
    ["cerebras", CEREBRAS_BASE, list("CEREBRAS_CHAT_MODELS", ["gpt-oss-120b", "llama-3.3-70b", "qwen-3-32b"]), {}, CEREBRAS_KEY, 25_000],
    ["openrouter", OPENROUTER_BASE, list("OPENROUTER_CHAT_MODELS", ["openai/gpt-oss-120b:free", "deepseek/deepseek-chat-v3.1:free", "meta-llama/llama-3.3-70b-instruct:free"]),
      { "HTTP-Referer": "https://github.com/mohammed0505432176/noor-quran", "X-Title": "Noor Quran" }, OPENROUTER_KEY, 30_000],
    ["mistral", MISTRAL_BASE, list("MISTRAL_CHAT_MODELS", ["mistral-medium-latest", "mistral-small-latest"]), {}, MISTRAL_KEY, 25_000],
  ];
  for (const [id, base, models, extra, key, budget] of chain) {
    const r = await compatChat(base, key, models, messages, extra, id + ":", budget);
    if (r) return json(200, { text: r.text, provider: id, model: r.model });
  }
  const p = await pollinations(messages);
  if (p) return json(200, { text: p.text, provider: "pollinations", model: p.model });
  return json(503, { error: "no_provider" });
}

// ---------- audio ----------
const MAX_AUDIO_B64 = 12 * 1024 * 1024; // ~9 MB of audio
function decodeAudio(body: any): { bytes: Uint8Array; mime: string } | null {
  const b64 = typeof body.audio === "string" ? body.audio : "";
  if (!b64 || b64.length > MAX_AUDIO_B64) return null;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const mime = String(body.mime || "audio/wav").split(";")[0].trim().toLowerCase();
    return { bytes, mime: /^audio\/[a-z0-9.+-]+$/.test(mime) ? mime : "audio/wav" };
  } catch { return null; }
}
const extFor = (mime: string) => (({ "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/aac": "m4a" }) as Record<string, string>)[mime] ?? "wav";
// Whisper hallucinations commonly produced on silence / noise.
const JUNK = /(اشترك|ترجمة|نانسي|شكرا للمشاهدة|المشاهدة|subscribe|amara|موسيقى)/i;

async function transcribe(body: any) {
  const a = decodeAudio(body);
  if (!a) return json(400, { error: "bad_audio" });
  if (a.bytes.length < 1500) return json(200, { text: "", provider: "none" });
  const prompt = String(body.prompt ?? "").slice(0, 600);
  if (GROQ_KEY) {
    for (const model of list("GROQ_STT_MODELS", ["whisper-large-v3", "whisper-large-v3-turbo"])) {
      if (cooling("stt:" + model)) continue;
      const form = new FormData();
      form.append("file", new Blob([a.bytes as BlobPart], { type: a.mime }), "chunk." + extFor(a.mime));
      form.append("model", model);
      form.append("language", "ar");
      form.append("temperature", "0");
      form.append("response_format", "verbose_json");
      if (prompt) form.append("prompt", prompt);
      try {
        const r = await fetch(`${GROQ_BASE}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}` }, body: form, signal: AbortSignal.timeout(20_000) });
        if (!r.ok) { await r.body?.cancel(); coolFor("stt:" + model, r.status === 429 ? 30_000 : 15_000); continue; }
        const d = await r.json();
        const segs = Array.isArray(d?.segments) ? d.segments : null;
        let text = segs
          ? segs.filter((s: any) => !(s.no_speech_prob > 0.6 && s.avg_logprob < -0.8)).map((s: any) => String(s.text ?? "")).join(" ")
          : String(d?.text ?? "");
        text = text.replace(/\s+/g, " ").trim();
        if (JUNK.test(text)) text = "";
        return json(200, { text, provider: "groq", model });
      } catch { coolFor("stt:" + model, 15_000); }
    }
  }
  const g = await geminiGenerate("audio", {
    contents: [{ role: "user", parts: [
      { inlineData: { mimeType: a.mime, data: body.audio } },
      { text: "فرّغ هذه التلاوة القرآنية حرفياً بالعربية كما نُطقت تماماً دون تصحيح أو إكمال أو إضافة أي كلمة لم تُنطق. أعد النص فقط بلا تشكيل ولا علامات. إن لم يكن فيها كلام فأعد نصاً فارغاً." + (prompt ? "\nسياق ما سبق: " + prompt : "") },
    ] }],
    generationConfig: { temperature: 0, maxOutputTokens: 600 },
  }, 25_000);
  if (g) return json(200, { text: g.text.replace(/["«»]/g, "").trim(), provider: "gemini", model: g.model });
  return json(503, { error: "no_provider" });
}

async function tajweed(body: any) {
  const a = decodeAudio(body);
  if (!a) return json(400, { error: "bad_audio" });
  if (!GEMINI_KEY) return json(503, { error: "no_provider" });
  const ref = String(body.text ?? "").slice(0, 6000);
  const where = `سورة رقم ${Number(body.s) | 0} من الآية ${Number(body.from) | 0} إلى ${Number(body.to) | 0}`;
  const prompt = `أنت شيخ مُقرئ متقن لرواية حفص عن عاصم، تستمع لتلاوة طالب (${where}).
النص الصحيح للمقطع:
«${ref}»

استمع للتسجيل بدقة وقيّمه مقارنةً بالنص. لا تخترع أخطاء لم تسمعها، وإذا كان الصوت غير واضح فاذكر ذلك صراحة وخفّض الدرجة.
أعد JSON فقط بهذا الشكل:
{"score":0-100,"summary":"جملة أو جملتان","mistakes":[{"word":"الكلمة من النص","kind":"missing|wrong|extra|harakah","note":"ماذا قال الطالب وما الصواب"}],"tajweed":[{"word":"الكلمة","rule":"اسم الحكم مثل: المد المتصل، الغنة، الإخفاء، الإدغام، القلقلة، مخارج الحروف، الوقف","note":"ملاحظة قصيرة عملية","severity":"high|medium|low"}],"advice":["نصيحة عملية 1","نصيحة 2"]}
اجعل الملاحظات مختصرة وبالعربية الفصحى، وبحد أقصى 12 ملاحظة تجويد.`;
  const g = await geminiGenerate("audio", {
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: a.mime, data: body.audio } }, { text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 3000, responseMimeType: "application/json" },
  }, 100_000);
  if (!g) return json(503, { error: "no_provider" });
  let out: any = null;
  try { out = JSON.parse(g.text.replace(/^```(?:json)?|```$/g, "").trim()); } catch { /* fallthrough */ }
  if (!out || typeof out !== "object") return json(502, { error: "bad_model_output" });
  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  const str = (x: unknown, n = 300) => String(x ?? "").slice(0, n);
  return json(200, {
    provider: "gemini", model: g.model,
    score: Math.max(0, Math.min(100, Number(out.score) || 0)),
    summary: str(out.summary, 600),
    mistakes: arr(out.mistakes).slice(0, 30).map((m: any) => ({ word: str(m.word, 60), kind: str(m.kind, 20), note: str(m.note) })),
    tajweed: arr(out.tajweed).slice(0, 12).map((m: any) => ({ word: str(m.word, 60), rule: str(m.rule, 60), note: str(m.note), severity: ["high", "medium", "low"].includes(m.severity) ? m.severity : "medium" })),
    advice: arr(out.advice).slice(0, 5).map((x: unknown) => str(x)),
  });
}

// ---------- family circles (service role via PostgREST; tables have RLS with no policies) ----------
async function rest(path: string, init: RequestInit & { prefer?: string } = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json",
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    signal: AbortSignal.timeout(8000),
  });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { ok: r.ok, status: r.status, data };
}
const cleanName = (x: unknown, max: number) =>
  String(x ?? "").replace(/[<>&"'`\u0000-\u001f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_ABC[b % CODE_ABC.length]).join("");
const num = (x: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(x) || 0)));
function cleanStats(s: any) {
  return {
    week: num(s?.week, 100000), today: num(s?.today, 10000), streak: num(s?.streak, 10000), best: num(s?.best, 10000),
    total: num(s?.total, 6236), rec: num(s?.rec, 100000), acc: num(s?.acc, 100), pts: num(s?.pts, 10_000_000),
    level: cleanName(s?.level, 20), khatma: num(s?.khatma, 100),
  };
}
async function myMembership(uid: string) {
  const m = await rest(`noor_members?uid=eq.${uid}&select=uid,name,family_id,noor_families(id,code,name,owner)`);
  return m.ok && Array.isArray(m.data) && m.data[0] ? m.data[0] : null;
}

async function family(uid: string, body: any) {
  const op = String(body.op ?? "");
  if (op === "create" || op === "join") {
    const memberName = cleanName(body.member, 24);
    if (!memberName) return json(400, { error: "bad_name" });
    let fam: any = null;
    if (op === "create") {
      const famName = cleanName(body.name, 40) || "عائلتي";
      for (let i = 0; i < 5 && !fam; i++) {
        const r = await rest("noor_families", { method: "POST", prefer: "return=representation", body: JSON.stringify({ code: newCode(), name: famName, owner: uid }) });
        if (r.ok && Array.isArray(r.data)) fam = r.data[0];
        else if (r.status !== 409) return json(500, { error: "server_error" });
      }
      if (!fam) return json(500, { error: "server_error" });
    } else {
      const code = String(body.code ?? "").toUpperCase().replace(/[^A-Z2-9]/g, "");
      if (code.length !== 6) return json(400, { error: "bad_code" });
      const r = await rest(`noor_families?code=eq.${code}&select=id,code,name,owner`);
      fam = r.ok && Array.isArray(r.data) ? r.data[0] : null;
      if (!fam) return json(404, { error: "not_found" });
      const c = await rest(`noor_members?family_id=eq.${fam.id}&select=uid`);
      if (Array.isArray(c.data) && c.data.length >= 30 && !c.data.some((x: any) => x.uid === uid)) return json(409, { error: "family_full" });
    }
    const up = await rest("noor_members?on_conflict=uid", {
      method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify({ uid, family_id: fam.id, name: memberName, stats: cleanStats(body.stats), updated_at: new Date().toISOString() }),
    });
    if (!up.ok) return json(500, { error: "server_error" });
    return json(200, { ok: true, code: fam.code, name: fam.name, owner: fam.owner === uid });
  }
  if (op === "leave") {
    const me = await myMembership(uid);
    await rest(`noor_members?uid=eq.${uid}`, { method: "DELETE" });
    if (me) {
      const fam = me.noor_families;
      const left = await rest(`noor_members?family_id=eq.${fam.id}&select=uid&order=joined_at.asc&limit=1`);
      const next = Array.isArray(left.data) ? left.data[0] : null;
      if (!next) await rest(`noor_families?id=eq.${fam.id}`, { method: "DELETE" });
      else if (fam.owner === uid) await rest(`noor_families?id=eq.${fam.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ owner: next.uid }) });
    }
    return json(200, { ok: true });
  }
  if (op === "sync") {
    const patch: Record<string, unknown> = { stats: cleanStats(body.stats), updated_at: new Date().toISOString() };
    const nm = cleanName(body.member, 24);
    if (nm) patch.name = nm;
    const r = await rest(`noor_members?uid=eq.${uid}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify(patch) });
    return json(r.ok ? 200 : 500, r.ok ? { ok: true } : { error: "server_error" });
  }
  if (op === "board") {
    const me = await myMembership(uid);
    if (!me) return json(200, { ok: true, family: null, members: [] });
    const fam = me.noor_families;
    const r = await rest(`noor_members?family_id=eq.${fam.id}&select=uid,name,stats,updated_at&order=updated_at.desc&limit=30`);
    const members = (Array.isArray(r.data) ? r.data : []).map((m: any) => ({ name: m.name, stats: m.stats ?? {}, updated_at: m.updated_at, me: m.uid === uid }));
    return json(200, { ok: true, family: { code: fam.code, name: fam.name, owner: fam.owner === uid }, members });
  }
  return json(400, { error: "unknown_op" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method" });
  const uid = userId(req);
  if (!uid) return json(401, { error: "unauthorized" });
  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "bad_json" }); }
  const action = String(body?.action ?? "");
  if (!(action in DAILY)) return json(400, { error: "unknown_action" });
  if (burst(uid, action)) return json(429, { error: "rate_limited", retry: 60 });
  const [used, ipUsed, allUsed] = await Promise.all([bump(uid, action), ipId(req).then((id) => bump(id, "ip:" + action)), bump(GLOBAL_ID, "all:" + action)]);
  if (used > DAILY[action] || ipUsed > IP_DAILY[action]) return json(429, { error: "daily_limit", limit: DAILY[action] });
  if (allUsed > GLOBAL_DAILY[action]) return json(429, { error: "rate_limited", retry: 3600 });
  if (Math.random() < 0.002) {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/noor_usage_gc`, { method: "POST", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" }, body: "{}" })
      .then((r) => r.body?.cancel()).catch(() => {});
  }
  try {
    switch (action) {
      case "status":
        return json(200, {
          ok: true,
          providers: { gemini: !!GEMINI_KEY, groq: !!GROQ_KEY, cerebras: !!CEREBRAS_KEY, openrouter: !!OPENROUTER_KEY, mistral: !!MISTRAL_KEY, pollinations: true },
          stt: !!(GROQ_KEY || GEMINI_KEY), sttEngine: GROQ_KEY ? "whisper-large-v3" : GEMINI_KEY ? "gemini" : null,
          tajweed: !!GEMINI_KEY, limits: DAILY,
        });
      case "chat": return await chat(body);
      case "transcribe": return await transcribe(body);
      case "tajweed": return await tajweed(body);
      case "family": return await family(uid, body);
    }
  } catch (e) {
    console.error("noor-ai", action, e);
    return json(500, { error: "server_error" });
  }
  return json(400, { error: "unknown_action" });
});
