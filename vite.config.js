import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  // the worker loads the ORT runtime from /ort/ (wasmPaths): use the build that does not embed/emit its own .wasm
  resolve: { conditions: ['onnxruntime-web-use-extern-wasm'] },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  build: { target: 'es2020', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 }
});
