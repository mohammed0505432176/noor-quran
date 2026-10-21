package app.noor.quran;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.util.ArrayList;

/**
 * Continuous Arabic speech recognition for live tasmee'.
 * - One SpeechRecognizer is reused; a new segment starts natively the moment the previous one ends
 *   (no JS round-trip, no destroy/create), so no words are lost between segments.
 * - Long silence limits so a pause between ayat does not end the segment.
 * - Every event carries a segment id: the final result replaces that segment's partial text instead of
 *   being appended again (no duplicated words).
 * Events: "partial" {seg, matches}, "final" {seg, matches}, "level" {v 0..1}, "state" {status}, "error" {code, fatal}
 */
@CapacitorPlugin(
    name = "NoorSpeech",
    permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone") }
)
public class NoorSpeechPlugin extends Plugin {

    private final Handler main = new Handler(Looper.getMainLooper());
    private SpeechRecognizer rec;
    private boolean active = false;
    private int seg = 0;
    private int errorsInRow = 0;
    private String lang = "ar-SA";
    private int maxResults = 3;
    private long lastLevel = 0;
    private final Runnable restart = new Runnable() {
        @Override
        public void run() {
            startSegment();
        }
    };

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        r.put("version", 1);
        call.resolve(r);
    }

    @PluginMethod
    public void start(final PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("permission", "permission");
            return;
        }
        lang = call.getString("language", "ar-SA");
        Integer mr = call.getInt("maxResults", 3);
        maxResults = mr == null ? 3 : mr;
        main.post(new Runnable() {
            @Override
            public void run() {
                try {
                    active = true;
                    errorsInRow = 0;
                    if (rec == null) create();
                    startSegment();
                    call.resolve();
                } catch (Exception e) {
                    active = false;
                    call.reject("error", "error");
                }
            }
        });
    }

    @PluginMethod
    public void stop(final PluginCall call) {
        main.post(new Runnable() {
            @Override
            public void run() {
                halt();
                call.resolve();
            }
        });
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        main.post(new Runnable() {
            @Override
            public void run() {
                if (active) halt();
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        active = false;
        main.removeCallbacks(restart);
        if (rec != null) {
            try { rec.destroy(); } catch (Exception e) { /* ignore */ }
            rec = null;
        }
    }

    private void halt() {
        boolean was = active;
        active = false;
        main.removeCallbacks(restart);
        if (rec != null) {
            try { rec.stopListening(); } catch (Exception e) { /* ignore */ }
        }
        if (was) state("stopped");
    }

    private void create() {
        rec = SpeechRecognizer.createSpeechRecognizer(getActivity());
        rec.setRecognitionListener(new Listener());
    }

    private void recreate() {
        if (rec != null) {
            try { rec.destroy(); } catch (Exception e) { /* ignore */ }
            rec = null;
        }
        create();
    }

    private Intent intent() {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, maxResults);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        i.putExtra("android.speech.extra.DICTATION_MODE", true);
        // do not end the segment on the natural pause between ayat
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 6000L);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 30000L);
        return i;
    }

    private void startSegment() {
        if (!active) return;
        main.removeCallbacks(restart);
        if (rec == null) create();
        seg++;
        try {
            rec.startListening(intent());
            state("listening");
        } catch (Exception e) {
            recreate();
            later(250);
        }
    }

    private void later(long ms) {
        if (!active) return;
        main.removeCallbacks(restart);
        main.postDelayed(restart, ms);
    }

    private void state(String s) {
        JSObject r = new JSObject();
        r.put("status", s);
        notifyListeners("state", r);
    }

    private void emit(String event, Bundle b) {
        ArrayList<String> m = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        JSObject r = new JSObject();
        r.put("seg", seg);
        r.put("matches", new JSArray(m == null ? new ArrayList<String>() : m));
        notifyListeners(event, r);
    }

    private class Listener implements RecognitionListener {

        @Override
        public void onReadyForSpeech(Bundle params) {}

        @Override
        public void onBeginningOfSpeech() {}

        @Override
        public void onRmsChanged(float rmsdB) {
            long now = System.currentTimeMillis();
            if (now - lastLevel < 90) return;
            lastLevel = now;
            float v = (rmsdB + 2f) / 12f;
            if (v < 0f) v = 0f;
            if (v > 1f) v = 1f;
            JSObject r = new JSObject();
            r.put("v", (double) v);
            notifyListeners("level", r);
        }

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {}

        @Override
        public void onPartialResults(Bundle partialResults) {
            emit("partial", partialResults);
        }

        @Override
        public void onResults(Bundle results) {
            errorsInRow = 0;
            emit("final", results);
            if (active) startSegment();          // immediately, no gap
        }

        @Override
        public void onEvent(int eventType, Bundle params) {}

        @Override
        public void onError(int error) {
            if (!active) return;
            if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                active = false;
                JSObject r = new JSObject();
                r.put("code", "permission");
                r.put("fatal", true);
                notifyListeners("error", r);
                state("stopped");
                return;
            }
            errorsInRow++;
            if (errorsInRow > 12) {
                active = false;
                JSObject r = new JSObject();
                r.put("code", error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT || error == SpeechRecognizer.ERROR_SERVER ? "network" : "error");
                r.put("fatal", true);
                notifyListeners("error", r);
                state("stopped");
                return;
            }
            switch (error) {
                case SpeechRecognizer.ERROR_NO_MATCH:
                case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                    startSegment();              // silence: keep listening right away
                    break;
                case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                    try { rec.cancel(); } catch (Exception e) { /* ignore */ }
                    later(120);
                    break;
                case SpeechRecognizer.ERROR_NETWORK:
                case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                case SpeechRecognizer.ERROR_SERVER:
                    later(500);
                    break;
                default:                          // ERROR_CLIENT / ERROR_AUDIO / others: fresh recognizer
                    recreate();
                    later(150);
                    break;
            }
        }
    }
}
