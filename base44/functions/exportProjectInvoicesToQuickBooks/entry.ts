/**
 * exportProjectInvoicesToQuickBooks — QuickBooks-compatible CSV of invoice lines from the canonical invoice read model.
 *
 * GUARDRAILS (unchanged): exports strictly from getProjectInvoicesView invoices; never recomputes totals; validates
 * line_total === qty * unit_retail_snapshot (±0.01); deterministic ordering; 2-decimal currency; CSV escaping.
 *
 * actions (admin only):
 *  (none) / 'export'  generate an ORIGINAL export. Gets a stable export number (QBX-YYYYMMDD-XXXXXX), the exact file text is
 *                     kept on its admin-only export record with its SHA-256, and issued AK-created deposit invoices in it are claimed with a
 *                     conditional update (null → exported) so two simultaneous exports can never both include one.
 *  'list'             exports, their activity history, and legacy exports made before files were stored.
 *  'download'         the stored original (or regenerated) file, byte for byte. Logs a 'downloaded' event.
 *  'regenerate'       rebuild the same invoices from current records, labelled REGENERATED, compared with the original
 *                     and every difference listed. Never marks, creates or changes invoices, payments, credit or status.
 * { self_test: true } runs pure vectors only.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const EXPORT_VERSION = 'QB_EXPORT_COST_V2';
const COLUMNS = 'Product/Service,Description,Qty,Rate,Amount,Part Cost,Part Cost Extended';

// Deposit export eligibility (prevents creating a deposit invoice in QuickBooks twice).
function exportBlock(r) {
  if (r?.invoice_type !== 'deposit') return null;
  if (r.recorded_from_quickbooks) return 'QUICKBOOKS_ORIGIN';
  if (r.qb_export_status === 'exported') return 'ALREADY_EXPORTED';
  if (r.qb_export_status === 'linked') return 'LINKED_IN_QUICKBOOKS';
  return null;
}
const BLOCK_MSG = {
  QUICKBOOKS_ORIGIN: 'recorded from an invoice that already exists in QuickBooks',
  ALREADY_EXPORTED: 'already exported to QuickBooks',
  LINKED_IN_QUICKBOOKS: 'already linked to an invoice in QuickBooks',
};
const claimable = (r) => r?.invoice_type === 'deposit' && !['draft', 'cancelled', 'void'].includes(r.status);

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const slug = (s) => String(s || 'Project').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
const newExportNumber = (iso) => `QBX-${iso.slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;

// Pure CSV build. header: extra metadata lines placed after the project/date lines (export identity, regeneration label).
function buildCsv({ projectName, dateIso, invoices, header = [] }) {
  const list = invoices.map((i) => ({ ...i, lines: [...(i.lines || [])] }));
  list.sort((a, b) => new Date(a.created_at || a.created_date || 0) - new Date(b.created_at || b.created_date || 0) || String(a.id).localeCompare(String(b.id)));
  for (const inv of list) {
    inv.lines.sort((a, b) => {
      const ca = (a.category_name || '').toLowerCase(); const cb = (b.category_name || '').toLowerCase();
      if (ca !== cb) return ca.localeCompare(cb);
      return (a.part_name || '').toLowerCase().localeCompare((b.part_name || '').toLowerCase());
    });
  }
  const rows = [`Project Name: ${projectName || 'Unknown Project'}`, `Date of Export: ${dateIso.split('T')[0]}`, ...header, '', COLUMNS];
  const body = [];
  let totalRetail = 0; let totalCost = 0;
  for (const inv of list) {
    for (const line of inv.lines) {
      const category = line.category_name || 'Uncategorized';
      const partName = line.part_name || 'Unknown Part';
      const vpn = line.vendor_part_number || '';
      const desc = vpn ? `${category} / ${partName} / ${vpn}` : `${category} / ${partName}`;
      const qty = Number(line.qty) || 0;
      const rate = Number(line.unit_retail_snapshot) || 0;
      const lineTotal = Number(line.line_total) || 0;
      if (Math.abs(lineTotal - qty * rate) > 0.01) throw new Error(`Invoice line math mismatch: ${partName} (expected ${(qty * rate).toFixed(2)}, got ${lineTotal.toFixed(2)})`);
      totalRetail += lineTotal;
      const unitCost = Number(line.unit_cost_snapshot ?? line.unit_cost ?? 0);
      const costExt = unitCost * qty;
      if (costExt < 0) throw new Error(`Invalid cost calculation for ${partName}`);
      totalCost += costExt;
      body.push(`Build_Parts,"${desc.replace(/"/g, '""')}",${qty},${rate.toFixed(2)},${lineTotal.toFixed(2)},${unitCost.toFixed(2)},${costExt.toFixed(2)}`);
    }
  }
  return { content: [...rows, ...body].join('\n'), body, line_count: body.length, total_retail_sum: Number(totalRetail.toFixed(2)), total_cost_sum: Number(totalCost.toFixed(2)) };
}

const bodyOf = (content) => { const lines = String(content).split('\n'); const i = lines.indexOf(COLUMNS); return i < 0 ? [] : lines.slice(i + 1); };
const snapshotOf = (inv, raw) => ({ id: inv.id, qb_invoice_number: raw?.qb_invoice_number || inv.qb_invoice_number || null, invoice_type: raw?.invoice_type || inv.invoice_type, status: raw?.status || inv.status, subtotal: Number(raw?.subtotal ?? inv.subtotal ?? 0), line_count: (inv.lines || []).length });

// Every way a regenerated file differs from the original.
function diffExports(orig, regen) {
  const d = [];
  const label = (s) => s.qb_invoice_number || s.id;
  const now = new Map(regen.snapshot.map((s) => [s.id, s]));
  for (const o of orig.snapshot || []) {
    const n = now.get(o.id);
    if (!n) { d.push(`Invoice ${label(o)} no longer exists; its lines are missing from this file.`); continue; }
    if (n.status !== o.status) d.push(`Invoice ${label(o)} was ${o.status}, now ${n.status}.`);
    if (Math.abs(n.subtotal - o.subtotal) > 0.005) d.push(`Invoice ${label(o)} subtotal was ${o.subtotal.toFixed(2)}, now ${n.subtotal.toFixed(2)}.`);
    if (n.line_count !== o.line_count) d.push(`Invoice ${label(o)} had ${o.line_count} lines, now ${n.line_count}.`);
    if ((n.qb_invoice_number || null) !== (o.qb_invoice_number || null)) d.push(`Invoice number was ${o.qb_invoice_number || 'none'}, now ${n.qb_invoice_number || 'none'}.`);
  }
  if (orig.body) {
    const count = (arr) => arr.reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map());
    const a = count(orig.body); const b = count(regen.body);
    for (const [l, c] of a) if ((b.get(l) || 0) < c) d.push(`Line only in the original: ${l}`);
    for (const [l, c] of b) if ((a.get(l) || 0) < c) d.push(`Line only in the regenerated file: ${l}`);
  } else d.push('The original file was not stored (export made before file storage), so lines cannot be compared.');
  if (orig.total_retail_sum != null && Math.abs(orig.total_retail_sum - regen.total_retail_sum) > 0.005) d.push(`Total amount was ${Number(orig.total_retail_sum).toFixed(2)}, now ${regen.total_retail_sum.toFixed(2)}.`);
  return d;
}

// Claim issued deposits for this export: conditional null → exported. Any lost claim releases the others.
async function claimDeposits(db, raws, exportNumber, at, by) {
  const claimed = [];
  for (const r of raws.filter(claimable)) {
    const won = await db.invoiceCas({ id: r.id, qb_export_status: null }, { qb_export_status: 'exported', qb_export_id: exportNumber, qb_exported_at: at, qb_exported_by: by });
    if (won !== 1) { await releaseDeposits(db, claimed, exportNumber); return { ok: false, lost: r }; }
    claimed.push(r.id);
  }
  return { ok: true, claimed };
}
async function releaseDeposits(db, ids, exportNumber) {
  for (const id of ids) await db.invoiceCas({ id, qb_export_id: exportNumber }, { qb_export_status: null, qb_export_id: null, qb_exported_at: null, qb_exported_by: null }).catch((e) => console.error('[qb export] release failed', id, e.message));
}

// The exact file text is kept on its admin-only export record (fingerprinted with SHA-256). Exports are small CSVs;
// anything over the archive limit is refused before anything is claimed, so an export is never left unrecoverable.
const MAX_ARCHIVE_CHARS = 900000;
function assertArchivable(content) {
  if (content.length > MAX_ARCHIVE_CHARS) throw Object.assign(new Error('This export is too large to archive for later download. Export fewer invoices at a time. Nothing was exported.'), { http: 413 });
}

async function loadProject(base44, project_id) {
  const payload = (await base44.functions.invoke('getProjectInvoicesView', { project_id }))?.data;
  if (!payload || payload.success !== true) throw Object.assign(new Error(payload?.error || 'Failed to fetch invoice read model'), { soft: true });
  const [project] = await base44.entities.Project.filter({ id: project_id });
  const raw = await base44.asServiceRole.entities.ProjectInvoice.filter({ project_id });
  return { invoices: payload.invoices || [], projectName: project?.name || 'Unknown Project', rawById: new Map(raw.map((r) => [r.id, r])), raw };
}

// Correction entries that withdrew a deposit from this export (a deposit corrected to "not in QuickBooks").
async function withdrawnFrom(base44, project_id, exportNumber) {
  const txs = await base44.asServiceRole.entities.DepositTransaction.filter({ project_id, type: 'qb_correction' });
  return txs.filter((t) => t.correction_detail?.export_id === exportNumber && t.correction_detail?.correction === 'not_in_quickbooks')
    .map((t) => `Deposit invoice ${t.reconciles_ref?.slice(8)} was corrected to "not in QuickBooks" on ${String(t.recorded_at).slice(0, 10)} by ${t.actor_email}. This file still contains it: if it is imported, do not also import a newer export of that deposit.`);
}

async function doExport(base44, user, { project_id, invoice_ids, mode = 'all' }) {
  const at = new Date().toISOString();
  const { invoices, projectName, rawById } = await loadProject(base44, project_id);
  let list = invoices;
  if (mode === 'single') list = invoices.filter((i) => i.id === invoice_ids?.[0]);
  if (mode === 'selected') list = invoices.filter((i) => invoice_ids?.includes(i.id));
  const excluded = list.filter((i) => exportBlock(rawById.get(i.id))).map((i) => {
    const r = rawById.get(i.id); const code = exportBlock(r);
    return { invoice_id: i.id, qb_invoice_number: r.qb_invoice_number || null, code, qb_export_id: r.qb_export_id || null, reason: `Deposit invoice ${r.qb_invoice_number || i.id} is ${BLOCK_MSG[code]}.` };
  });
  list = list.filter((i) => !exportBlock(rawById.get(i.id)));
  if (!list.length && excluded.length) {
    const prior = excluded.find((e) => e.qb_export_id);
    return { success: false, code: 'NOT_EXPORT_ELIGIBLE', excluded, error: `${excluded.map((e) => e.reason).join(' ')} It was not exported again, so it can't be duplicated in QuickBooks.${prior ? ` To get the file again, download export ${prior.qb_export_id}.` : ''}` };
  }
  if (!list.length) return { success: false, error: 'No invoices to export' };

  const exportNumber = newExportNumber(at);
  const csv = buildCsv({ projectName, dateIso: at, invoices: list, header: [`Export ID: ${exportNumber}`] });
  const fileName = `QB_Export_${slug(projectName)}_${at.slice(0, 10).replace(/-/g, '')}_${exportNumber}.csv`;
  assertArchivable(csv.content);
  const db = { invoiceCas: async (q, set) => (await base44.asServiceRole.entities.ProjectInvoice.updateMany(q, { $set: set })).updated };
  const claim = await claimDeposits(db, list.map((i) => rawById.get(i.id)), exportNumber, at, user.email);
  if (!claim.ok) return { success: false, code: 'ALREADY_EXPORTED', error: `Deposit invoice ${claim.lost.qb_invoice_number || claim.lost.id} was just exported or linked by another action. Nothing was exported; reload and try again.` };
  try {
    const hash = await sha256(csv.content);
    await base44.asServiceRole.entities.QuickBooksExport.create({
      export_number: exportNumber, kind: 'original', regenerated_from: null, project_id, mode, file_name: fileName, content: csv.content, content_sha256: hash,
      invoice_ids: list.map((i) => i.id), invoice_snapshot: list.map((i) => snapshotOf(i, rawById.get(i.id))), line_count: csv.line_count,
      total_retail_sum: csv.total_retail_sum, total_cost_sum: csv.total_cost_sum, deposits_marked_exported: claim.claimed, created_by_email: user.email, created_at: at,
    });
    await base44.asServiceRole.entities.QuickBooksExportEvent.create({ export_number: exportNumber, project_id, event_type: 'generated', content_sha256: hash, actor_email: user.email, recorded_at: at });
  } catch (e) {
    await releaseDeposits(db, claim.claimed, exportNumber);
    throw e;
  }
  return {
    success: true, export_version: EXPORT_VERSION, export_number: exportNumber, kind: 'original', csv_header: COLUMNS, file_name: fileName, mime_type: 'text/csv',
    content: csv.content, invoice_count: list.length, line_count: csv.line_count, project_id, export_timestamp: at,
    total_retail_sum: csv.total_retail_sum, total_cost_sum: csv.total_cost_sum, excluded_invoices: excluded, deposits_marked_exported: claim.claimed,
  };
}

async function getExport(base44, project_id, export_number) {
  const [x] = await base44.asServiceRole.entities.QuickBooksExport.filter({ export_number });
  if (!x || x.project_id !== project_id) throw Object.assign(new Error('Export not found on this project'), { http: 404 });
  return x;
}

async function doDownload(base44, user, { project_id, export_number }) {
  const x = await getExport(base44, project_id, export_number);
  const content = String(x.content ?? '');
  const hash = await sha256(content);
  const ok = hash === x.content_sha256;
  await base44.asServiceRole.entities.QuickBooksExportEvent.create({ export_number, project_id, event_type: 'downloaded', content_sha256: hash, integrity_ok: ok, actor_email: user.email, recorded_at: new Date().toISOString() });
  const warnings = [...(ok ? [] : ['The stored file no longer matches its recorded fingerprint. Do not import it; regenerate and compare instead.']), ...(await withdrawnFrom(base44, project_id, x.regenerated_from || export_number))];
  return { success: true, export_number, kind: x.kind, regenerated_from: x.regenerated_from || null, file_name: x.file_name, mime_type: 'text/csv', content, integrity_ok: ok, warnings, differences: x.differences || [] };
}

// Regenerate from current records. Never claims, marks or changes anything except adding the new file + audit rows.
async function doRegenerate(base44, user, { project_id, export_number, legacy_exported_at }) {
  const at = new Date().toISOString();
  const { invoices, projectName, rawById, raw } = await loadProject(base44, project_id);
  let orig;
  if (export_number) {
    const x = await getExport(base44, project_id, export_number);
    if (x.kind !== 'original') throw Object.assign(new Error('Regenerate from the original export, not from a regenerated copy.'), { http: 400 });
    const stored = typeof x.content === 'string' && (await sha256(x.content)) === x.content_sha256 ? x.content : null;
    orig = { number: x.export_number, ids: x.invoice_ids || [], snapshot: x.invoice_snapshot || [], body: stored != null ? bodyOf(stored) : null, total_retail_sum: x.total_retail_sum, date: x.created_at };
  } else {
    // Legacy export (before files were stored): the deposits marked exported at that moment.
    const ids = raw.filter((r) => r.qb_export_status === 'exported' && !r.qb_export_id && r.qb_exported_at === legacy_exported_at).map((r) => r.id);
    if (!ids.length) throw Object.assign(new Error('No legacy export found for that time.'), { http: 404 });
    orig = { number: null, ids, snapshot: [], body: null, total_retail_sum: null, date: legacy_exported_at };
  }
  const list = invoices.filter((i) => orig.ids.includes(i.id));
  const newNumber = newExportNumber(at);
  const csv = buildCsv({ projectName, dateIso: at, invoices: list, header: [
    `Export ID: ${newNumber}`,
    `REGENERATED EXPORT of ${orig.number || 'a legacy export'} (original ${String(orig.date).slice(0, 10)}). Not a new export: do not import if the original was already imported.`,
  ] });
  const regen = { snapshot: list.map((i) => snapshotOf(i, rawById.get(i.id))), body: csv.body, total_retail_sum: csv.total_retail_sum };
  const differences = diffExports(orig, regen);
  const identical = orig.body != null && differences.length === 0;
  const fileName = `QB_Export_${slug(projectName)}_${at.slice(0, 10).replace(/-/g, '')}_${newNumber}_REGENERATED.csv`;
  assertArchivable(csv.content);
  const hash = await sha256(csv.content);
  await base44.asServiceRole.entities.QuickBooksExport.create({
    export_number: newNumber, kind: 'regenerated', regenerated_from: orig.number, project_id, mode: 'regenerate', file_name: fileName, content: csv.content, content_sha256: hash,
    invoice_ids: orig.ids, invoice_snapshot: regen.snapshot, line_count: csv.line_count, total_retail_sum: csv.total_retail_sum, total_cost_sum: csv.total_cost_sum,
    deposits_marked_exported: [], differences, identical_to_original: orig.body != null ? identical : null, created_by_email: user.email, created_at: at,
  });
  await base44.asServiceRole.entities.QuickBooksExportEvent.create({ export_number: orig.number || `legacy:${legacy_exported_at}`, project_id, event_type: 'regenerated', related_export_number: newNumber, content_sha256: hash, actor_email: user.email, recorded_at: at, note: identical ? 'Identical to the original' : `${differences.length} difference(s)` });
  return { success: true, export_number: newNumber, kind: 'regenerated', regenerated_from: orig.number, file_name: fileName, mime_type: 'text/csv', content: csv.content, differences, identical_to_original: identical, warnings: await withdrawnFrom(base44, project_id, orig.number) };
}

async function doList(base44, project_id) {
  const [exports, events, raw] = await Promise.all([
    base44.asServiceRole.entities.QuickBooksExport.filter({ project_id }, '-created_at', 500),
    base44.asServiceRole.entities.QuickBooksExportEvent.filter({ project_id }, '-recorded_at', 2000),
    base44.asServiceRole.entities.ProjectInvoice.filter({ project_id }),
  ]);
  const legacy = new Map();
  for (const r of raw.filter((x) => x.qb_export_status === 'exported' && !x.qb_export_id && x.qb_exported_at)) {
    if (!legacy.has(r.qb_exported_at)) legacy.set(r.qb_exported_at, { exported_at: r.qb_exported_at, exported_by: r.qb_exported_by || null, invoices: [] });
    legacy.get(r.qb_exported_at).invoices.push(r.qb_invoice_number || r.id);
  }
  return {
    success: true,
    exports: exports.map(({ content, ...x }) => ({ ...x, events: events.filter((e) => e.export_number === x.export_number) })),
    legacy_exports: [...legacy.values()].map((l) => ({ ...l, events: events.filter((e) => e.export_number === `legacy:${l.exported_at}`) })),
  };
}

// ───────────── Pure self-test (never touches real records) ─────────────
async function selfTest() {
  const results = [];
  const t = async (name, fn) => { try { const d = await fn(); results.push({ name, pass: !!d.pass, detail: d }); } catch (e) { results.push({ name, pass: false, detail: e.message }); } };
  for (const [name, r, want] of [
    ['progress invoice exports (even if exported before)', { invoice_type: 'progress', qb_export_status: 'exported' }, null],
    ['AK deposit not yet in QuickBooks exports', { invoice_type: 'deposit' }, null],
    ['deposit recorded from QuickBooks excluded', { invoice_type: 'deposit', recorded_from_quickbooks: true }, 'QUICKBOOKS_ORIGIN'],
    ['AK deposit already exported excluded', { invoice_type: 'deposit', qb_export_status: 'exported' }, 'ALREADY_EXPORTED'],
    ['AK deposit linked to QuickBooks excluded', { invoice_type: 'deposit', qb_export_status: 'linked' }, 'LINKED_IN_QUICKBOOKS'],
  ]) await t(name, async () => ({ pass: exportBlock(r) === want }));

  const inv = (id, lines, extra = {}) => ({ id, created_date: `2026-01-0${id.length}`, status: 'sent', subtotal: lines.reduce((s, l) => s + l.line_total, 0), lines, ...extra });
  const L = (part, qty, rate, cost = 1) => ({ category_name: 'Body', part_name: part, qty, unit_retail_snapshot: rate, line_total: qty * rate, unit_cost_snapshot: cost });
  const A = [inv('a', [L('Mirror', 2, 50), L('Gasket', 1, 10)]), inv('bb', [L('Seat', 1, 300)])];
  await t('same records rebuild to identical lines regardless of input order; regeneration label only in header', async () => {
    const o = buildCsv({ projectName: 'P', dateIso: '2026-11-01T00:00:00Z', invoices: A, header: ['Export ID: QBX-1'] });
    const r = buildCsv({ projectName: 'P', dateIso: '2026-11-20T00:00:00Z', invoices: [A[1], { ...A[0], lines: [...A[0].lines].reverse() }], header: ['Export ID: QBX-2', 'REGENERATED EXPORT of QBX-1'] });
    const d = diffExports({ snapshot: A.map((i) => snapshotOf(i)), body: bodyOf(o.content), total_retail_sum: o.total_retail_sum }, { snapshot: A.map((i) => snapshotOf(i)), body: r.body, total_retail_sum: r.total_retail_sum });
    return { pass: d.length === 0 && o.content !== r.content && r.content.includes('REGENERATED EXPORT of QBX-1') && JSON.stringify(bodyOf(o.content)) === JSON.stringify(r.body) && o.total_retail_sum === 410, d };
  });
  await t('changed records after export: every difference listed (status, subtotal, lines, missing invoice, total)', async () => {
    const o = buildCsv({ projectName: 'P', dateIso: '2026-11-01T00:00:00Z', invoices: A });
    const now = [inv('a', [L('Mirror', 3, 50), L('Gasket', 1, 10)], { status: 'paid' })];
    const r = buildCsv({ projectName: 'P', dateIso: '2026-11-20T00:00:00Z', invoices: now });
    const d = diffExports({ snapshot: A.map((i) => snapshotOf(i)), body: bodyOf(o.content), total_retail_sum: o.total_retail_sum }, { snapshot: now.map((i) => snapshotOf(i)), body: r.body, total_retail_sum: r.total_retail_sum });
    const has = (s) => d.some((x) => x.includes(s));
    return { pass: has('was sent, now paid') && has('subtotal was 110.00, now 160.00') && has('bb no longer exists') && has('Line only in the original') && has('Line only in the regenerated') && has('Total amount was 410.00'), d };
  });
  await t('legacy export without a stored file: regeneration says lines cannot be compared', async () => {
    const r = buildCsv({ projectName: 'P', dateIso: '2026-11-20T00:00:00Z', invoices: A });
    const d = diffExports({ snapshot: [], body: null, total_retail_sum: null }, { snapshot: [], body: r.body, total_retail_sum: r.total_retail_sum });
    return { pass: d.length === 1 && d[0].includes('cannot be compared') };
  });
  await t('two simultaneous exports of the same deposit: exactly one claims it, the loser releases its other claims', async () => {
    const T = new Map([['d1', { id: 'd1', invoice_type: 'deposit', status: 'paid', qb_export_status: null }], ['d2', { id: 'd2', invoice_type: 'deposit', status: 'sent', qb_export_status: null }]]);
    const db = { invoiceCas: async (q, set) => { await new Promise((r) => setTimeout(r, 0)); let n = 0; for (const r of T.values()) if (Object.entries(q).every(([k, v]) => (v === null ? r[k] == null : r[k] === v))) { Object.assign(r, set); n++; } return n; } };
    const raws = [...T.values()].map((r) => ({ ...r }));
    const [x, y] = await Promise.all([claimDeposits(db, raws, 'QBX-A', 'now', 'a'), claimDeposits(db, [...raws].reverse(), 'QBX-B', 'now', 'b')]);
    const ids = [...T.values()].map((r) => r.qb_export_id);
    const winners = [x, y].filter((r) => r.ok);
    return { pass: winners.length <= 1 && (winners.length === 0 ? ids.every((i) => i == null) : ids.every((i) => i === (x.ok ? 'QBX-A' : 'QBX-B'))), ids, x: x.ok, y: y.ok };
  });
  // End-to-end on an in-memory database: export → re-export refused → download → regenerate → tamper/correction warnings.
  const mock = () => {
    const T = { ProjectInvoice: [
      { id: 'i1', project_id: 'P', invoice_type: 'progress', status: 'sent', qb_invoice_number: 'INV-1', subtotal: 110 },
      { id: 'd1', project_id: 'P', invoice_type: 'deposit', status: 'paid', qb_invoice_number: 'DEP-1', subtotal: 500, qb_export_status: null },
      { id: 'd2', project_id: 'P', invoice_type: 'deposit', status: 'paid', qb_invoice_number: 'DEP-2', subtotal: 300, recorded_from_quickbooks: true },
    ], Project: [{ id: 'P', name: 'Test Car' }], QuickBooksExport: [], QuickBooksExportEvent: [], DepositTransaction: [], ProjectInvoicePayment: [{ id: 'pay1', invoice_id: 'd1', amount_cents: 50000 }], ProjectCreditLedger: [{ id: 'c1', remaining_amount: 500 }] };
    const view = { i1: [L('Mirror', 2, 50), L('Gasket', 1, 10)], d1: [{ category_name: 'Deposit', part_name: 'Down payment', qty: 1, unit_retail_snapshot: 500, line_total: 500, unit_cost_snapshot: 0 }], d2: [] };
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const match = (r, q) => Object.entries(q).every(([k, v]) => (v === null ? r[k] == null : r[k] === v));
    const api = (n) => ({
      filter: async (q = {}) => { await tick(); return (T[n] ||= []).filter((r) => match(r, q)).map((r) => structuredClone(r)); },
      create: async (d) => { await tick(); const r = { id: `${n}${T[n].length + 1}`, ...structuredClone(d) }; T[n].push(r); return structuredClone(r); },
      updateMany: async (q, { $set }) => { await tick(); const hit = T[n].filter((r) => match(r, q)); hit.forEach((r) => Object.assign(r, structuredClone($set))); return { updated: hit.length }; },
    });
    const entities = new Proxy({}, { get: (_, n) => api(String(n)) });
    const functions = { invoke: async (fn) => { if (fn !== 'getProjectInvoicesView') throw new Error('unexpected'); return { data: { success: true, invoices: T.ProjectInvoice.map((i) => ({ id: i.id, status: i.status, created_date: '2026-01-01', lines: structuredClone(view[i.id] || []) })) } }; } };
    return { T, view, base44: { entities, asServiceRole: { entities }, functions } };
  };
  const U = { email: 'admin@test' };
  const money = (T) => JSON.stringify([T.ProjectInvoice.map((i) => [i.id, i.status, i.subtotal, i.paid_amount ?? null]), T.ProjectInvoicePayment, T.ProjectCreditLedger]);
  await t('export: deposit claimed with the export number, QuickBooks-origin deposit excluded, exact file archived', async () => {
    const m = mock(); const r = await doExport(m.base44, U, { project_id: 'P' });
    const x = m.T.QuickBooksExport[0]; const d1 = m.T.ProjectInvoice.find((i) => i.id === 'd1');
    return { pass: r.success && r.export_number && d1.qb_export_status === 'exported' && d1.qb_export_id === r.export_number && r.excluded_invoices.length === 1 && r.excluded_invoices[0].code === 'QUICKBOOKS_ORIGIN'
      && x.content === r.content && x.content_sha256 === (await sha256(r.content)) && r.content.includes(`Export ID: ${r.export_number}`) && m.T.QuickBooksExportEvent[0].event_type === 'generated' };
  });
  await t('exporting the same deposit again is refused and points to the original export for recovery', async () => {
    const m = mock(); const r1 = await doExport(m.base44, U, { project_id: 'P' }); const r2 = await doExport(m.base44, U, { project_id: 'P', mode: 'single', invoice_ids: ['d1'] });
    return { pass: !r2.success && r2.code === 'NOT_EXPORT_ELIGIBLE' && r2.error.includes(r1.export_number) && m.T.QuickBooksExport.length === 1 };
  });
  await t('download returns the original byte for byte, logs the download, changes no balances or statuses', async () => {
    const m = mock(); const r1 = await doExport(m.base44, U, { project_id: 'P' }); const before = money(m.T); const marks = JSON.stringify(m.T.ProjectInvoice);
    const d = await doDownload(m.base44, U, { project_id: 'P', export_number: r1.export_number });
    return { pass: d.content === r1.content && d.integrity_ok && d.kind === 'original' && m.T.QuickBooksExportEvent.some((e) => e.event_type === 'downloaded' && e.actor_email === U.email) && money(m.T) === before && JSON.stringify(m.T.ProjectInvoice) === marks };
  });
  await t('regenerate with unchanged records: identical lines, labelled REGENERATED, nothing marked or created', async () => {
    const m = mock(); const r1 = await doExport(m.base44, U, { project_id: 'P' }); const before = JSON.stringify(m.T.ProjectInvoice); const pays = money(m.T);
    const g = await doRegenerate(m.base44, U, { project_id: 'P', export_number: r1.export_number });
    const d1 = m.T.ProjectInvoice.find((i) => i.id === 'd1');
    return { pass: g.success && g.identical_to_original && g.differences.length === 0 && g.content.includes(`REGENERATED EXPORT of ${r1.export_number}`) && g.file_name.includes('REGENERATED')
      && JSON.stringify(m.T.ProjectInvoice) === before && money(m.T) === pays && d1.qb_export_id === r1.export_number && m.T.ProjectInvoice.length === 3 && m.T.QuickBooksExport.length === 2
      && m.T.QuickBooksExport[1].kind === 'regenerated' && m.T.QuickBooksExport[1].deposits_marked_exported.length === 0 && m.T.QuickBooksExportEvent.some((e) => e.event_type === 'regenerated' && e.export_number === r1.export_number && e.related_export_number === g.export_number) };
  });
  await t('regenerate after records changed: differences listed, original file and identity preserved', async () => {
    const m = mock(); const r1 = await doExport(m.base44, U, { project_id: 'P' });
    m.view.i1[0] = L('Mirror', 3, 50); Object.assign(m.T.ProjectInvoice[0], { subtotal: 160, status: 'paid' });
    const g = await doRegenerate(m.base44, U, { project_id: 'P', export_number: r1.export_number });
    const o = await doDownload(m.base44, U, { project_id: 'P', export_number: r1.export_number });
    return { pass: !g.identical_to_original && g.differences.some((x) => x.includes('INV-1 was sent, now paid')) && g.differences.some((x) => x.includes('Line only in the regenerated')) && o.content === r1.content && o.integrity_ok, diffs: g.differences };
  });
  await t('tampered archive or deposit withdrawn by correction: download warns', async () => {
    const m = mock(); const r1 = await doExport(m.base44, U, { project_id: 'P' });
    m.T.DepositTransaction.push({ id: 'x', project_id: 'P', type: 'qb_correction', reconciles_ref: 'invoice:d1', recorded_at: '2026-11-21T00:00:00Z', actor_email: 'a@x', correction_detail: { export_id: r1.export_number, correction: 'not_in_quickbooks' } });
    const w = await doDownload(m.base44, U, { project_id: 'P', export_number: r1.export_number });
    m.T.QuickBooksExport[0].content += '\nBuild_Parts,"x",1,1.00,1.00,0.00,0.00';
    const bad = await doDownload(m.base44, U, { project_id: 'P', export_number: r1.export_number });
    return { pass: w.integrity_ok && w.warnings.some((x) => x.includes('not in QuickBooks')) && !bad.integrity_ok && bad.warnings[0].includes('Do not import') };
  });
  await t('two simultaneous exports including the same deposit: it lands in at most one file', async () => {
    const m = mock(); const r = await Promise.all([doExport(m.base44, U, { project_id: 'P' }), doExport(m.base44, U, { project_id: 'P' })]);
    const files = m.T.QuickBooksExport.filter((x) => x.deposits_marked_exported.includes('d1'));
    return { pass: files.length <= 1 && r.filter((x) => x.success && x.deposits_marked_exported.includes('d1')).length === files.length && (m.T.ProjectInvoice.find((i) => i.id === 'd1').qb_export_id ?? null) === (files[0]?.export_number ?? null) };
  });
  await t('drafts and cancelled deposits are never claimed', async () => ({ pass: !claimable({ invoice_type: 'deposit', status: 'draft' }) && !claimable({ invoice_type: 'deposit', status: 'cancelled' }) && !claimable({ invoice_type: 'progress', status: 'sent' }) && claimable({ invoice_type: 'deposit', status: 'partial' }) }));
  return { function: 'exportProjectInvoicesToQuickBooks', mock_only: true, passed: results.filter((r) => r.pass).length, total: results.length, results };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => ([401, 403].includes(e.status ?? e.response?.status) || /authentication required/i.test(e.message) ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const b = await req.json().catch(() => ({}));
    if (b.self_test) return Response.json(await selfTest());
    if (!b.project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });
    const action = b.action || 'export';
    const out = action === 'export' ? await doExport(base44, user, b)
      : action === 'list' ? await doList(base44, b.project_id)
      : action === 'download' ? await doDownload(base44, user, b)
      : action === 'regenerate' ? await doRegenerate(base44, user, b)
      : null;
    if (!out) return Response.json({ error: 'Unknown action' }, { status: 400 });
    return Response.json(out);
  } catch (error) {
    if (error.soft) return Response.json({ success: false, error: error.message });
    console.error('Export error:', error);
    return Response.json({ success: false, error: error.message }, { status: error.http || 500 });
  }
});