import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// shown in Settings > About: the CI release number (VERSION=2.1.<run>) or package.json when built locally
const APP_VERSION = process.env.VERSION || JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  // the worker loads the ORT runtime from /ort/ (wasmPaths): use the build that does not embed/emit its own .wasm
  resolve: { conditions: ['onnxruntime-web-use-extern-wasm'] },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  build: { target: 'es2020', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 }
});
