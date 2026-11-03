import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ONE version string: CI sets VERSION (same value for the Pages build and the APK, see the workflows); local builds use package.json.
// Shown in Settings > About and More, and used as the service worker cache name.
const APP_VERSION = process.env.VERSION || JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

// Fills __BUILD_VERSION__ and the precache list (built JS/CSS + woff2 fonts) in dist/sw.js so each release has its own shell cache.
function swManifest() {
  let outDir = 'dist';
  return {
    name: 'noor-sw-manifest',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const sw = join(outDir, 'sw.js');
      if (!existsSync(sw)) return;
      const adir = join(outDir, 'assets');
      const files = existsSync(adir) ? readdirSync(adir).filter(f => /\.(js|css|woff2)$/.test(f) && statSync(join(adir, f)).isFile()) : [];
      const list = files.map(f => './assets/' + f);
      let s = readFileSync(sw, 'utf8');
      s = s.replace(/__BUILD_VERSION__/g, APP_VERSION.replace(/[^\w.-]/g, '_')).replace('/*__PRECACHE__*/[]', JSON.stringify(list));
      writeFileSync(sw, s);
    }
  };
}

export default defineConfig({
  // relative base: works under /noor-quran/ on GitHub Pages, at the root of any host, and inside the Capacitor WebView
  base: './',
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [swManifest()],
  // the worker loads the ORT runtime from /ort/ (wasmPaths): use the build that does not embed/emit its own .wasm
  resolve: { conditions: ['onnxruntime-web-use-extern-wasm'] },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  build: { target: 'es2020', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 }
});
