package app.noor.quran;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.text.format.DateFormat;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen prayer times widget. Data comes from NoorWidgetPlugin (SharedPreferences "noor_widget").
 * Shows the next prayer (big) with a countdown computed at render time and the five prayers of the day.
 * Refreshes at min(next prayer, now + 15 min) via a non-wakeup alarm, plus updatePeriodMillis.
 */
public class PrayerWidget extends AppWidgetProvider {

    static final String ACTION_REFRESH = "app.noor.quran.WIDGET_REFRESH";
    private static final long REFRESH_MS = 15L * 60L * 1000L;
    private static final int GOLD = Color.parseColor("#D9B765");
    private static final int INK = Color.parseColor("#F3EAD3");
    private static final int MUTED = Color.parseColor("#A6F3EAD3");

    // five prayers shown in the row (sunrise is not a prayer; it is never "next")
    private static final String[] ROW_KEYS = { "fajr", "dhuhr", "asr", "maghrib", "isha" };
    private static final int[] ROW_CELL = { R.id.w_p0, R.id.w_p1, R.id.w_p2, R.id.w_p3, R.id.w_p4 };
    private static final int[] ROW_NAME = { R.id.w_n0, R.id.w_n1, R.id.w_n2, R.id.w_n3, R.id.w_n4 };
    private static final int[] ROW_TIME = { R.id.w_t0, R.id.w_t1, R.id.w_t2, R.id.w_t3, R.id.w_t4 };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        updateAll(ctx);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle opts) {
        try {
            mgr.updateAppWidget(id, build(ctx, opts, System.currentTimeMillis()));
        } catch (Exception e) { /* ignore */ }
    }

    @Override
    public void onDisabled(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(refreshIntent(ctx));
        } catch (Exception e) { /* ignore */ }
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent == null ? null : intent.getAction();
        if (ACTION_REFRESH.equals(a)
                || Intent.ACTION_BOOT_COMPLETED.equals(a)
                || Intent.ACTION_TIME_CHANGED.equals(a)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(a)
                || Intent.ACTION_DATE_CHANGED.equals(a)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            updateAll(ctx);
        }
    }

    /** Redraws every placed widget and schedules the next refresh. Returns the number of widgets. */
    static int updateAll(Context ctx) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            if (mgr == null) return 0;
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, PrayerWidget.class));
            long now = System.currentTimeMillis();
            for (int id : ids) {
                try {
                    mgr.updateAppWidget(id, build(ctx, mgr.getAppWidgetOptions(id), now));
                } catch (Exception e) { /* keep going for the other widgets */ }
            }
            if (ids.length > 0) scheduleNext(ctx, now);
            return ids.length;
        } catch (Exception e) {
            return 0;
        }
    }

    // ---------- data ----------

    private static JSONObject load(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(NoorWidgetPlugin.PREFS, Context.MODE_PRIVATE);
            String s = sp.getString(NoorWidgetPlugin.KEY_DATA, null);
            return s == null ? null : new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    private static String dateKey(long t) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(t));
    }

    private static JSONObject findDay(JSONArray days, String key) {
        if (days == null) return null;
        for (int i = 0; i < days.length(); i++) {
            JSONObject d = days.optJSONObject(i);
            if (d != null && key.equals(d.optString("date"))) return d;
        }
        return null;
    }

    /** Next prayer at/after now: { day, index in ROW_KEYS, time } or null. */
    private static Object[] next(JSONArray days, long now) {
        JSONObject today = findDay(days, dateKey(now));
        if (today != null) {
            for (int i = 0; i < ROW_KEYS.length; i++) {
                long t = today.optLong(ROW_KEYS[i], 0L);
                if (t > now) return new Object[] { today, i, t };
            }
        }
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        c.add(Calendar.DAY_OF_MONTH, 1);
        JSONObject tomorrow = findDay(days, dateKey(c.getTimeInMillis()));
        if (tomorrow != null) {
            long t = tomorrow.optLong("fajr", 0L);
            if (t > now) return new Object[] { tomorrow, 0, t };
        }
        return null;
    }

    // ---------- rendering ----------

    private static String digits(String s) {
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            b.append(ch >= '0' && ch <= '9' ? (char) ('٠' + (ch - '0')) : ch);
        }
        return b.toString();
    }

    private static String clock(Context ctx, long t, boolean withSuffix) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(t);
        int h = c.get(Calendar.HOUR_OF_DAY);
        int m = c.get(Calendar.MINUTE);
        boolean h24 = DateFormat.is24HourFormat(ctx);
        String s;
        if (h24) {
            s = String.format(Locale.US, "%02d:%02d", h, m);
        } else {
            int h12 = h % 12 == 0 ? 12 : h % 12;
            s = String.format(Locale.US, "%d:%02d", h12, m);
            if (withSuffix) s = s + " " + ctx.getString(h < 12 ? R.string.noor_w_am : R.string.noor_w_pm);
        }
        return digits(s);
    }

    private static String prayerName(Context ctx, String key, long t) {
        if ("dhuhr".equals(key)) {
            Calendar c = Calendar.getInstance();
            c.setTimeInMillis(t);
            if (c.get(Calendar.DAY_OF_WEEK) == Calendar.FRIDAY) return ctx.getString(R.string.noor_w_jumua);
            return ctx.getString(R.string.noor_w_dhuhr);
        }
        if ("fajr".equals(key)) return ctx.getString(R.string.noor_w_fajr);
        if ("sunrise".equals(key)) return ctx.getString(R.string.noor_w_sunrise);
        if ("asr".equals(key)) return ctx.getString(R.string.noor_w_asr);
        if ("maghrib".equals(key)) return ctx.getString(R.string.noor_w_maghrib);
        return ctx.getString(R.string.noor_w_isha);
    }

    private static PendingIntent openApp(Context ctx) {
        Intent i = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (i == null) i = new Intent(ctx, MainActivity.class);
        i.putExtra("route", "prayer");
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        return PendingIntent.getActivity(ctx, 7301, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static RemoteViews build(Context ctx, Bundle opts, long now) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.noor_widget);
        v.setOnClickPendingIntent(R.id.w_root, openApp(ctx));

        // compact mode (short widget): hide the five-prayer row
        boolean compact = false;
        if (opts != null) {
            int minH = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
            compact = minH > 0 && minH < 100;
        }

        JSONObject data = load(ctx);
        JSONArray days = data == null ? null : data.optJSONArray("days");
        String city = data == null ? "" : data.optString("city", "");
        v.setTextViewText(R.id.w_city, city);

        if (days == null || days.length() == 0) {
            showMessage(v, ctx.getString(R.string.noor_w_empty));
            return v;
        }
        Object[] nx = next(days, now);
        if (nx == null) {
            showMessage(v, ctx.getString(R.string.noor_w_stale));
            return v;
        }
        JSONObject day = (JSONObject) nx[0];
        int idx = (Integer) nx[1];
        long at = (Long) nx[2];

        v.setViewVisibility(R.id.w_msg, View.GONE);
        v.setViewVisibility(R.id.w_main, View.VISIBLE);
        v.setTextViewText(R.id.w_next_name, prayerName(ctx, ROW_KEYS[idx], at));
        v.setTextViewText(R.id.w_next_time, clock(ctx, at, true));

        long mins = Math.max(0L, (at - now + 59999L) / 60000L);
        String left = digits(String.format(Locale.US, "%d:%02d", mins / 60L, mins % 60L));
        v.setTextViewText(R.id.w_left, ctx.getString(R.string.noor_w_left, left));

        v.setViewVisibility(R.id.w_row, compact ? View.GONE : View.VISIBLE);
        for (int i = 0; i < ROW_KEYS.length; i++) {
            long t = day.optLong(ROW_KEYS[i], 0L);
            boolean isNext = i == idx;
            v.setTextViewText(ROW_NAME[i], prayerName(ctx, ROW_KEYS[i], t));
            v.setTextViewText(ROW_TIME[i], t > 0 ? clock(ctx, t, false) : "--");
            v.setTextColor(ROW_NAME[i], isNext ? GOLD : MUTED);
            v.setTextColor(ROW_TIME[i], isNext ? GOLD : INK);
            v.setInt(ROW_CELL[i], "setBackgroundResource", isNext ? R.drawable.noor_widget_chip : 0);
        }
        return v;
    }

    private static void showMessage(RemoteViews v, String msg) {
        v.setViewVisibility(R.id.w_main, View.GONE);
        v.setViewVisibility(R.id.w_row, View.GONE);
        v.setViewVisibility(R.id.w_msg, View.VISIBLE);
        v.setTextViewText(R.id.w_msg, msg);
    }

    // ---------- refresh scheduling ----------

    private static PendingIntent refreshIntent(Context ctx) {
        Intent i = new Intent(ctx, PrayerWidget.class);
        i.setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(ctx, 7302, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void scheduleNext(Context ctx, long now) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            long at = now + REFRESH_MS;
            boolean atPrayer = false;
            JSONObject data = load(ctx);
            JSONArray days = data == null ? null : data.optJSONArray("days");
            Object[] nx = days == null ? null : next(days, now);
            if (nx != null) {
                long p = (Long) nx[2] + 1000L;
                if (p < at) { at = p; atPrayer = true; }
            }
            PendingIntent pi = refreshIntent(ctx);
            // RTC (non-wakeup): fires when the device is awake, which is when the home screen can be seen.
            boolean exactOk = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
            if (atPrayer && exactOk) am.setExact(AlarmManager.RTC, at, pi);
            else am.set(AlarmManager.RTC, at, pi);
        } catch (Exception e) { /* ignore: updatePeriodMillis still refreshes */ }
    }
}
