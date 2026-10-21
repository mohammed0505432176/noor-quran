// AI assistant view ("المساعد الذكي").
import { esc, $, header, icon, toast, N } from '../ui.js';
import { S, streak, dayStat } from '../core/store.js';
import { loadQuran, ayah as ayahText, surahName } from '../core/quran.js';
import { chat, explainAyah } from '../core/ai.js';

const KEY = 'noor.chat';
const WELCOME = 'السلام عليكم، أنا «نور» رفيقك في القرآن. أستطيع أن:\n- أشرح لك معاني الآيات اعتماداً على التفسير الميسر\n- أضع لك خطة حفظ تناسب وقتك\n- أبسّط لك أحكام التجويد\n- أحفّزك على وردك اليومي';
const CHIPS = ['اشرح لي آية الكرسي', 'ضع لي خطة لحفظ جزء عمّ', 'ما أحكام النون الساكنة؟', 'حفّزني على ورد اليوم'];

// ---- pure helpers ----
function inline(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }

/** Safe light markdown: escape first, then bold, headings, bullets, line breaks. */
export function md(text) {
  const out = []; let list = false;
  for (const raw of String(text ?? '').split('\n')) {
    const ln = raw.trim();
    const li = ln.match(/^(?:- |• |\* )(.*)$/);
    if (li) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    const h = ln.match(/^#{1,4}\s+(.*)$/);
    if (h) out.push(`<h4 class="gold">${inline(h[1])}</h4>`);
    else if (ln) out.push(`<p>${inline(ln)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('');
}

function loadMsgs() { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
function saveMsgs(m) { try { sessionStorage.setItem(KEY, JSON.stringify(m.slice(-30))); } catch (e) { /* ignore */ } }

function motivationPrompt() {
  const st = streak(), d = dayStat(0), goal = S.settings.goal;
  return `حفّزني على ورد اليوم بكلمات قصيرة ودافئة. سلسلة أيامي المتواصلة: ${st} يوم. قرأت اليوم ${d.a} آية من هدفي ${goal} آية`
    + `، وسمّعت ${d.r} مرة. أعطني دفعة معنوية مناسبة لحالي وخطوة صغيرة لليوم.`;
}

export default {
  async render(el, params = {}) {
    el.innerHTML = `<div class="view">${header('المساعد الذكي', { actions: `<button class="icon-btn" id="ai-new" aria-label="محادثة جديدة" title="محادثة جديدة">${icon('plus')}</button><button class="icon-btn" data-go="settings" aria-label="الإعدادات">${icon('gear')}</button>` })}
      <div class="chat" id="ai-chat" aria-live="polite"></div>
      <p class="muted small center mt">إجابات المساعد للاستئناس، وراجع أهل العلم في المسائل الشرعية</p>
      <div class="chat-input">
        <textarea class="textarea" id="ai-text" rows="1" placeholder="اسأل عن آية أو حكم أو خطة حفظ…" aria-label="رسالتك"></textarea>
        <button class="icon-btn" id="ai-send" aria-label="إرسال">${icon('send')}</button>
      </div></div>`;
    const box = $('#ai-chat', el), ta = $('#ai-text', el), sendBtn = $('#ai-send', el);
    let msgs = loadMsgs(), ctrl = null, busy = false, alive = true;

    const scroll = () => { const sc = document.scrollingElement || document.documentElement; sc.scrollTo ? sc.scrollTo({ top: sc.scrollHeight }) : (sc.scrollTop = sc.scrollHeight); };
    const addBubble = (cls, html) => { const d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = html; box.appendChild(d); scroll(); return d; };
    const setBusy = b => { busy = b; sendBtn.innerHTML = icon(b ? 'stop' : 'send'); sendBtn.setAttribute('aria-label', b ? 'إيقاف' : 'إرسال'); };

    function renderAll() {
      box.innerHTML = '';
      addBubble('ai', md(WELCOME) + `<div class="row mt">${CHIPS.map((c, i) => `<button class="chip" data-chip="${i}">${esc(c)}</button>`).join('')}</div>`);
      for (const m of msgs) {
        if (m.quote) addBubble('ai', `<div class="quran" style="font-size:1.25em;line-height:2;text-align:center">${esc(m.quote.text)}</div><div class="muted small center">${esc(m.quote.ref)}</div>`);
        if (m.role === 'user') addBubble('user', `<p>${esc(m.content)}</p>`);
        else if (m.content) addBubble('ai', md(m.content));
      }
    }

    /** Core run: produce is (onDelta, signal) => Promise<text>. */
    async function run(userText, produce, quote) {
      if (busy) return;
      msgs.push({ role: 'user', content: userText, ...(quote ? { quote } : {}) });
      saveMsgs(msgs);
      if (quote) addBubble('ai', `<div class="quran" style="font-size:1.25em;line-height:2;text-align:center">${esc(quote.text)}</div><div class="muted small center">${esc(quote.ref)}</div>`);
      addBubble('user', `<p>${esc(userText)}</p>`);
      await respond(produce);
    }

    async function respond(produce) {
      const typing = addBubble('ai typing', '<span class="muted">…</span>');
      ctrl = new AbortController(); setBusy(true);
      let bubble = typing;
      try {
        const text = await produce(t => { bubble.classList.remove('typing'); bubble.innerHTML = md(t); scroll(); }, ctrl.signal);
        if (!alive) return;
        bubble.classList.remove('typing'); bubble.innerHTML = md(text);
        msgs.push({ role: 'assistant', content: text }); saveMsgs(msgs);
      } catch (e) {
        if (!alive) return;
        bubble.classList.remove('typing');
        if (e && e.name === 'AbortError') {
          const partial = bubble.textContent.trim();
          if (partial && partial !== '…') { msgs.push({ role: 'assistant', content: partial }); saveMsgs(msgs); }
          else bubble.remove();
        } else {
          bubble.innerHTML = `<p>${esc(e.message || 'تعذّر الاتصال بالمساعد')}</p><button class="btn sm ghost mt" data-retry="1">إعادة المحاولة</button>`;
          bubble.dataset.err = '1';
        }
      } finally { ctrl = null; if (alive) { setBusy(false); scroll(); } }
    }

    const history = () => msgs.filter(m => m.content).map(m => ({ role: m.role, content: m.content }));
    const ask = text => run(text, (onDelta, signal) => chat(history(), { signal, onDelta }));
    async function askAyah(s, a) {
      await loadQuran();
      const quote = { text: ayahText(s, a), ref: `سورة ${surahName(s)} · الآية ${N(a)}` };
      await run(`اشرح لي الآية ${N(a)} من سورة ${surahName(s)}`, (onDelta, signal) => explainAyah(s, a, { signal, onDelta }), quote);
    }

    function send() {
      if (busy) { ctrl && ctrl.abort(); return; }
      const t = ta.value.trim(); if (!t) return;
      ta.value = ''; grow(); ask(t);
    }
    function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; }

    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    sendBtn.addEventListener('click', send);
    $('#ai-new', el).addEventListener('click', () => {
      if (ctrl) ctrl.abort();
      msgs = []; saveMsgs(msgs); renderAll(); toast('بدأت محادثة جديدة');
    });
    box.addEventListener('click', e => {
      const chip = e.target.closest('[data-chip]');
      if (chip && !busy) {
        const i = +chip.dataset.chip;
        if (i === 0) askAyah(2, 255);
        else if (i === 3) run(CHIPS[3], (onDelta, signal) => chat([{ role: 'user', content: motivationPrompt() }], { signal, onDelta }));
        else ask(CHIPS[i]);
        return;
      }
      if (e.target.closest('[data-retry]') && !busy) {
        const errEl = e.target.closest('.msg'); if (errEl) errEl.remove();
        respond((onDelta, signal) => chat(history(), { signal, onDelta }));
      }
    });

    renderAll(); scroll();

    const qp = params.q instanceof URLSearchParams ? params.q : typeof params.q === 'object' && params.q ? new Map(Object.entries(params.q)) : new URLSearchParams(params.q || '');
    const s = parseInt(qp.get('s'), 10), a = parseInt(qp.get('a'), 10);
    if (s >= 1 && s <= 114 && a >= 1) {
      try { await loadQuran(); } catch (e) { toast('تعذّر تحميل المصحف'); }
      if (alive) askAyah(s, a).catch(() => {});
    }

    return () => { alive = false; if (ctrl) ctrl.abort(); };
  }
};
