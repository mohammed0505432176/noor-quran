// Patches the generated android/ project (after `npx cap add android` + `npx cap sync android`).
// Idempotent: safe to run many times. Node builtins only.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
  const perms = ['INTERNET', 'RECORD_AUDIO', 'POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'USE_EXACT_ALARM',
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
  writeFileSync(file, xml);
}

// ---------- strings.xml ----------
{
  const file = p('app/src/main/res/values/strings.xml');
  let xml = read(file);
  for (const key of ['app_name', 'title_activity_main']) {
    const re = new RegExp('<string name="' + key + '">[^<]*</string>');
    const line = '<string name="' + key + '">نور</string>';
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
  g = g.replace(/^(\s*)versionCode\s+[^\n]+/m, "$1versionCode (System.getenv('NOOR_VERSION_CODE') ?: '1').toInteger()");
  g = g.replace(/^(\s*)versionName\s+[^\n]+/m, "$1versionName System.getenv('NOOR_VERSION_NAME') ?: '1.0'");

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

log('done');
