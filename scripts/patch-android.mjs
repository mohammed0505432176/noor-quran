// Patches the generated android/ project (after `npx cap add android` + `npx cap sync android`).
// Idempotent: safe to run many times. Node builtins only.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...a) => resolve(root, 'android', ...a);
const log = (m) => console.log('[patch-android] ' + m);
const fail = (m) => { console.error('[patch-android] ERROR: ' + m); process.exit(1); };

function read(file) {
  if (!existsSync(file)) fail('missing file: ' + file + ' (did you run `npx cap add android`?)');
  return readFileSync(file, 'utf8');
}

// ---------- AndroidManifest.xml ----------
{
  const file = p('app/src/main/AndroidManifest.xml');
  let xml = read(file);
  const perms = ['INTERNET', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'USE_EXACT_ALARM',
    'RECEIVE_BOOT_COMPLETED', 'VIBRATE', 'WAKE_LOCK', 'ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'];
  if (!xml.includes('</manifest>')) fail('anchor </manifest> not found in AndroidManifest.xml');
  const missing = perms.filter((n) => !xml.includes('android:name="android.permission.' + n + '"'));
  let add = missing.map((n) => '    <uses-permission android:name="android.permission.' + n + '" />').join('\n');
  if (!xml.includes('android.speech.RecognitionService')) {
    add += (add ? '\n' : '') + '    <queries>\n        <intent>\n            <action android:name="android.speech.RecognitionService" />\n        </intent>\n    </queries>';
    log('manifest: added <queries> for RecognitionService');
  }
  if (add) {
    xml = xml.replace('</manifest>', add + '\n</manifest>');
    missing.forEach((n) => log('manifest: added permission ' + n));
  }
  if (!xml.includes('android:label="@string/app_name"')) fail('anchor android:label="@string/app_name" not found in manifest');
  if (xml.includes('android:allowBackup="true"')) {
    xml = xml.replace('android:allowBackup="true"', 'android:allowBackup="false"');
    log('manifest: set allowBackup=false');
  }
  // Google sign-in returns to the app through noor://auth (src/core/sync.js)
  if (!xml.includes('android:scheme="noor"')) {
    const deepLink = `<intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="noor" android:host="auth" />
            </intent-filter>
        `;
    const i = xml.indexOf('android:name=".MainActivity"');
    if (i < 0) fail('MainActivity not found in AndroidManifest.xml');
    const end = xml.indexOf('</activity>', i);
    if (end < 0) fail('</activity> of MainActivity not found');
    xml = xml.slice(0, end) + '    ' + deepLink + xml.slice(end);
    log('manifest: added noor://auth deep link to MainActivity');
  }  // home-screen prayer times widget (receiver class: scripts/android/PrayerWidget.java)
  if (!xml.includes('android:name=".PrayerWidget"')) {
    if (!xml.includes('</application>')) fail('anchor </application> not found in AndroidManifest.xml');
    const receiver = `<receiver
            android:name=".PrayerWidget"
            android:exported="true"
            android:label="مواقيت الصلاة">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.TIME_SET" />
                <action android:name="android.intent.action.TIMEZONE_CHANGED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/noor_widget_info" />
        </receiver>
    `;
    xml = xml.replace(/([ \t]*)<\/application>/, (m, ind) => ind + '    ' + receiver + m.trimStart());
    log('manifest: added PrayerWidget receiver');
  }
  writeFileSync(file, xml);
}

// ---------- strings.xml ----------
{
  const file = p('app/src/main/res/values/strings.xml');
  let xml = read(file);
  for (const key of ['app_name', 'title_activity_main']) {
    const re = new RegExp('<string name="' + key + '">[^<]*</string>');
    const line = '<string name="' + key + '">نور الحياة</string>';
    if (re.test(xml)) {
      if (!xml.includes(line)) { xml = xml.replace(re, line); log('strings: set ' + key); }
    } else {
      if (!xml.includes('</resources>')) fail('anchor </resources> not found in strings.xml');
      xml = xml.replace('</resources>', '    ' + line + '\n</resources>');
      log('strings: added ' + key);
    }
  }
  writeFileSync(file, xml);
}

