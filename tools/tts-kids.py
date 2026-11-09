"""Generate the kids prayer narration with the open-source Chatterbox Multilingual TTS (MIT licence, Arabic), then check every
clip by transcribing it back with faster-whisper and comparing it with the source text.
  python tools/tts-kids.py OUT_DIR        # writes OUT_DIR/<id>.wav and OUT_DIR/report.json
Needs: torch (CUDA), chatterbox-tts, faster-whisper.  Texts: tools/kids-narration.json (same ids as src/data/kids-prayer.js)."""
import json, re, sys, difflib, pathlib
import torch, torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

root = pathlib.Path(__file__).parent
texts = json.loads((root / 'kids-narration.json').read_text(encoding='utf8'))
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
only = sys.argv[2:] or list(texts)
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
print('device', dev, flush=True)
try:
    model = ChatterboxMultilingualTTS.from_pretrained(device=dev, t3_model='v3')
except TypeError:
    model = ChatterboxMultilingualTTS.from_pretrained(device=dev)

def norm(s):
    s = re.sub(r'[ً-ٰٟـ]', '', s)
    s = s.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ى', 'ي').replace('ة', 'ه')
    return re.sub(r'[^ء-ي ]', ' ', s).split()

from faster_whisper import WhisperModel
wh = WhisperModel('small', device=dev, compute_type='float16' if dev == 'cuda' else 'int8')
report = {}
for k in only:
    wav = model.generate(texts[k], language_id='ar', exaggeration=0.4, cfg_weight=0.5, temperature=0.7)
    p = out / f'{k}.wav'
    ta.save(str(p), wav, model.sr)
    w, sr = ta.load(str(p)); w = ta.functional.resample(w.mean(0), sr, 16000).numpy()
    segs, _ = wh.transcribe(w, language='ar', beam_size=5)
    heard = ' '.join(s.text for s in segs)
    a, b = ' '.join(norm(texts[k])), ' '.join(norm(heard))
    sim = difflib.SequenceMatcher(None, a, b).ratio()
    report[k] = {'sim': round(sim, 3), 'heard': heard.strip(), 'sec': round(wav.shape[-1] / model.sr, 1)}
    print(k, report[k], flush=True)
(out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf8')
