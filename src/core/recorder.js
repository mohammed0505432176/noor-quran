// Microphone recorder for AI-assisted recitation. One continuous MediaRecorder keeps the FULL
// recording; a second one on the same stream is restarted every chunkMs so each chunk is a
// standalone, playable file (own container header) that can be sent to speech-to-text.
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
const SILENCE_RMS = 0.012;   // chunks whose loudest moment stays below this are not sent
const MIN_CHUNK_BYTES = 1200;

function pickType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of TYPES) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch (e) { /* next */ } }
  return '';
}

export function recorderSupported() {
  return typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof MediaRecorder !== 'undefined';
}

function makeRecorder(stream, mime) {
  let rec;
  try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined); }
  catch (e) { rec = new MediaRecorder(stream); }
  const parts = [];
  const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
  const done = new Promise(res => {
    rec.ondataavailable = ev => { if (ev.data && ev.data.size) parts.push(ev.data); };
    rec.onstop = () => res(new Blob(parts, { type }));
    rec.onerror = () => res(new Blob(parts, { type }));
  });
  return { rec, done };
}

export async function startRecorder({ chunkMs = 4500, onChunk = () => {}, onLevel = () => {}, onError = () => {} } = {}) {
  if (!recorderSupported()) { onError('unsupported'); return null; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
    });
  } catch (e) {
    onError(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'PermissionDeniedError') ? 'permission' : 'error');
    return null;
  }

  const mime = pickType();
  let stopped = false, paused = false, idx = 0;
  let full = null, chunk = null, chunkMax = 0, chunkTimer = null, meterTimer = null;
  let actx = null, analyser = null, buf = null;
  let activeMs = 0, since = Date.now();

  const releaseAll = () => {
    clearTimeout(chunkTimer); clearInterval(meterTimer);
    try { stream.getTracks().forEach(t => t.stop()); } catch (e) { /* ignore */ }
    if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
  };

  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      actx = new AC();
      if (actx.state === 'suspended') actx.resume().catch(() => {});
      analyser = actx.createAnalyser();
      analyser.fftSize = 1024;
      actx.createMediaStreamSource(stream).connect(analyser);
      buf = new Float32Array(analyser.fftSize);
    }
  } catch (e) { actx = null; analyser = null; }

  try {
    full = makeRecorder(stream, mime);
    full.rec.start(1000);
  } catch (e) {
    releaseAll();
    onError('error');
    return null;
  }

  function startChunk() {
    if (stopped || paused) return;
    try {
      chunk = makeRecorder(stream, mime);
      chunkMax = 0;
      chunk.rec.start();
      chunkTimer = setTimeout(rotate, chunkMs);
    } catch (e) { chunk = null; }
  }
  /** Stop the current chunk recorder and hand its file out (if it carries sound). */
  async function flushChunk() {
    clearTimeout(chunkTimer);
    const c = chunk, max = chunkMax;
    chunk = null;
    if (!c) return;
    try { if (c.rec.state !== 'inactive') c.rec.stop(); } catch (e) { /* ignore */ }
    let blob;
    try { blob = await c.done; } catch (e) { return; }
    if (blob && blob.size >= MIN_CHUNK_BYTES && max >= SILENCE_RMS) {
      try { onChunk(blob, idx++); } catch (e) { /* consumer error must not break recording */ }
    }
  }
  function rotate() {
    if (stopped || paused) return;
    flushChunk();
    startChunk();
  }

  meterTimer = setInterval(() => {
    if (stopped || !analyser) return;
    let rms = 0;
    if (!paused) {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      rms = Math.sqrt(sum / buf.length);
      if (rms > chunkMax) chunkMax = rms;
    }
    try { onLevel(Math.min(1, rms * 6)); } catch (e) { /* ignore */ }
  }, 100);

  // The mic can be revoked/unplugged mid-session.
  stream.getAudioTracks().forEach(t => { t.onended = () => { if (!stopped) onError('error'); }; });

  startChunk();

  let stopPromise = null;
  function stop() {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      stopped = true;
      if (!paused) activeMs += Date.now() - since;
      let blob = new Blob([], { type: 'audio/webm' });
      try {
        await flushChunk();
        try { if (full.rec.state !== 'inactive') full.rec.stop(); } catch (e) { /* ignore */ }
        blob = await full.done;
      } catch (e) { /* fall through */ }
      finally { releaseAll(); }
      return blob;
    })();
    return stopPromise;
  }
  function pause() {
    if (stopped || paused) return;
    paused = true;
    activeMs += Date.now() - since;
    flushChunk();                       // don't lose what was said before the pause
    try { if (full.rec.state === 'recording') full.rec.pause(); } catch (e) { /* ignore */ }
    try { onLevel(0); } catch (e) { /* ignore */ }
  }
  function resume() {
    if (stopped || !paused) return;
    paused = false;
    since = Date.now();
    try { if (full.rec.state === 'paused') full.rec.resume(); } catch (e) { /* ignore */ }
    startChunk();
  }
  const elapsed = () => (activeMs + (stopped || paused ? 0 : Date.now() - since)) / 1000;

  return { stop, pause, resume, elapsed };
}
