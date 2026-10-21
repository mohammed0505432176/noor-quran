// Copies the onnxruntime-web plain (single-thread) wasm runtime into public/ort/ for the on-device Quran engine.
import fs from 'node:fs';
const distDir = new URL('../node_modules/onnxruntime-web/dist/', import.meta.url);
const outDir = new URL('../public/ort/', import.meta.url);
fs.mkdirSync(outDir, { recursive: true });
for (const name of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  const src = new URL(name, distDir);
  const dst = new URL(name, outDir);
  const size = fs.statSync(src).size;
  if (fs.existsSync(dst) && fs.statSync(dst).size === size) { console.log(`ort: ${name} up to date (${size} bytes)`); continue; }
  fs.copyFileSync(src, dst);
  console.log(`ort: copied ${name} (${size} bytes)`);
}
