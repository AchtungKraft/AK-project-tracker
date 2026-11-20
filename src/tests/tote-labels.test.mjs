// Tote Label V2.1 — canonical renderer, pagination, QR payload/contrast, drafts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { writeFileSync } from 'node:fs';

const out = '/tmp/tote-labels-bundle.mjs';
const entry = '/tmp/tote-labels-entry.mjs';
writeFileSync(entry, `
export * from '/app/src/components/inventory/labels/toteLabelDocument.js';
export * from '/app/src/components/inventory/labels/labelColors.js';
export * from '/app/src/components/inventory/labels/labelDrafts.js';
export { renderQRSVGString } from '/app/src/components/inventory/QRCodeSVG.jsx';`);
buildSync({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, jsx: 'automatic', logLevel: 'silent' });
const L = await import(out);

const cats = [
  { id: 'int', name: 'Interior', color: '#2563eb' }, { id: 'ext', name: 'Exterior', color: '#7c3aed' },
  { id: 'mech', name: 'Mechanical', color: '#16a34a' }, { id: 'hw', name: 'Hardware', color: '#ea580c' },
  { id: 'gen', name: 'General Storage', color: '#6b7280', key: 'general' },
];
// Read-only copy of the live "Random Interior Parts" container fields.
const rip = { id: '6ada528664c85ceed0da86b5', name: 'Random Interior Parts', short_code: 'TOTE-9419C0F654-001',
  qr_code_value: 'AK_CTR:6ada296b1d3a8cb1a0d558ac', container_type: 'tote' };
const label = (n, cat) => ({ name: 'Test Tote ' + n, short_code: `TOTE-TEST-00${n}`, qr_code_value: `AK_CTR:${String(n).repeat(24)}`, category: cats.find(c => c.id === cat) });
const count = (html, re) => (html.match(re) || []).length;

test('single container: one 8 × 3 label on one page, real name and number', () => {
  const html = L.buildToteLabelDocument([L.toPrintLabel(L.draftFromContainer(rip), cats)]);
  assert.equal(count(html, /class="sheet"/g), 1);
  assert.equal(count(html, /class="tl"/g), 1);
  assert.ok(html.includes('Random Interior Parts') && html.includes('TOTE-9419C0F654-001'));
  assert.ok(html.includes('STORAGE — GENERAL STORAGE'), 'no category falls back to General Storage');
  assert.match(L.TOTE_LABEL_CSS, /\.tl\{width:8in;height:3in;flex:none/);
  assert.match(L.TOTE_LABEL_CSS, /size:letter portrait/);
});
test('batch: 4 labels → 2 pages × 2; odd batch leaves second slot empty, no duplicates', () => {
  const four = L.buildToteLabelDocument(['int', 'ext', 'mech', 'hw'].map((c, i) => label(i + 1, c)));
  assert.equal(count(four, /class="sheet"/g), 2);
  assert.equal(count(four, /class="tl"/g), 4);
  for (const n of [1, 2, 3, 4]) assert.equal(count(four, new RegExp(`TOTE-TEST-00${n}`, 'g')), 1);
  const pages = L.paginate([1, 2, 3]);
  assert.deepEqual(pages.map(p => p.length), [2, 1]);
});
test('each label keeps its own category color and the QR payload is unchanged', () => {
  for (const c of cats) {
    const l = { ...label(7, c.id) };
    const html = L.renderToteLabel(l);
    const qrInk = L.inkFor(c.color, L.QR_MIN_CONTRAST);
    assert.ok(html.includes(L.renderQRSVGString(l.qr_code_value, L.QR_RENDER_SIZE, qrInk)), 'QR encodes the existing payload');
    assert.ok(html.includes(`--panel:${L.inkFor(c.color, L.PANEL_MIN_CONTRAST)}`));
  }
  const ripHtml = L.renderToteLabel(L.toPrintLabel(L.draftFromContainer(rip), cats));
  assert.ok(ripHtml.includes(L.renderQRSVGString(rip.qr_code_value, L.QR_RENDER_SIZE, L.inkFor('#6b7280', 7))));
});
test('contrast: light colors are darkened for QR and white text', () => {
  for (const hex of ['#fde047', '#ffffff', '#ea580c', '#22c55e', '#2563eb']) {
    assert.ok(L.contrastWithWhite(L.inkFor(hex, 7)) >= 7, hex);
    assert.ok(L.contrastWithWhite(L.inkFor(hex, 4.5)) >= 4.5, hex);
  }
  assert.equal(L.normalizeHex('ABC'), '#aabbcc');
  assert.equal(L.normalizeHex('#12345g'), null);
});
test('no linear barcode; white writing fields; long names fit', () => {
  const html = L.buildToteLabelDocument([label(1, 'int')]);
  assert.ok(!/barcode/i.test(html));
  assert.match(L.TOTE_LABEL_CSS, /\.tl \.write\{height:\.9in;flex:none;background:#fff/);
  assert.ok(html.includes('CLIENT:') && html.includes('PROJECT:'));
  assert.equal(L.nameFontPt('Random Interior Parts'), 28);
  assert.ok(L.nameFontPt('x'.repeat(100)) <= 17);
  assert.ok(L.renderToteLabel({ ...label(1, 'int'), name: '' }).includes('name-blank'));
  assert.ok(L.renderToteLabel({ ...label(1, 'int'), name: '<b>' }).includes('&lt;b&gt;'));
});
test('drafts: nothing pending until edited; only changed fields are saved', () => {
  const d = L.draftFromContainer(rip);
  assert.deepEqual(L.pendingChanges([d]), []);
  assert.deepEqual(L.pendingChanges([{ ...d, category_id: 'int' }]), [{ container_id: rip.id, storage_category_id: 'int' }]);
  assert.deepEqual(L.pendingChanges([{ ...d, name: 'New ' }]), [{ container_id: rip.id, name: 'New' }]);
  assert.deepEqual(L.pendingChanges([L.draftFromReserved({ id: 'r', short_code: 'X', qr_code_value: 'Q' })]), []);
  const saved = L.markSaved([{ ...d, name: 'New' }], [{ id: rip.id, name: 'New', storage_category_id: 'int' }]);
  assert.deepEqual(L.pendingChanges(saved), []);
  assert.equal(L.resolveCategory(cats, 'missing').name, 'General Storage');
  assert.equal(L.resolveCategory([], null).name, 'General Storage');
});