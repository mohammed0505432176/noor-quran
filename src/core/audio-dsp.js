// Pure audio helpers (no DOM / Web Audio) so they can be unit-tested in node.
// Used by recorder.js: PCM downsampling, WAV encoding, energy VAD and a pause-aware chunker.

export const TARGET_RATE = 16000;

/** Root-mean-square of a block of samples. */
export function rms(samples) {
  const n = samples.length;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / n);
}

/**
 * Stateful area-averaging resampler (box low-pass + decimation). Each output sample is the mean of
 * exactly inRate/outRate input samples (fractional edges are weighted), so there is no aliasing
 * from naive decimation and block boundaries introduce no phase drift. push() returns the new output.
 */
export function createDownsampler(inRate, outRate) {
  const ratio = inRate / outRate;
  let need = ratio;      // input weight still missing for the current output sample
  let acc = 0;
  return {
    push(input) {
      const out = new Float32Array(Math.ceil(input.length / ratio) + 1);
      let o = 0;
      for (let i = 0; i < input.length; i++) {
        const x = input[i];
        let w = 1;
        while (w > 1e-9) {
          const take = w < need ? w : need;
          acc += x * take;
          need -= take;
          w -= take;
          if (need <= 1e-9) {
            out[o++] = acc / ratio;
            acc = 0;
            need = ratio;
          }
        }
      }
      return out.subarray(0, o);
    },
    reset() { need = ratio; acc = 0; }
  };
}

/** One-shot resample of a whole buffer. */
export function downsample(input, inRate, outRate) {
  if (inRate === outRate) return Float32Array.from(input);
  const out = createDownsampler(inRate, outRate).push(input);
  return Float32Array.from(out);
}

/** Float32 [-1,1] (clipped) -> Int16. */
export function floatToPcm16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i];
    if (!(s === s)) s = 0;                       // NaN guard
    s = s > 1 ? 1 : s < -1 ? -1 : s;
    out[i] = Math.round(s < 0 ? s * 32768 : s * 32767);
  }
  return out;
}

/** 16-bit mono PCM -> complete WAV file bytes (RIFF/WAVE, fmt chunk, data chunk). */
export function encodeWavPcm16(pcm, sampleRate = TARGET_RATE) {
  const dataLen = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataLen, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);            // fmt chunk size
  v.setUint16(20, 1, true);             // PCM
  v.setUint16(22, 1, true);             // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true);             // block align
  v.setUint16(34, 16, true);            // bits per sample
  str(36, 'data');
  v.setUint32(40, dataLen, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i], true);
  return new Uint8Array(buf);
}

/** Float32 mono samples (clipped to [-1,1]) -> 16-bit PCM WAV bytes. */
export function encodeWav(samples, sampleRate = TARGET_RATE) {
  return encodeWavPcm16(floatToPcm16(samples), sampleRate);
}

/**
 * Energy voice-activity detector with an adaptive noise floor.
 *
 *   const vad = createVad(opts);
 *   vad.push(frameRms, frameMs) -> 'speech' | 'silence' | 'cut' | null
 *   vad.reset(full = false)       // clears speech state; the noise floor is kept unless full === true
 *
 * push() classifies one frame (speech if rms >= max(floor*3, 0.01)). It returns 'cut' for the frame on
 * which a chunk must be closed; details are then in vad.lastCut = { reason, trimTailMs }:
 *   reason 'silence': speech >= minSpeechMs followed by >= silenceMs of quiet. Cut in the middle of the
 *                     silence, i.e. drop the last trimTailMs of the audio buffered so far.
 *   reason 'max':     the chunk reached maxMs; trimTailMs is null (caller picks the quietest frame
 *                     in the last ~1.5 s). The caller must call reset() and replay the audio after
 *                     the cut point if it wants to continue.
 * After 'cut' the detector is reset (floor kept). A short burst (< minBurstMs) followed by a long silence
 * (>= longSilenceMs) is discarded silently. null is returned only for invalid input.
 * Getters: active, speechMs, silenceMs, floor, threshold, lastCut.
 */
