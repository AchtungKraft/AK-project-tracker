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

test('single container: one 8 × 3.25 label on one page, real name and number', () => {
  const html = L.buildToteLabelDocument([L.toPrintLabel(L.draftFromContainer(rip), cats)]);
  assert.equal(count(html, /class="sheet"/g), 1);
  assert.equal(count(html, /class="tl"/g), 1);
  assert.ok(html.includes('Random Interior Parts') && html.includes('TOTE-9419C0F654-001'));
  assert.ok(html.includes('STORAGE — GENERAL STORAGE'), 'no category falls back to General Storage');
  assert.match(L.TOTE_LABEL_CSS, /\.tl\{width:8in;height:3\.25in;flex:none/);
  assert.match(L.TOTE_LABEL_CSS, /size:letter portrait/);
});
test('batch: three per page; 4 → 3+1, 6 → 3+3, no duplicates', () => {
  const four = L.buildToteLabelDocument(['int', 'ext', 'mech', 'hw'].map((c, i) => label(i + 1, c)));
  assert.equal(count(four, /class="sheet"/g), 2);
  assert.equal(count(four, /class="tl"/g), 4);
  for (const n of [1, 2, 3, 4]) assert.equal(count(four, new RegExp(`TOTE-TEST-00${n}`, 'g')), 1);
  const three = L.buildToteLabelDocument(['int', 'ext', 'mech'].map((c, i) => label(i + 1, c)));
  assert.equal(count(three, /class="sheet"/g), 1);
  assert.deepEqual(L.paginate([1]).map(p => p.length), [1]);
  assert.deepEqual(L.paginate([1, 2]).map(p => p.length), [2]);
  assert.deepEqual(L.paginate([1, 2, 3, 4]).map(p => p.length), [3, 1]);
  assert.deepEqual(L.paginate([1, 2, 3, 4, 5, 6]).map(p => p.length), [3, 3]);
});
test('geometry: 3 × 3.25 in labels + gaps fit inside a 10.5 in printable Letter height', () => {
  const css = L.TOTE_LABEL_CSS;
  const num = (re) => parseFloat(css.match(re)[1]);
  const h = num(/\.tl\{width:8in;height:([\d.]+)in/), gap = num(/\.sheet\{[^}]*gap:([\d.]+)in/);
  assert.equal(h, 3.25);
  assert.ok(3 * h + 2 * gap <= 10.5, `${3 * h + 2 * gap}in`);
  const header = num(/\.tl header\{height:([\d.]+)in/), write = num(/\.tl \.write\{height:([\d.]+)in/);
  const qr = num(/\.tl \.qr svg\{width:([\d.]+)in/);
  assert.ok(qr + 0.08 + header + write + 0.05 <= h, 'QR fits the body without clipping');
});
test('V2.3: 3 / 6 / 9 reserved labels → 1 / 2 / 3 full sheets, unique QR, no duplicates or blank pages', () => {
  for (const [n, pages] of [[3, 1], [6, 2], [9, 3]]) {
    const reserved = Array.from({ length: n }, (_, i) => ({ id: `r${n}_${i}`, short_code: `TOTE-ZZV23-${n}-${String(i + 1).padStart(3, '0')}`, qr_code_value: `AK_CTR:${n}${String(i).padStart(23, '0')}`, container_type: 'tote' }));
    const labels = reserved.map((r, i) => L.toPrintLabel({ ...L.draftFromReserved(r), category_id: cats[i % cats.length].id }, cats));
    const html = L.buildToteLabelDocument(labels);
    assert.equal(count(html, /class="sheet"/g), pages, `${n} labels → ${pages} pages`);
    assert.equal(count(html, /<section class="tl"/g), n, `exactly ${n} labels`);
    assert.equal(new Set(labels.map(l => l.qr_code_value)).size, n, 'unique identifiers');
    for (const r of reserved) assert.equal(count(html, new RegExp(`>${r.short_code}<`, 'g')), 1, 'each label once');
    assert.ok(html.includes('STORAGE — INTERIOR') && html.includes('STORAGE — EXTERIOR'), 'category names print');
  }
});
test('V2.3: 3 / 6 / 9 existing containers → 1 / 2 / 3 full sheets, original codes kept', () => {
  for (const [n, pages] of [[3, 1], [6, 2], [9, 3]]) {
    const ctrs = Array.from({ length: n }, (_, i) => ({ id: `c${n}_${i}`, name: `Existing Tote ${n}-${i + 1}`, short_code: `TOTE-ZZEX-${n}-${String(i + 1).padStart(3, '0')}`, qr_code_value: `AK_CTR:e${n}${String(i).padStart(22, '0')}`, container_type: 'tote', storage_category_id: cats[i % cats.length].id }));
    const labels = ctrs.map(c => L.toPrintLabel(L.draftFromContainer(c), cats));
    const html = L.buildToteLabelDocument(labels);
    assert.equal(count(html, /class="sheet"/g), pages, `${n} containers → ${pages} pages`);
    assert.equal(count(html, /<section class="tl"/g), n, `exactly ${n} labels`);
    ctrs.forEach((c, i) => {
      assert.equal(labels[i].qr_code_value, c.qr_code_value, 'original QR kept');
      assert.equal(count(html, new RegExp(`>${c.short_code}<`, 'g')), 1, 'each label once');
      assert.ok(html.includes(c.name), 'name prints');
    });
  }
});
test('saved test totes: single and batch print produce identical labels; 3 → 1 page, 4 → 2 pages', () => {
  // Saved values read back from the isolated V2.2 test totes (category later deactivated).
  const liveCats = [...cats, { id: 'zz', name: 'ZZ Test Sticker Renamed', color: '#0d9488', active: false }];
  const totes = [
    { id: 't1', name: 'ZZ V22 Test Tote 1 Renamed', short_code: 'TOTE-ZZV22-001', qr_code_value: 'AK_CTR:111111111111111111111111', storage_category_id: 'zz' },
    { id: 't2', name: 'ZZ V22 Test Tote 2', short_code: 'TOTE-ZZV22-002', qr_code_value: 'AK_CTR:222222222222222222222222', storage_category_id: 'zz' },
    { id: 't3', name: 'ZZ V22 Test Tote 3', short_code: 'TOTE-ZZV22-003', qr_code_value: 'AK_CTR:333333333333333333333333', storage_category_id: 'zz' },
    { id: 't4', name: 'ZZ V22 Test Tote 4', short_code: 'TOTE-ZZV22-004', qr_code_value: 'AK_CTR:444444444444444444444444', storage_category_id: null },
  ];
  const labels = totes.map(t => L.toPrintLabel(L.draftFromContainer(t), liveCats));
  const single = L.buildToteLabelDocument([labels[0]]);
  const batch4 = L.buildToteLabelDocument(labels);
  assert.ok(batch4.includes(L.renderToteLabel(labels[0])) && single.includes(L.renderToteLabel(labels[0])), 'same markup in both');
  assert.equal(count(L.buildToteLabelDocument(labels.slice(0, 3)), /class="sheet"/g), 1);
  assert.equal(count(batch4, /class="sheet"/g), 2);
  assert.ok(single.includes('STORAGE — ZZ TEST STICKER RENAMED'), 'renamed + inactive category still prints');
  assert.ok(batch4.includes('STORAGE — GENERAL STORAGE'), 'uncategorized tote falls back');
  for (const t of totes) assert.ok(batch4.includes(L.renderQRSVGString(t.qr_code_value, L.QR_RENDER_SIZE, L.inkFor(L.resolveCategory(liveCats, t.storage_category_id).color, 7))));
});
test('inactive category stays on its totes and keeps its current color', () => {
  const withInactive = [...cats, { id: 'old', name: 'Retired', color: '#db2777', active: false }];
  const c = L.resolveCategory(withInactive, 'old');
  assert.equal(c.name, 'Retired');
  assert.equal(c.color, '#db2777');
  const recolored = withInactive.map(x => x.id === 'int' ? { ...x, color: '#0d9488' } : x);
  assert.equal(L.resolveCategory(recolored, 'int').color, '#0d9488', 'color edits flow to future prints');
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
  assert.match(L.TOTE_LABEL_CSS, /\.tl \.write\{height:\.85in;flex:none;background:#fff/);
  assert.ok(html.includes('CLIENT:') && html.includes('PROJECT:'));
  assert.equal(L.nameFontPt('Random Interior Parts'), 30);
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