// ---------- app/build.gradle ----------
{
  const file = p('app/build.gradle');
  let g = read(file);
  const before = g;

  if (!/^\s*versionCode\s+[^\n]+/m.test(g) || !/^\s*versionName\s+[^\n]+/m.test(g)) fail('versionCode/versionName anchors not found in app/build.gradle');
  g = g.replace(/^(\s*)versionCode\s+[^\n]+/m, "$1versionCode Integer.parseInt(System.getenv('NOOR_VERSION_CODE') ?: '1')");
  g = g.replace(/^(\s*)versionName\s+[^\n]+/m, "$1versionName (System.getenv('NOOR_VERSION_NAME') ?: '1.0')");

  if (!g.includes('// NOOR signing')) {
    if (!/\n    buildTypes \{/.test(g)) fail('anchor "buildTypes {" not found in app/build.gradle');
    g = g.replace('\n    buildTypes {', `
    // NOOR signing
    signingConfigs {
        release {
            if (System.getenv('NOOR_KEYSTORE')) {
                storeFile file(System.getenv('NOOR_KEYSTORE'))
                storePassword System.getenv('NOOR_STORE_PASSWORD')
                keyAlias System.getenv('NOOR_KEY_ALIAS')
                keyPassword System.getenv('NOOR_KEY_PASSWORD')
            }
        }
    }
    buildTypes {`);
  }
  if (!g.includes('// NOOR release signing')) {
    if (!/release \{\n\s+minifyEnabled\s+\w+/.test(g)) fail('anchor "release { minifyEnabled" not found in app/build.gradle');
    g = g.replace(/release \{\n(\s+)minifyEnabled\s+\w+/, (m, ind) =>
      'release {\n' + ind + '// NOOR release signing\n' + ind + "if (System.getenv('NOOR_KEYSTORE')) {\n" + ind + '    signingConfig signingConfigs.release\n' + ind + '}\n' + ind + 'minifyEnabled false');
  }
  if (g !== before) { writeFileSync(file, g); log('build.gradle: patched signing + version'); }
  else log('build.gradle: already patched');
}

// ---------- notification icon ----------
{
  const dir = p('app/src/main/res/drawable');
  mkdirSync(dir, { recursive: true });
  // 8-point star (two squares) with a crescent cut-out, white, 24dp.
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:fillType="evenOdd"
        android:pathData="M12,1.5 L15.1,5.4 L20.1,3.9 L18.6,8.9 L22.5,12 L18.6,15.1 L20.1,20.1 L15.1,18.6 L12,22.5 L8.9,18.6 L3.9,20.1 L5.4,15.1 L1.5,12 L5.4,8.9 L3.9,3.9 L8.9,5.4 Z M14.2,8 A4.2,4.2 0 1 0 14.2,16 A3.3,3.3 0 1 1 14.2,8 Z" />
</vector>
`;
  const file = resolve(dir, 'ic_stat_noor.xml');
  if (!existsSync(file) || readFileSync(file, 'utf8') !== xml) { writeFileSync(file, xml); log('wrote drawable/ic_stat_noor.xml'); }
  else log('ic_stat_noor.xml unchanged');
}

// ---------- native plugins (NoorSpeech, NoorWidget) + prayer widget ----------
{
  const dir = p('app/src/main/java/app/noor/quran');
  const main = resolve(dir, 'MainActivity.java');
  for (const name of ['NoorSpeechPlugin.java', 'NoorWidgetPlugin.java', 'PrayerWidget.java']) {
    const src = read(resolve(root, 'scripts/android', name));
    const dst = resolve(dir, name);
    if (!existsSync(dst) || readFileSync(dst, 'utf8') !== src) { writeFileSync(dst, src); log('wrote ' + name); }
  }
  const act = read(main);
  const plugins = ['NoorSpeechPlugin', 'NoorWidgetPlugin'];
  if (!plugins.every((c) => act.includes('registerPlugin(' + c + '.class)')) || !act.includes('onNewIntent')) {
    if (!/class MainActivity extends BridgeActivity/.test(act)) fail('MainActivity anchor not found');
    // an onCreate we did not write (no NoorSpeech registration) means a hand-edited activity: do not clobber it
    if (/onCreate\s*\(/.test(act) && !act.includes('registerPlugin(NoorSpeechPlugin.class)')) fail('MainActivity already has a custom onCreate; add registerPlugin calls manually');
    writeFileSync(main, `package app.noor.quran;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
${plugins.map((c) => '        registerPlugin(' + c + '.class);').join('\n')}
        super.onCreate(savedInstanceState);
        saveRoute(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        saveRoute(intent);
    }

    private static void saveRoute(Intent intent) {
        if (intent == null) return;
        String r = intent.getStringExtra("route");
        if ("prayer".equals(r)) NoorWidgetPlugin.pendingRoute = r;
    }
}
`);
    log('MainActivity: registered ' + plugins.join(', '));
  }
}

// ---------- resources (scripts/android/res/** -> app/src/main/res/**): widget layouts/drawables + res/raw adhan sounds ----------
{
  const srcRoot = resolve(root, 'scripts/android/res');
  if (!existsSync(srcRoot)) fail('missing directory: ' + srcRoot);
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(resolve(d, e.name)) : [resolve(d, e.name)]);
  const files = walk(srcRoot);
  if (!files.length) fail('no resources found in ' + srcRoot);
  let n = 0;
  for (const src of files) {
    const rel = relative(srcRoot, src);
    const dst = p('app/src/main/res', rel);
    const buf = readFileSync(src);
    if (existsSync(dst) && readFileSync(dst).equals(buf)) continue;
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, buf);
    log('wrote res/' + rel.split(sep).join('/'));
    n++;
  }
  if (!n) log('resources unchanged');
}

// ---------- verify what local notifications reference by name (a missing resource fails silently on device) ----------
{
  const need = ['drawable/ic_stat_noor.xml', 'raw/adhan.mp3', 'raw/adhan_short.mp3'];
  for (const f of need) {
    const file = p('app/src/main/res', f);
    if (!existsSync(file) || !readFileSync(file).length) fail('notification resource missing or empty: res/' + f);
  }
  log('notification resources verified (ic_stat_noor, adhan, adhan_short)');
}

log('done');
