// Microphone recorder for AI-assisted recitation. Captures raw PCM (AudioWorklet, with a
// ScriptProcessor fallback), downsamples to 16 kHz mono and cuts chunks at natural pauses (see
// audio-dsp.js) so words are never split. Every chunk and the full recording are standalone
// 16-bit WAV blobs (type 'audio/wav').
import { TARGET_RATE, createDownsampler, createChunker, encodeWav, encodeWavPcm16, floatToPcm16, rms } from './audio-dsp.js';

const FULL_CAP_SECONDS = 300;        // beyond 5 minutes the full recording stops growing
const BLOCK = 2048;                  // samples per message from the audio thread

const WORKLET_CODE = `
class NoorPcm extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${BLOCK}); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === ${BLOCK}) { const b = this.buf; this.buf = new Float32Array(${BLOCK}); this.n = 0; this.port.postMessage(b, [b.buffer]); }
      }
    }
    return true;
  }
}
registerProcessor('noor-pcm', NoorPcm);
`;

const getAC = () => (typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : undefined);

export function recorderSupported() {
  return typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && !!getAC();
}

const wavBlob = bytes => new Blob([bytes], { type: 'audio/wav' });

/** vad (optional): { minSpeechMs, silenceMs, maxMs } overrides for chunk cutting (lower = lower latency).
 *  onPcm (optional): receives every block of continuous 16 kHz mono Float32 PCM (no gaps, no VAD) for streaming engines. */
export async function startRecorder({ chunkMs = 4500, onChunk = null, onLevel = () => {}, onError = () => {}, vad = null, onPcm = null } = {}) {
  // chunkMs is kept for API compatibility; chunk boundaries now follow pauses in speech.
  void chunkMs;
  if (!recorderSupported()) { onError('unsupported'); return null; }

  // Create the context first, synchronously inside the user's tap, so it is allowed to run.
  let actx = null;
  try {
    actx = new (getAC())();
    if (actx.state === 'suspended') actx.resume().catch(() => {});
  } catch (e) { actx = null; }
  if (!actx) { onError('error'); return null; }

  // Android's echo canceller / noise suppressor gate and duck quiet, sustained recitation (choppy audio, clipped
  // madd); only the gain control is kept. Plain {audio:true} if the device rejects the constraints.
  let stream;
  const denied = e => e && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'PermissionDeniedError');
  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 }
      });
    } catch (e) {
      if (denied(e)) throw e;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  } catch (e) {
    try { actx.close(); } catch (e2) { /* ignore */ }
    onError(denied(e) ? 'permission' : 'error');
    return null;
  }

  let stopped = false, paused = false, idx = 0;
  let activeMs = 0, since = Date.now();
  let source = null, node = null, mute = null, workletUrl = null, lastLevel = 0;
  const ds = createDownsampler(actx.sampleRate, TARGET_RATE);
  const vadOpts = {};
  if (vad && typeof vad === 'object') {
    for (const k of ['minSpeechMs', 'silenceMs', 'maxMs']) if (Number.isFinite(vad[k]) && vad[k] > 0) vadOpts[k] = vad[k];
  }
  const chunker = createChunker(vadOpts);
  const full = [];                   // Int16Array blocks
  let fullLen = 0;

  const releaseAll = () => {
    try { if (node) { node.onaudioprocess = null; if (node.port) node.port.onmessage = null; node.disconnect(); } } catch (e) { /* ignore */ }
    try { if (source) source.disconnect(); } catch (e) { /* ignore */ }
    try { if (mute) mute.disconnect(); } catch (e) { /* ignore */ }
    node = source = mute = null;
    if (workletUrl) { try { URL.revokeObjectURL(workletUrl); } catch (e) { /* ignore */ } workletUrl = null; }
    try { stream.getTracks().forEach(t => t.stop()); } catch (e) { /* ignore */ }
    if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
  };

  const deliver = chunks => {
    if (!onChunk) return;
    for (const c of chunks) {
      try { onChunk(wavBlob(encodeWav(c, TARGET_RATE)), idx++); } catch (e) { /* consumer error must not break recording */ }
    }
  };

  function handleBlock(input) {
    if (stopped || paused) return;
    const now = Date.now();
    if (now - lastLevel >= 80) {
      lastLevel = now;
      try { onLevel(Math.min(1, rms(input) * 6)); } catch (e) { /* ignore */ }
    }
    const pcm = ds.push(input);
    if (!pcm.length) return;
    if (onPcm) { try { onPcm(pcm); } catch (e) { /* consumer error must not break recording */ } }
    if (fullLen < FULL_CAP_SECONDS * TARGET_RATE) {
      const p = floatToPcm16(pcm);
      full.push(p); fullLen += p.length;
    }
    if (onChunk) deliver(chunker.push(pcm));     // streaming-only callers (onPcm) skip the VAD + per-chunk WAV work
  }

  try {
    source = actx.createMediaStreamSource(stream);
    mute = actx.createGain();
    mute.gain.value = 0;             // keep the graph alive without playing the mic back
    let ok = false;
    if (actx.audioWorklet && typeof AudioWorkletNode !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
      try {
        workletUrl = URL.createObjectURL(new Blob([WORKLET_CODE], { type: 'application/javascript' }));
        await actx.audioWorklet.addModule(workletUrl);
        node = new AudioWorkletNode(actx, 'noor-pcm', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
        node.port.onmessage = ev => handleBlock(ev.data);
        ok = true;
      } catch (e) {
        try { if (node) node.disconnect(); } catch (e2) { /* ignore */ }
        node = null;
      }
      if (workletUrl) { try { URL.revokeObjectURL(workletUrl); } catch (e) { /* ignore */ } workletUrl = null; }
    }
    if (!ok) {
      node = actx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = ev => handleBlock(new Float32Array(ev.inputBuffer.getChannelData(0)));
    }
    source.connect(node);
    node.connect(mute);
    mute.connect(actx.destination);
    if (actx.state === 'suspended') {
      await Promise.race([actx.resume().catch(() => {}), new Promise(res => setTimeout(res, 1500))]);
    }
    if (!actx || actx.state !== 'running') throw new Error('audio context not running');
  } catch (e) {
    releaseAll();
    onError('error');
    return null;
  }

  // The mic can be revoked/unplugged mid-session.
  stream.getAudioTracks().forEach(t => { t.onended = () => { if (!stopped) onError('error'); }; });

  let stopPromise = null;
  function stop() {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      stopped = true;
      if (!paused) activeMs += Date.now() - since;
      let blob = wavBlob(encodeWav(new Float32Array(0), TARGET_RATE));
      try {
        deliver(chunker.flush());
        const all = new Int16Array(fullLen);
        let o = 0;
        for (const p of full) { all.set(p, o); o += p.length; }
        full.length = 0;
        blob = wavBlob(encodeWavPcm16(all, TARGET_RATE));
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
    deliver(chunker.flush());          // don't lose what was said before the pause
    ds.reset();
    try { onLevel(0); } catch (e) { /* ignore */ }
  }
  function resume() {
    if (stopped || !paused) return;
    paused = false;
    since = Date.now();
    try { if (actx && actx.state === 'suspended') actx.resume().catch(() => {}); } catch (e) { /* ignore */ }
  }
  const elapsed = () => (activeMs + (stopped || paused ? 0 : Date.now() - since)) / 1000;

  return { stop, pause, resume, elapsed };
}
