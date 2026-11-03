# Recitation testing and web / Android notes

## What the automated tests prove (and what they do not)
`npm test` checks pure functions: matcher verdicts on real Quran text, the position guard, page-turn decisions, hint rules,
error handling. They are **not** evidence of recognition accuracy on a real voice.

## Real-audio run (engine + real recitation audio)
`tools/engine-audio-test.html` (dev server: `npx vite`, open `/tools/engine-audio-test.html`) feeds real recitation audio
(everyayah.com, Alafasy) through the real on-device engine (the model from the Pages build) in a browser, paced at 4x real time.
Run on 2026-11-03, Chrome-based pane, 960 ms silence between ayahs. Letters = per-word verdict (o ok, u unsure, w wrong, p pending, s skipped).

| Case | Result |
|---|---|
| Correct, Al-Ikhlas 1-4 (range mode) | every word `o` (15/15), no issues |
| Omit ayah 2 | ayah 2 `w p`, issue `possible_skipped_ayah` (a *possible* issue: the app never stops on it). **Ayah 3 stayed `pp` although it was recited**: the engine does not recover quickly after a skipped ayah |
| Ayah 2 replaced by 113:1 | ayah 2 `ww`; ayah 3 `ouou` and ayah 4 `wsswp`: the engine's recovery after a replaced ayah is weak (the following correct words are partly flagged) |
| Ayah 1 recited twice | all `o`, only `possible_repetition` (not an error) |
| Free mode: 2:1-5, then 3:1-2 (3:2 has the same text as 2:255), then 2:6-7 | locked on surah 2 and stayed there; no verdict for surah 3; one stray word was attributed to **2:255** (a far jump inside the surah) — the new position guard (3 consecutive words) rejects exactly this |
| Free mode: Al-Fatiha 1-7 then Al-Baqarah 1-3 | the move to Al-Baqarah was **held back and offered as a relocation** (`relocate_suggest`), not taken automatically; the user taps «إعادة تحديد الموضع» |

Not covered by any of this: a live human voice and microphone, background noise, children's voices, tajweed variations,
different phones. Audio from the same professional reciter is the best case for the model.

## Manual device checklist (required before calling recitation accurate)
1. Recite 20 ayahs correctly into the mic: no false errors, no wrong jumps. 2. Skip a word, replace a word, repeat a word.
3. Recite similar ayahs (Ar-Rahman refrain, 2:255 vs 3:2): the place must not move to another surah.
4. Pause 10 s and resume. 5. Deny the mic permission: message + «إعادة المحاولة». 6. Airplane mode with the on-device engine (works) and
with Whisper (needs internet, says so). 7. Last word of a page: the page turns only after it.

## Privacy
* On-device engine: audio never leaves the device. «الفوري» uses the device/browser speech service (may use the network, said in the UI).
* Whisper («دقيق»): the recording is sent to the Noor server; the warning is shown before choosing it. No automatic switch to a cloud engine.
* Raw recordings are **not saved by default**; Settings → «حفظ تسجيلات صوتي» (on-device only) turns it on.

## Web vs Android (one shared code base)
* Same `src/`; native plugins are dynamic imports behind `isNative()` (platform.js), so the site never needs them.
* Speech: Android uses the Capacitor speech plugin; the web uses `SpeechRecognition` / `webkitSpeechRecognition` when present, else says it is unsupported.
* On-device engine: both use WebAssembly + Worker + Cache Storage; the APK fetches the model from the Pages site (CORS *), the website uses same-origin files.
* Android only: back button, status bar, local notifications, geolocation plugin. Web: PWA install, service worker offline shell.
* Version: one string (package.json major.minor + commit count) for the APK and the Pages build.
