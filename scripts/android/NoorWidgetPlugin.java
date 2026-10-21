package app.noor.quran;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Feeds the home-screen prayer times widget (PrayerWidget).
 * update({ city, days: [{ date: "YYYY-MM-DD", fajr, sunrise, dhuhr, asr, maghrib, isha }] }) with epoch millis.
 * The sanitised JSON is stored in SharedPreferences "noor_widget" and every widget is redrawn.
 */
@CapacitorPlugin(name = "NoorWidget")
public class NoorWidgetPlugin extends Plugin {

    static final String PREFS = "noor_widget";
    static final String KEY_DATA = "data";
    static final String[] KEYS = { "fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha" };
    private static final int MAX_DAYS = 31;
    private static final int MAX_CITY = 60;

    /** Route requested by a widget tap ("prayer" only); set by MainActivity, consumed once by JS. */
    public static volatile String pendingRoute = null;

    @PluginMethod
    public void consumeRoute(PluginCall call) {
        String r = pendingRoute;
        pendingRoute = null;
        JSObject o = new JSObject();
        o.put("route", r == null ? "" : r);
        call.resolve(o);
    }

    @PluginMethod
    public void update(PluginCall call) {
        String city = call.getString("city", "");
        if (city == null) city = "";
        city = city.trim();
        if (city.length() > MAX_CITY) city = city.substring(0, MAX_CITY);

        JSArray days = call.getArray("days");
        if (days == null) {
            call.reject("days is required");
            return;
        }
        if (days.length() > MAX_DAYS) {
            call.reject("too many days (max " + MAX_DAYS + ")");
            return;
        }

        JSONArray clean = new JSONArray();
        try {
            for (int i = 0; i < days.length(); i++) {
                JSONObject d = days.optJSONObject(i);
                if (d == null) continue;
                String date = d.optString("date", "");
                if (!date.matches("\\d{4}-\\d{2}-\\d{2}")) continue;
                JSONObject o = new JSONObject();
                o.put("date", date);
                boolean ok = true;
                for (String k : KEYS) {
                    long t = d.optLong(k, 0L);
                    if (t <= 0L) { ok = false; break; }
                    o.put(k, t);
                }
                if (ok) clean.put(o);
            }
            JSONObject data = new JSONObject();
            data.put("city", city);
            data.put("days", clean);
            data.put("updated", System.currentTimeMillis());

            Context ctx = getContext();
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            sp.edit().putString(KEY_DATA, data.toString()).apply();
            int n = PrayerWidget.updateAll(ctx);

            JSObject r = new JSObject();
            r.put("days", clean.length());
            r.put("widgets", n);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("widget update failed: " + e.getMessage());
        }
    }
}
