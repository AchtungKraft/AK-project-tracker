// Canonical sticker PDF: builds the exact document the print page builds, from existing label
// identities (no new numbers), and checks the drawing operations that carry the design.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { writeFileSync } from 'node:fs';

const entry = '/tmp/sticker-pdf-entry.mjs', out = '/tmp/sticker-pdf-bundle.mjs';
writeFileSync(entry, `export * from '/app/src/lib/stickerPdf.js';
export { inkFor, PANEL_MIN_CONTRAST } from '/app/src/components/inventory/labels/labelColors.js';`);
buildSync({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
  jsx: 'automatic', alias: { '@': '/app/src', jspdf: '/app/node_modules/jspdf/dist/jspdf.es.min.js' } });
const M = await import(out);

// Existing reserved labels 26_TOTE_000025..27 and the live BRYAN & LAURA category (read-only copies).
const cat = { name: 'BRYAN & LAURA', color: '#860d96' };
const labels = [
  ['Clay Pots', '26_TOTE_000025', '6b01f56da4b6b6b1ad07de3a'],
  ['Screen Porch Decoration', '26_TOTE_000026', '6b01f56de9468f1ef953e447'],
  ['Lawn Art', '26_TOTE_000027', '6b01f56d91917a0be257aefe'],
].map(([name, short_code, id]) => ({ name, short_code, qr_code_value: `AK_CTR:${id}`, category: cat }));

const file = await M.buildStickerPdf(labels, 'AK-stickers-26_TOTE_000025.pdf');
const bytes = Buffer.from(await file.arrayBuffer());
writeFileSync('/tmp/ak-stickers.pdf', bytes);
const s = bytes.toString('latin1');

test('real PDF file, one US Letter page', () => {
  assert.equal(file.type, 'application/pdf');
  assert.ok(s.startsWith('%PDF-'));
  assert.equal((s.match(/\/Type \/Page\b/g) || []).length, 1);
  assert.match(s, /MediaBox \[0 0 612\.? 792\.?\]/);
});

test('every name, identifier, header and write-in line is real text', () => {
  for (const t of ['CLAY POTS', 'SCREEN PORCH DECORATION', 'LAWN ART', '26_TOTE_000025', '26_TOTE_000026',
    '26_TOTE_000027', 'CLIENT:', 'PROJECT:', 'SCAN TO DOCUMENT CONTENTS']) assert.ok(s.includes(`(${t}) Tj`), t);
  assert.equal((s.match(/\(.CHTUNG KRAFT {2}\| {2}STORAGE - BRYAN & LAURA\) Tj/g) || []).length, 3);
});

// Regression: the big name panel must be filled purple, not left white by the header text color.
test('name panel is filled with the category color right before it is drawn', () => {
  const panels = [...s.matchAll(/([\d.]+ [\d.]+ [\d.]+ rg|[\d.]+ g)\n162\. [\d.]+ 432\. -[\d.]+ re\nf/g)];
  assert.equal(panels.length, 3);
  panels.forEach((m) => assert.equal(m[1], '0.53 0.05 0.59 rg'));
});

test('fingerprint is stable for the same bytes', async () => {
  assert.equal(await M.pdfFingerprint(file), await M.pdfFingerprint(file));
});