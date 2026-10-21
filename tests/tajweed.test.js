import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTajweed, tokenize, TAJWEED_LEGEND } from '../src/core/tajweed.js';

const san = h => sanitizeTajweed(h, tokenize);

test('keeps allowed tajweed class as span', () => {
  assert.equal(san('بِسْمِ <tajweed class=ham_wasl>ٱ</tajweed>للَّهِ'), 'بِسْمِ <span class="tj tj-ham_wasl">ٱ</span>للَّهِ');
  assert.equal(san('<tajweed class="qalaqah">ق</tajweed>'), '<span class="tj tj-qalaqah">ق</span>');
});

test('strips script/img/onerror and attributes, keeps text', () => {
  const out = san('a<script>alert(1)</script><img src=x onerror=alert(1)><b onclick="x()">b</b><tajweed class=iqlab onclick="x()" style="color:red">c</tajweed>');
  assert.equal(out, 'aalert(1)b<span class="tj tj-iqlab">c</span>');
  assert.ok(!/onerror|onclick|<script|<img|style/.test(out));
});

test('unknown or malformed class becomes plain text', () => {
  assert.equal(san('<tajweed class=evil_rule>x</tajweed>'), 'x');
  assert.equal(san('<tajweed class="ham_wasl onclick">x</tajweed>'), 'x');
  assert.equal(san('<tajweed class="a1">x</tajweed>'), 'x');
  assert.equal(san('<tajweed>x</tajweed>'), 'x');
  assert.equal(san('<span class=ham_wasl>x</span>'), 'x');
});

test('nested tags are flattened', () => {
  assert.equal(san('<tajweed class=ghunnah>a<tajweed class=ikhafa>b</tajweed>c</tajweed>'), '<span class="tj tj-ghunnah">abc</span>');
  assert.equal(san('<div><p><i>x</i></p></div>'), 'x');
});

test('entities are escaped (no markup smuggling)', () => {
  assert.equal(san('&lt;script&gt;alert(1)&lt;/script&gt;'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(san('a & b "q" \'s\''), 'a &amp; b &quot;q&quot; &#39;s&#39;');
  assert.ok(!san('x &#60;img src=x&#62;').includes('<img'));
});

test('ayah end span is removed with its number', () => {
  assert.equal(san('نص <span class=end>١</span>'), 'نص ');
  assert.equal(san('نص <span class="end">١<b>x</b></span>'), 'نص ');
});

test('unclosed and stray tags are safe', () => {
  assert.equal(san('<tajweed class=madda_normal>x'), '<span class="tj tj-madda_normal">x</span>');
  assert.equal(san('x</tajweed></span>y'), 'xy');
  assert.equal(san('<!-- c -->t'), 't');
});

test('legend covers the API classes', () => {
  const api = 'ham_wasl laam_shamsiyah madda_normal madda_permissible madda_necessary madda_obligatory qalaqah ikhafa ikhafa_shafawi idgham_ghunnah idgham_wo_ghunnah idgham_shafawi iqlab ghunnah slnt'.split(' ');
  const got = TAJWEED_LEGEND.map(l => l.cls);
  for (const c of api) assert.ok(got.includes(c), c);
  for (const l of TAJWEED_LEGEND) assert.ok(l.name && l.desc);
});
