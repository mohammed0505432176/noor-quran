// «تلاواتي»: list of saved recitations with playback, A/B compare, share and delete.
import { esc, $, $$, toast, icon, header, N, sheet } from '../ui.js';
import { loadQuran, surahName } from '../core/quran.js';
import { playRange, stop as stopReciter } from '../core/audio.js';
import { isNative } from '../core/platform.js';
import * as recordings from '../core/recordings.js';

const accColor = a => (a >= 90 ? 'var(--ok)' : a >= 70 ? 'var(--gold)' : 'var(--bad)');
const dayKey = t => { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
function dayLabel(t) {
  const k = dayKey(t), now = Date.now();
  if (k === dayKey(now)) return 'اليوم';
  if (k === dayKey(now - 864e5)) return 'أمس';
  try { return new Date(t).toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return new Date(t).toDateString(); }
}
const dur = ms => { const s = Math.max(0, Math.round((ms || 0) / 1000)); return `${N(Math.floor(s / 60))}:${N(String(s % 60).padStart(2, '0'))}`; };
const mb = b => N((b / 1048576).toFixed(1));
function canShare() {
  if (isNative()) return false;
  try { const f = new File([new Blob(['x'])], 'a.webm', { type: 'audio/webm' }); return !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; }
}
const ext = type => (/mp4|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : /wav/.test(type) ? 'wav' : 'webm');

export default {
  async render(el) {
    try { await loadQuran(); } catch (e) { /* names may be empty */ }
    let alive = true, url = null, openId = null, items = [], mineAudio = null;

    const release = () => {
      if (mineAudio) { try { mineAudio.pause(); } catch (e) {} mineAudio = null; }
      if (url) { try { URL.revokeObjectURL(url); } catch (e) {} url = null; }
      try { stopReciter(); } catch (e) {}
    };

    async function draw() {
      items = await recordings.list();
      if (!alive) return;
      const u = await recordings.usage();
      if (!alive) return;
      let html = header('تلاواتي', { back: 'recite' });
      if (!items.length) {
        html += `<div class="card empty"><div class="gold">${icon('mic', 40)}</div><p>لا توجد تلاوات محفوظة بعد.</p><p class="muted small">سمّع مقطعاً من صفحة التسميع وسيُحفظ تسجيلك هنا لتسمعه وتقارنه بالقارئ.</p><button class="btn" data-go="recite">ابدأ التسميع</button></div>`;
      } else {
        let last = '';
        html += '<div class="list">';
        for (const r of items) {
          const lbl = dayLabel(r.at);
          if (lbl !== last) { html += `</div><div class="section-title mt">${esc(lbl)}</div><div class="list">`; last = lbl; }
          const open = r.id === openId;
          html += `<div class="list-item" data-rec="${esc(r.id)}" style="flex-wrap:wrap;cursor:pointer">
            <div class="li-main"><b>${esc(surahName(r.s))}</b> <span class="muted small">الآيات ${N(r.from)}–${N(r.to)}</span>
              <div class="li-sub">${dur(r.durationMs)}${r.tajweedScore != null ? ` · التجويد ${N(r.tajweedScore)}` : ''}</div></div>
            <div class="li-end"><span class="chip" style="color:${accColor(r.acc)}">${N(r.acc)}٪</span></div>
            ${open ? `<div class="rec-open" style="flex-basis:100%;margin-top:10px;cursor:default">
              <audio id="rec-audio" controls preload="metadata" style="width:100%"></audio>
              <div class="row mt">
                <button class="btn ghost sm" data-act="cmp">${icon('play', 16)} قارن بالقارئ</button>
                <button class="btn ghost sm" data-go="recite/${r.s}?from=${r.from}&to=${r.to}">${icon('repeat', 16)} سمّع مرة أخرى</button>
                ${canShare() ? '<button class="btn ghost sm" data-act="share">مشاركة</button>' : isNative() ? '' : '<button class="btn ghost sm" data-act="dl">تنزيل</button>'}
                <button class="btn danger sm" data-act="del">حذف</button>
              </div></div>` : ''}
          </div>`;
        }
        html += '</div>';
      }
      html += `<p class="muted small center mt">المساحة المستخدمة: ${mb(u.bytes)} من ${mb(u.maxBytes)} ميغابايت · ${N(u.count)} من ${N(u.maxCount)} تلاوة</p>`;
      el.innerHTML = html;
      wire();
      if (openId) await attach(openId);
    }

    async function attach(id) {
      const rec = await recordings.get(id);
      if (!alive || openId !== id) return;
      const a = $('#rec-audio', el);
      if (!rec || !rec.blob || !a) { toast('تعذر فتح التسجيل'); return; }
      try { url = URL.createObjectURL(rec.blob); a.src = url; } catch (e) { toast('تعذر تشغيل التسجيل'); }
      a.onplay = () => { try { stopReciter(); } catch (e) {} };
      mineAudio = a;
    }

    function collapse() { release(); openId = null; }

    function wire() {
      $$('[data-rec]', el).forEach(row => {
        row.addEventListener('click', e => {
          if (e.target.closest('.rec-open')) return;
          const id = row.dataset.rec;
          const was = openId;
          collapse();
          if (was !== id) openId = id;
          draw();
        });
      });
      const box = $('.rec-open', el);
      if (!box) return;
      const rec = items.find(x => x.id === openId);
      box.querySelector('[data-act=cmp]').onclick = () => {
        if (mineAudio) { try { mineAudio.pause(); } catch (e) {} }
        try { playRange(rec.s, rec.from, rec.to); } catch (e) { toast('تعذر تشغيل التلاوة'); }
      };
      const sb = box.querySelector('[data-act=share]'); if (sb) sb.onclick = () => share(rec);
      const db = box.querySelector('[data-act=dl]'); if (db) db.onclick = () => share(rec, true);
      box.querySelector('[data-act=del]').onclick = () => confirmDelete(rec);
    }

    async function share(rec, downloadOnly) {
      const full = await recordings.get(rec.id);
      if (!full || !full.blob) { toast('تعذر قراءة التسجيل'); return; }
      const name = `تلاوة-${surahName(rec.s)}-${rec.from}-${rec.to}.${ext(full.blob.type)}`;
      if (!downloadOnly) try {
        const file = new File([full.blob], name, { type: full.blob.type || 'audio/webm' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'تلاوتي' });
          return;
        }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      try {
        const u = URL.createObjectURL(full.blob);
        const a = document.createElement('a');
        a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 10000);
      } catch (e) { toast('تعذرت المشاركة'); }
    }

    function confirmDelete(rec) {
      const sh = sheet(`<h3>حذف التلاوة؟</h3><p class="muted">${esc(surahName(rec.s))} · الآيات ${N(rec.from)}–${N(rec.to)}. لا يمكن التراجع.</p>
        <div class="grid-2 mt"><button class="btn danger" id="rd-yes">حذف</button><button class="btn ghost" id="rd-no">إلغاء</button></div>`);
      $('#rd-no', sh).onclick = () => sh.close();
      $('#rd-yes', sh).onclick = async () => {
        sh.close();
        collapse();
        await recordings.remove(rec.id);
        toast('تم الحذف');
        if (alive) draw();
      };
    }

    await draw();
    return () => { alive = false; release(); };
  }
};
