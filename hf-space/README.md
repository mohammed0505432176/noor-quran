---
title: Noor Quran ASR
emoji: 🕌
sdk: docker
app_port: 7860
pinned: false
---

# Noor Quran ASR

خدمة تحويل التلاوة إلى نص (Whisper مضبوط على القرآن) تعمل على Hugging Face Space مجاني.

## خطوات النشر

1. أنشئ حساباً مجانياً على https://huggingface.co
2. اضغط **New Space** ثم اختر **Docker** ثم **Blank**، واختر الأجهزة **CPU basic (free)**.
3. ارفع الملفات الأربعة (`app.py`, `requirements.txt`, `Dockerfile`, `README.md`) من الواجهة (Files → Add file)، أو استعمل `git push`.
4. من **Settings → Variables and secrets** أضف Secret باسم `API_TOKEN` وقيمته أي نص عشوائي طويل. **هذا السر إلزامي**: بدونه يرد `/transcribe` بـ 503 (`API_TOKEN not set`) إلا إذا ضبطت `ALLOW_ANON=1` صراحةً (غير موصى به).
5. انتظر انتهاء البناء (Build) حتى تصبح الحالة Running (أول مرة تأخذ عدة دقائق لأن النموذج يُحمَّل أثناء البناء).
6. رابط الخدمة: `https://<user>-<space>.hf.space/transcribe` (استبدل `<user>` باسم حسابك و`<space>` باسم الـ Space).
7. في Supabase → **Edge Functions → Secrets** أضف:
   - `QURAN_ASR_URL` = الرابط أعلاه
   - `QURAN_ASR_TOKEN` = نفس قيمة `API_TOKEN`

## ملاحظات

- الـ Spaces المجانية تنام بعد 48 ساعة من عدم الاستخدام؛ عند أول طلب تستيقظ خلال دقيقة أو أكثر، وخلال ذلك يتحول التطبيق تلقائياً إلى Groq Whisper.
- اختيارياً: لتجربة نموذج آخر أضف متغير `MODEL_ID=tarteel-ai/whisper-base-ar-quran` (Variables). ولتسريع الإقلاع غيّر أيضاً قيمة `ARG MODEL_ID` في Dockerfile ليُحمَّل أثناء البناء.
- اختبار: `curl -H "Authorization: Bearer TOKEN" -F file=@a.wav https://<user>-<space>.hf.space/transcribe`

## Model revision pinning

Set `MODEL_REVISION` (env var, and Docker build ARG of the same name) to a specific
commit SHA of the model repo instead of the default `main`, so a later change to the
upstream repo cannot alter what you run. The model is always loaded with
`use_safetensors=True` (no pickle weights).