export function createVad(opts = {}) {
  const {
    minSpeechMs = 1000, silenceMs = 550, maxMs = 12000,
    minThreshold = 0.01, floorMult = 3, floorCap = 0.02,
    floorWindow = 150, floorPercentile = 0.2,
    longSilenceMs = 1500, minBurstMs = 250
  } = opts;
  let hist = [];
  let floor = 0, sinceSort = 0;
  let active = false, span = 0, speech = 0, sil = 0;
  let lastCut = null;

  const threshold = () => Math.max(floor * floorMult, minThreshold);

  function pushFloor(r) {
    hist.push(r);
    if (hist.length > floorWindow) hist.shift();
    if (hist.length >= 10 && ++sinceSort >= 5) {
      sinceSort = 0;
      const s = hist.slice().sort((a, b) => a - b);
      floor = Math.min(floorCap, s[Math.floor((s.length - 1) * floorPercentile)]);
    }
  }
  function clear() { active = false; span = 0; speech = 0; sil = 0; }

  return {
    push(frameRms, frameMs) {
      if (typeof frameRms !== 'number' || !(frameMs > 0) || frameRms !== frameRms) return null;
      const isSpeech = frameRms >= threshold();
      if (!isSpeech) pushFloor(frameRms);
      if (!active) {
        if (!isSpeech) return 'silence';
        active = true; span = frameMs; speech = frameMs; sil = 0;
        return 'speech';
      }
      span += frameMs;
      if (isSpeech) { speech += frameMs; sil = 0; } else sil += frameMs;

      if (span >= maxMs) {
        lastCut = { reason: 'max', trimTailMs: null };
        clear();
        return 'cut';
      }
      if (!isSpeech) {
        if (speech >= minSpeechMs && sil >= silenceMs) {
          lastCut = { reason: 'silence', trimTailMs: sil - Math.min(sil / 2, 300) };
          clear();
          return 'cut';
        }
        if (sil >= longSilenceMs) {
          if (speech >= minBurstMs) {
            lastCut = { reason: 'silence', trimTailMs: sil - Math.min(sil / 2, 300) };
            clear();
            return 'cut';
          }
          clear();                       // lone click / noise burst: drop it
          return 'silence';
        }
      }
      return isSpeech ? 'speech' : 'silence';
    },
    reset(full = false) {
      clear();
      if (full) { hist = []; floor = 0; sinceSort = 0; lastCut = null; }
    },
    get active() { return active; },
    get speechMs() { return speech; },
    get silenceMs() { return sil; },
    get floor() { return floor; },
    get threshold() { return threshold(); },
    get lastCut() { return lastCut; }
  };
}

/**
 * Cuts a 16 kHz mono PCM stream into speech chunks at natural pauses.
 *   const ch = createChunker(opts);
 *   ch.push(Float32Array16k) -> Float32Array[]   // zero or more finished chunks
 *   ch.flush()               -> Float32Array[]   // remaining speech (stop / pause); resets the chunker
 * Chunks always contain speech, start with ~prerollMs of lead-in, and never exceed ~maxMs. Forced
 * cuts happen at the quietest 20 ms frame within the last maxBackMs.
 */
export function createChunker(opts = {}) {
  const { sampleRate = TARGET_RATE, frameMs = 20, prerollMs = 200, maxBackMs = 1500, minFlushSpeechMs = 200 } = opts;
  const frameN = Math.round(sampleRate * frameMs / 1000);
  const preroll = Math.ceil(prerollMs / frameMs);
  const maxBack = Math.ceil(maxBackMs / frameMs);
  const vad = createVad(opts);
  let ring = [];
  let pend = new Float32Array(frameN), pn = 0;
  let out = [];

  function emit(frames) {
    if (!frames.length) return;
    const a = new Float32Array(frames.length * frameN);
    frames.forEach((f, i) => a.set(f.d, i * frameN));
    out.push(a);
  }
  function trimRing() { if (!vad.active && ring.length > preroll) ring = ring.slice(ring.length - preroll); }

  function onFrame(d) {
    ring.push({ d, r: rms(d) });
    const res = vad.push(ring[ring.length - 1].r, frameMs);
    if (res === 'cut') {
      const info = vad.lastCut;
      if (info.reason === 'silence') {
        const trim = Math.min(ring.length - 1, Math.round(info.trimTailMs / frameMs));
        emit(ring.slice(0, ring.length - trim));
        ring = ring.slice(ring.length - trim);
        vad.reset();
      } else {
        const lo = Math.max(1, ring.length - maxBack);
        let best = ring.length - 1, bestR = Infinity;
        for (let i = ring.length - 1; i >= lo; i--) if (ring[i].r < bestR) { bestR = ring[i].r; best = i; }
        emit(ring.slice(0, best));
        const rest = ring.slice(best);
        ring = rest;
        vad.reset();
        for (const f of rest) vad.push(f.r, frameMs);
      }
    }
    trimRing();
  }

  function drain() { const o = out; out = []; return o; }

  return {
    push(samples) {
      let i = 0;
      while (i < samples.length) {
        const n = Math.min(frameN - pn, samples.length - i);
        pend.set(samples.subarray(i, i + n), pn);
        pn += n; i += n;
        if (pn === frameN) { const d = pend; pend = new Float32Array(frameN); pn = 0; onFrame(d); }
      }
      return drain();
    },
    flush() {
      if (pn > 0) { onFrame(pend.slice(0, frameN)); pend = new Float32Array(frameN); pn = 0; }
      if (vad.active && vad.speechMs >= minFlushSpeechMs) {
        const keepSil = Math.ceil(300 / frameMs);
        const trail = Math.floor(vad.silenceMs / frameMs);
        const trim = Math.max(0, Math.min(ring.length - 1, trail - keepSil));
        emit(ring.slice(0, ring.length - trim));
      }
      ring = [];
      vad.reset();
      return drain();
    },
    get vad() { return vad; }
  };
}
