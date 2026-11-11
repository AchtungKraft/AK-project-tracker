// Shop Review print: renders the real component to static HTML and checks content + no-money rule.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'node_modules/.cache/shop-review-print.test.bundle.mjs');
await build({
  stdin: {
    contents: `export { default as View } from './src/components/scope/shopReview/ShopReviewPrintView.jsx';
export { buildShopHierarchy, hoursText } from './src/components/scope/shopReview/shopReviewHelpers.js';
export { renderToStaticMarkup } from 'react-dom/server'; export { createElement } from 'react';`,
    resolveDir: root, loader: 'js',
  },
  bundle: true, format: 'esm', platform: 'node', outfile, jsx: 'automatic', loader: { '.jsx': 'jsx', '.js': 'jsx' },
  alias: { '@': path.join(root, 'src') }, logLevel: 'silent', packages: 'external',
});
const { View, buildShopHierarchy, hoursText, renderToStaticMarkup, createElement } = await import(pathToFileURL(outfile).href);

const longNote = 'Inspect every fastener and bushing. '.repeat(120);
const item = (o) => ({ id: o.id, category_id: 'c1', group_id: 'g1', sort_order: 0, title: o.id, description: '', decision_status: 'needs_review', decision_at: null, images: [], parts_notes: [], parts_tbd: false, labor: [], comments: [], conversion: 'not_converted', tasks: [], ...o });
const data = {
  request: { id: 'r', title: 'Test Review', status: 'posted' },
  project: { id: 'p', name: 'GTS1', vin: '' },
  categories: [{ id: 'c2', name: 'SECOND', sort_order: 2 }, { id: 'c1', name: 'FIRST', sort_order: 1 }],
  groups: [{ id: 'g1', name: 'Engine', sort_order: 1 }],
  items: [
    item({ id: 'A-approved', decision_status: 'approved', conversion: 'converted', tasks: ['Rebuild carbs'], description: longNote, parts_notes: ['Use OEM gaskets'], labor: [{ activity: 'FABRICATION', hours_min: 2, hours_max: 4 }, { activity: 'PAINT', hours_min: null, hours_max: null }], images: ['https://example.com/a.png', 'https://example.com/b.png', 'https://example.com/c.png'], comments: [{ author: 'Client', body: 'Please keep the patina', posted_at: '2026-10-01' }] }),
    item({ id: 'B-pending-noimg', category_id: 'c2', parts_tbd: true }),
    item({ id: 'C-orphan', category_id: 'gone', group_id: 'gone' }),
  ],
};

test('all items print, in canonical category order, orphans kept', () => {
  const h = buildShopHierarchy(data.categories, data.groups, data.items);
  assert.deepEqual(h.map((c) => c.name), ['FIRST', 'SECOND', 'Unassigned']);
  assert.equal(h.reduce((a, c) => a + c.count, 0), 3);
});

test('hours text: ranges and TBD', () => {
  assert.equal(hoursText(2, 4), '2–4 hrs');
  assert.equal(hoursText(1.5, 1.5), '1.5 hrs');
  assert.equal(hoursText(null, null), 'TBD');
  assert.equal(hoursText(0, 0), 'TBD');
});

test('rendered output: notes, images, hours, fields, and no money', () => {
  const html = renderToStaticMarkup(createElement(View, { data, onClose: () => {} }));
  const text = html.replace(/<style>[\s\S]*?<\/style>/g, '');
  for (const s of ['A-approved', 'B-pending-noimg', 'C-orphan', 'Task created: Rebuild carbs', 'Parts/materials notes', 'Use OEM gaskets',
    'Parts/materials still to be determined', 'FABRICATION', '2–4 hrs', 'Hours TBD', 'Please keep the patina', 'No reference images',
    'Confirmed hours', 'Revised hours', 'Parts required', 'Additional findings', 'Reviewed by', 'FIRST › Engine']) {
    assert.ok(text.includes(s), `missing: ${s}`);
  }
  assert.ok(text.includes(longNote.trim().slice(0, 200)), 'long description rendered in full');
  assert.equal((text.match(/<img /g) || []).length, 3);
  assert.ok(!text.includes('$'), 'no $ in output');
  const visible = text.replace(/<[^>]+>/g, ' ');
  const hit = visible.match(/hard cost|\brates?\b|labor \$|total est|retail|margin|budget|price|cost/i);
  assert.equal(hit, null, `financial wording found: ${hit}`);
});