// noor-ai — backend for the "نور" Quran app.
// Holds no keys in code: reads GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY from the project's secrets
// (shared with the Ibrahim assistant project). Every provider without a key is skipped automatically.
//
// POST JSON { action, ... }  with header x-noor-app: <app token>
//   status                                   -> { ok, providers:{gemini,groq,openrouter}, stt, tajweed }
//   chat      { messages, mode:'fast'|'smart' } -> { text, provider, model }
//   transcribe{ audio(base64), mime, prompt }  -> { text, provider }
//   tajweed   { audio, mime, s, from, to, text } -> { score, summary, mistakes, tajweed, advice, provider }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const APP_TOKEN = "noor-family-2026";
const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const GEMINI_KEY = env("GEMINI_API_KEY");
const GROQ_KEY = env("GROQ_API_KEY");
const OPENROUTER_KEY = env("OPENROUTER_API_KEY");
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-noor-app, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

// ---------- light abuse protection (per instance, per IP) ----------
const LIMITS: Record<string, [number, number]> = { chat: [40, 600_000], transcribe: [400, 600_000], tajweed: [12, 600_000], status: [60, 600_000] };
const hits = new Map<string, number[]>();
function limited(ip: string, action: string): boolean {
  const [max, win] = LIMITS[action] ?? [60, 600_000];
  const k = ip + "|" + action, now = Date.now();
  const arr = (hits.get(k) ?? []).filter((t) => now - t < win);
  arr.push(now); hits.set(k, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

// ---------- provider cooldowns (skip a model briefly after 429/5xx) ----------
const cool = new Map<string, number>();
const cooling = (k: string) => (cool.get(k) ?? 0) > Date.now();
const coolFor = (k: string, ms: number) => cool.set(k, Date.now() + ms);

// ---------- Gemini model discovery (newest flash first) ----------
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
  let list = mode === "smart" ? [...flash.slice(0, 2), ...pro.slice(0, 1), ...lite.slice(0, 1)]
    : [...flash.slice(0, 2), ...lite.slice(0, 2)];
  if (!list.length) list = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  return [...new Set(list)].filter((m) => !cooling("gem:" + m)).concat([...new Set(list)].filter((m) => cooling("gem:" + m))).slice(0, 4);
}

async function geminiGenerate(mode: "fast" | "smart" | "audio", payload: unknown, budgetMs: number): Promise<{ text: string; model: string } | null> {
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
      if (!r.ok) {
        await r.body?.cancel();
        coolFor("gem:" + m, r.status === 429 ? 60_000 : r.status === 404 ? 6 * 3600_000 : 20_000);
        continue;
      }
      const d = await r.json();
      const text = (d?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
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
      if (!r.ok) { await r.body?.cancel(); coolFor(tag + model, r.status === 429 ? 60_000 : 20_000); continue; }
      const d = await r.json();
      let text = String(d?.choices?.[0]?.message?.content ?? "").trim();
      text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
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
    if (!r.ok) return null;
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
  const messages = sanitizeMessages(body.messages);
  if (!messages.length) return json(400, { error: "bad_request" });
  const mode = body.mode === "smart" ? "smart" : "fast";
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const convo = messages.filter((m) => m.role !== "system");
  const payload = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: convo.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
  };
  const g = await geminiGenerate(mode, payload, 45_000);
  if (g) return json(200, { text: g.text, provider: "gemini", model: g.model });
  const q = await compatChat(GROQ_BASE, GROQ_KEY, ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3-32b"], messages, {}, "groq:", 35_000);
  if (q) return json(200, { text: q.text, provider: "groq", model: q.model });
  const o = await compatChat(OPENROUTER_BASE, OPENROUTER_KEY, ["openai/gpt-oss-120b:free", "deepseek/deepseek-chat-v3.1:free", "meta-llama/llama-3.3-70b-instruct:free"], messages,
    { "HTTP-Referer": "https://github.com/mohammed0505432176/noor-quran", "X-Title": "Noor Quran" }, "or:", 30_000);
  if (o) return json(200, { text: o.text, provider: "openrouter", model: o.model });
  const p = await pollinations(messages);
  if (p) return json(200, { text: p.text, provider: "pollinations", model: p.model });
  return json(503, { error: "no_provider" });
}

// ---------- audio helpers ----------
const MAX_AUDIO_B64 = 12 * 1024 * 1024; // ~9 MB of audio
function decodeAudio(body: any): { bytes: Uint8Array; mime: string } | null {
  const b64 = typeof body.audio === "string" ? body.audio : "";
  if (!b64 || b64.length > MAX_AUDIO_B64) return null;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const mime = String(body.mime || "audio/webm").split(";")[0].trim().toLowerCase();
    return { bytes, mime: /^audio\/[a-z0-9.+-]+$/.test(mime) ? mime : "audio/webm" };
  } catch { return null; }
}
const extFor = (mime: string) => ({ "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/aac": "m4a" } as Record<string, string>)[mime] ?? "webm";

// Whisper hallucinations commonly produced on silence / noise.
const JUNK = /(اشترك|ترجمة|نانسي|شكرا للمشاهدة|المشاهدة|subscribe|amara|موسيقى)/i;

async function transcribe(body: any) {
  const a = decodeAudio(body);
  if (!a) return json(400, { error: "bad_audio" });
  if (a.bytes.length < 1500) return json(200, { text: "", provider: "none" });
  const prompt = String(body.prompt ?? "").slice(0, 600);
  if (GROQ_KEY) {
    for (const model of ["whisper-large-v3", "whisper-large-v3-turbo"]) {
      if (cooling("stt:" + model)) continue;
      const form = new FormData();
      form.append("file", new Blob([a.bytes], { type: a.mime }), "chunk." + extFor(a.mime));
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
  // Fallback: Gemini audio transcription
  const g = await geminiGenerate("audio", {
    contents: [{ role: "user", parts: [
      { inlineData: { mimeType: a.mime, data: body.audio } },
      { text: "فرّغ هذه التلاوة القرآنية حرفياً بالعربية كما نُطقت تماماً دون تصحيح أو إكمال أو إضافة أي كلمة لم تُنطق. أعد النص فقط بلا تشكيل ولا علامات. إن لم يكن فيها كلام فأعد نصاً فارغاً." + (prompt ? "\nسياق ما سبق: " + prompt : "") },
    ] }],
    generationConfig: { temperature: 0, maxOutputTokens: 600 },
  }, 25_000);
  if (g) return json(200, { text: g.text.replace(/["«»]/g, "").trim(), provider: "gemini" });
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

استمع للتسجيل بدقة وقيّمه مقارنةً بالنص. لا تخترع أخطاء لم تسمعها، وإذا كان الصوت غير واضح فاذكر ذلك.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method" });
  if (req.headers.get("x-noor-app") !== APP_TOKEN) return json(401, { error: "unauthorized" });
  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "bad_json" }); }
  const action = String(body?.action ?? "");
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "anon";
  if (limited(ip, action)) return json(429, { error: "rate_limited" });
  try {
    switch (action) {
      case "status":
        return json(200, { ok: true, providers: { gemini: !!GEMINI_KEY, groq: !!GROQ_KEY, openrouter: !!OPENROUTER_KEY, pollinations: true }, stt: !!(GROQ_KEY || GEMINI_KEY), tajweed: !!GEMINI_KEY });
      case "chat": return await chat(body);
      case "transcribe": return await transcribe(body);
      case "tajweed": return await tajweed(body);
      default: return json(400, { error: "unknown_action" });
    }
  } catch (e) {
    console.error("noor-ai", action, e);
    return json(500, { error: "server_error" });
  }
});
