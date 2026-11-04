import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { jsPDF } from 'npm:jspdf@2.5.2';
import * as autoTableMod from 'npm:jspdf-autotable@3.8.2';
const autoTable = (doc, o) => ((autoTableMod.autoTable || autoTableMod.default?.default || autoTableMod.default)(doc, o));
import ExcelJS from 'npm:exceljs@4.4.0';

/**
 * exportProjectFinancialReport — admin-only, READ-ONLY.
 * Single snapshot from getProjectFinancialOverview (no independent formulas). Builds the file server-side
 * so the client report never sends internal cost/margin to the browser. Returns the file as base64.
 */
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const usd = (n) => (n == null ? 'Missing' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const hrs = (n) => (n == null ? '—' : `${Number(n).toFixed(2)} h`);
const TYPE = { BILLABLE: 'Billable', INCLUDED_IN_SERVICE: 'Included in service', NON_BILLABLE: 'Non-billable', UNCLASSIFIED: 'Unclassified' };
const SECTIONS = ['summary', 'parts', 'services', 'labor', 'invoices'];

const avail = (p) => Math.max(0, p.available_qty - p.allocated_qty);
const partStatus = (p) => [p.invoiced_qty > 0 && `${p.invoiced_qty} finalized`, p.allocated_qty > 0 && `${p.allocated_qty} on draft`, avail(p) > 0 && `${avail(p)} available`].filter(Boolean).join(', ') || 'Nothing to bill';
const partEst = (p) => (p.cost_state === 'missing' ? null : p.est_cost);
const partAct = (p) => (p.actual_unit_cost == null ? null : r2(p.actual_unit_cost * p.qty));
const svcStatus = (s) => (s.invoiced ? 'Finalized' : s.allocated ? `On ${s.draft_count} draft(s)` : 'Available');
const isBill = (t) => t.billing_type === 'BILLABLE' && !t.cancelled;
const laborStatus = (t) => (t.cancelled ? 'Cancelled' : TYPE[t.billing_type] || 'Unclassified') + (isBill(t) ? ' — valued, not invoiced' : '');

function buildModel(o, client) {
  const parts = o.lines.parts.filter((p) => !client || p.qty > 0);
  const services = o.lines.services;
  const labor = o.labor_billing.tasks.filter((t) => (client ? isBill(t) && t.effective_rate != null : t.logged > 0 || t.remaining_hours > 0));
  const sum = (a, f) => r2(a.reduce((x, r) => x + (f(r) || 0), 0));
  return {
    parts, services, labor,
    tot: {
      parts: sum(parts, (p) => p.billable), services: sum(services, (s) => s.billable),
      laborToDate: sum(labor.filter(isBill), (t) => t.billable_to_date), laborProjected: sum(labor.filter(isBill), (t) => t.projected_remaining),
      partsFinal: sum(parts, (p) => p.invoiced_amount), partsDraft: sum(parts, (p) => p.draft_amount), partsAvail: sum(parts, (p) => avail(p) * (p.unit_retail || 0)),
      svcFinal: sum(services.filter((s) => s.invoiced), (s) => s.billable), svcDraft: sum(services, (s) => s.draft_amount), svcAvail: sum(services.filter((s) => !s.invoiced && !s.allocated), (s) => s.billable),
    },
  };
}

function summaryRows(o, client, includeProjected) {
  const s = o.summary;
  const rows = [
    ['Parts billable (current)', o.categories.parts.billable],
    ['Services billable (current)', o.categories.services.billable],
    ['Labor billable to date (valued, not invoiced)', s.labor_billable_to_date],
    ['Total current billable', s.total_current_billable],
  ];
  if (includeProjected || !client) rows.push(['Projected remaining labor', s.labor_projected_remaining], ['Total projected billable', s.total_projected_billable]);
  if (!client) rows.push(
    ['Estimated Parts & Services cost' + (s.cost_complete ? '' : ' (incomplete)'), s.estimated_cost],
    ['Estimated P&S gross profit', s.estimated_gross_profit],
    ['Estimated P&S gross margin', s.estimated_gross_margin_pct == null ? '—' : `${s.estimated_gross_margin_pct}%`],
  );
  rows.push(
    ['Already finalized / invoiced (historical)', s.finalized_invoiced],
    ['Outstanding balance on finalized invoices', s.outstanding_balance],
    ['Allocated to draft invoices', s.allocated_to_drafts],
    ['Parts & Services available to invoice', s.available_to_invoice],
  );
  return rows;
}

function buildPdf(o, opts) {
  const client = opts.report_type === 'client';
  const m = buildModel(o, client);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const title = client ? 'Billing Detail — Not an Invoice' : 'Internal Financial Report';
  const stamp = new Date(o.generated_at).toLocaleString('en-US', { timeZone: 'America/Chicago' });
  doc.setFillColor(220, 38, 38); doc.rect(0, 0, W, 56, 'F');
  doc.setTextColor(255); doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text('ÄCHTUNG KRAFT', 36, 34);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.text(title, W - 36, 34, { align: 'right' });
  doc.setTextColor(20); doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(o.project_name || 'Project', 36, 82);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text([`Client: ${o.project_info?.client_name || '—'}    VIN / Chassis: ${o.project_info?.vin || '—'}    Project ID: ${o.project_id}`, `Generated: ${stamp} (Central)    Report: ${title}`], 36, 98);
  if (client) { doc.setTextColor(180, 0, 0); doc.text('This document is a billing detail for review. It is not an invoice and creates no payment obligation. Previously invoiced amounts are shown for reference only.', 36, 124); doc.setTextColor(20); }
  let y = client ? 138 : 124;
  const base = { theme: 'grid', styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak' }, headStyles: { fillColor: [31, 41, 55], textColor: 255 }, footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: 'bold' }, showHead: 'everyPage', rowPageBreak: 'avoid', margin: { left: 36, right: 36, bottom: 40 } };
  const section = (name, head, body, foot, colStyles) => {
    if (y > doc.internal.pageSize.getHeight() - 100) { doc.addPage(); y = 50; }
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(name, 36, y + 12);
    autoTable(doc, { ...base, startY: y + 18, head: [head], body, foot: foot ? [foot] : undefined, showFoot: 'lastPage', columnStyles: colStyles });
    y = doc.lastAutoTable.finalY + 18;
  };
  const right = (from, to) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, { halign: 'right' }]));
  const S = opts.sections;
  if (S.includes('summary')) section('Financial summary', ['Measure', 'Amount'], summaryRows(o, client, opts.include_projected).map(([k, v]) => [k, typeof v === 'number' ? usd(v) : v]), null, { 1: { halign: 'right' } });
  if (S.includes('parts')) {
    if (client) section('Parts', ['Part', 'Part #', 'Qty', 'Finalized', 'On draft', 'Available', 'Unit price', 'Billable', 'Status'],
      m.parts.map((p) => [p.part_name || 'Unknown part', p.part_number || '', p.qty, p.invoiced_qty, p.allocated_qty, avail(p), usd(p.unit_retail), usd(p.billable), partStatus(p)]),
      ['Parts subtotal', '', '', '', '', '', '', usd(m.tot.parts), ''], right(2, 7));
    else section('Parts detail', ['Part', 'Part #', 'Required', 'Final', 'Draft', 'Avail.', 'Est. cost', 'Actual cost', 'Unit price', 'Billable', 'Billing status'],
      m.parts.map((p) => [p.part_name || 'Unknown part', p.part_number || '', p.qty, p.invoiced_qty, p.allocated_qty, avail(p), p.cost_state === 'zero_client_supplied' ? '$0 (client)' : usd(partEst(p)), p.actual_unit_cost == null ? 'Not recorded' : usd(partAct(p)), usd(p.unit_retail), usd(p.billable), partStatus(p)]),
      ['Parts subtotal', '', '', '', '', '', usd(o.categories.parts.estimated_cost), '', '', usd(m.tot.parts), ''], right(2, 9));
  }
  if (S.includes('services')) {
    if (client) section('Services', ['Service', 'Qty', 'Billable', 'On draft', 'Status'],
      m.services.map((s) => [s.description || '—', 1, usd(s.billable), s.allocated ? usd(s.draft_amount) : '—', svcStatus(s)]), ['Services subtotal', '', usd(m.tot.services), '', ''], right(1, 3));
    else section('Services detail', ['Service', 'Qty', 'Est. cost', 'Actual cost', 'Billable', 'Draft allocation', 'Billing status'],
      m.services.map((s) => [s.description || '—', 1, usd(s.est_cost), s.actual_cost == null ? 'Not recorded' : usd(s.actual_cost), usd(s.billable), s.allocated ? usd(s.draft_amount) : '—', svcStatus(s)]),
      ['Services subtotal', '', usd(o.categories.services.estimated_cost), '', usd(m.tot.services), '', ''], right(1, 5));
  }
  if (S.includes('labor')) {
    const proj = !client || opts.include_projected;
    const head = ['Task', 'Billable hrs', 'Rate', 'Billable to date', ...(proj ? ['Remaining hrs', 'Projected add\'l'] : []), 'Classification'];
    section(client ? 'Separately billable labor (valued, not yet invoice-eligible)' : 'Labor detail (internal labor cost not configured)', head,
      m.labor.map((t) => [t.name, isBill(t) ? hrs(t.logged) : `${hrs(t.logged)} (not billed separately)`, isBill(t) && t.effective_rate != null ? usd(t.effective_rate) + '/h' : '—', isBill(t) ? usd(t.billable_to_date) : '—', ...(proj ? [isBill(t) ? hrs(t.remaining_hours) : '—', isBill(t) ? usd(t.projected_remaining) : '—'] : []), laborStatus(t)]),
      ['Labor subtotal', hrs(o.labor_billing.hours.billable), '', usd(m.tot.laborToDate), ...(proj ? [hrs(o.labor_billing.remaining_billable_hours), usd(m.tot.laborProjected)] : []), ''], right(1, proj ? 5 : 3));
  }
  if (S.includes('invoices')) {
    section('Invoice summary', ['Invoice', 'Type', 'Status', 'Issue date', 'Total', 'Paid', 'Balance due'],
      (o.invoice_list || []).map((i) => [i.number || i.id.slice(-6), i.type || '', i.status, i.issue_date || '', usd(i.total), usd(i.paid), i.balance_due == null ? '—' : usd(i.balance_due)]), null, right(4, 6));
  }
  // Final project summary
  const fin = [['Parts', usd(m.tot.parts)], ['Services', usd(m.tot.services)], ['Labor billable to date', usd(o.summary.labor_billable_to_date)], ['Total current billable', usd(o.summary.total_current_billable)]];
  if (!client || opts.include_projected) fin.push(['Total projected billable', usd(o.summary.total_projected_billable)]);
  fin.push(['Already invoiced (historical, not newly payable)', usd(o.summary.finalized_invoiced)], ['Allocated to drafts', usd(o.summary.allocated_to_drafts)], ['Parts & Services available to invoice', usd(o.summary.available_to_invoice)]);
  section(client ? 'Total selected billable scope' : 'Project summary', ['Measure', 'Amount'], fin, null, { 1: { halign: 'right' } });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`${o.project_name} — ${title}`, 36, doc.internal.pageSize.getHeight() - 18); doc.text(`Page ${i} of ${n}`, W - 36, doc.internal.pageSize.getHeight() - 18, { align: 'right' }); }
  doc.setProperties({ title: `${o.project_name} — ${title}`, author: 'Ächtung Kraft', subject: title });
  return new Uint8Array(doc.output('arraybuffer'));
}

async function buildXlsx(o, opts) {
  const client = opts.report_type === 'client';
  const m = buildModel(o, client);
  const wb = new ExcelJS.Workbook(); wb.creator = 'Ächtung Kraft'; wb.created = new Date(o.generated_at);
  const MONEY = '"$"#,##0.00'; const HRS = '0.00" h"';
  const sheet = (name, cols, rows, totals) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: c.h, key: c.k, width: c.w || 14, style: c.f ? { numFmt: c.f } : {} }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    rows.forEach((r) => ws.addRow(r));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    if (totals) { const tr = ws.addRow(totals); tr.font = { bold: true }; tr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; }
    return ws;
  };
  const S = opts.sections;
  if (S.includes('summary')) {
    const ws = sheet('Summary', [{ h: 'Measure', k: 'k', w: 48 }, { h: 'Amount', k: 'v', w: 18, f: MONEY }], summaryRows(o, client, opts.include_projected).map(([k, v]) => ({ k, v })));
    ws.addRow({}); ws.addRow({ k: `Project: ${o.project_name}` }); ws.addRow({ k: `Client: ${o.project_info?.client_name || '—'}` });
    ws.addRow({ k: `Generated: ${new Date(o.generated_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })} (Central)` });
    ws.addRow({ k: client ? 'Billing Detail — Not an Invoice. Previously invoiced amounts are historical, not newly payable.' : 'Internal Financial Report — confidential. Labor internal cost not configured; margin is Parts & Services only.' });
  }
  if (S.includes('parts')) {
    const cols = [{ h: 'Description', k: 'd', w: 40 }, { h: 'Part #', k: 'pn', w: 18 }, { h: 'Quantity', k: 'q', w: 10 }];
    if (!client) cols.push({ h: 'Estimated Cost', k: 'ec', f: MONEY }, { h: 'Actual Cost', k: 'ac', f: MONEY });
    cols.push({ h: 'Unit Price', k: 'up', f: MONEY }, { h: 'Billable', k: 'b', f: MONEY }, { h: 'Billing Status', k: 's', w: 34 }, { h: 'Finalized Qty', k: 'fq' }, { h: 'Draft Qty', k: 'dq' }, { h: 'Available Qty', k: 'aq' }, { h: 'Draft Amount', k: 'da', f: MONEY }, { h: 'Invoice Eligible Now', k: 'el', w: 12 });
    sheet('Parts', cols, m.parts.map((p) => ({ d: p.part_name || 'Unknown part', pn: p.part_number || '', q: p.qty, ec: client ? undefined : (partEst(p) ?? 'Missing'), ac: client ? undefined : (partAct(p) ?? 'Not recorded'), up: p.unit_retail ?? 'Missing', b: p.billable, s: partStatus(p), fq: p.invoiced_qty, dq: p.allocated_qty, aq: avail(p), da: p.draft_amount, el: avail(p) > 0 ? 'Yes' : 'No' })),
      { d: 'Parts subtotal', ec: client ? undefined : o.categories.parts.estimated_cost, b: m.tot.parts, da: m.tot.partsDraft });
  }
  if (S.includes('services')) {
    const cols = [{ h: 'Description', k: 'd', w: 44 }, { h: 'Quantity', k: 'q', w: 10 }];
    if (!client) cols.push({ h: 'Estimated Cost', k: 'ec', f: MONEY }, { h: 'Actual Cost', k: 'ac', f: MONEY });
    cols.push({ h: 'Billable', k: 'b', f: MONEY }, { h: 'Billing Status', k: 's', w: 20 }, { h: 'Draft Amount', k: 'da', f: MONEY }, { h: 'Invoice Eligible Now', k: 'el', w: 12 });
    sheet('Services', cols, m.services.map((s) => ({ d: s.description || '—', q: 1, ec: client ? undefined : (s.est_cost ?? 'Missing'), ac: client ? undefined : (s.actual_cost ?? 'Not recorded'), b: s.billable, s: svcStatus(s), da: s.allocated ? s.draft_amount : null, el: !s.invoiced && !s.allocated ? 'Yes' : 'No' })),
      { d: 'Services subtotal', ec: client ? undefined : o.categories.services.estimated_cost, b: m.tot.services, da: m.tot.svcDraft });
  }
  if (S.includes('labor')) {
    const proj = !client || opts.include_projected;
    const cols = [{ h: 'Description', k: 'd', w: 44 }, { h: 'Billable Hours', k: 'h', f: HRS }];
    if (!client) cols.push({ h: 'Estimated Cost', k: 'ec', w: 16 }, { h: 'Actual Cost', k: 'ac', w: 16 }, { h: 'Logged Hours (all)', k: 'lh', f: HRS });
    cols.push({ h: 'Rate', k: 'r', f: MONEY }, { h: 'Billable To Date (actual)', k: 'b', f: MONEY }, { h: 'Billing Status', k: 's', w: 34 });
    if (proj) cols.push({ h: 'Remaining Hours (projected)', k: 'rh', f: HRS }, { h: 'Projected Additional', k: 'pa', f: MONEY });
    cols.push({ h: 'Invoice Eligible Now', k: 'el', w: 12 });
    sheet('Labor', cols, m.labor.map((t) => ({ d: t.name, h: isBill(t) ? t.logged : 0, ec: 'Not configured', ac: 'Not configured', lh: t.logged, r: isBill(t) ? t.effective_rate : null, b: isBill(t) ? t.billable_to_date : null, s: laborStatus(t), rh: isBill(t) ? t.remaining_hours : null, pa: isBill(t) ? t.projected_remaining : null, el: 'No' })),
      { d: 'Labor subtotal', h: o.labor_billing.hours.billable, b: m.tot.laborToDate, rh: proj ? o.labor_billing.remaining_billable_hours : undefined, pa: proj ? m.tot.laborProjected : undefined });
  }
  if (S.includes('invoices')) {
    const ws = sheet('Invoices & Allocations', [{ h: 'Invoice', k: 'n', w: 18 }, { h: 'Type', k: 't' }, { h: 'Status', k: 's' }, { h: 'Issue Date', k: 'd' }, { h: 'Total', k: 'tot', f: MONEY }, { h: 'Paid', k: 'p', f: MONEY }, { h: 'Balance Due', k: 'bd', f: MONEY }],
      (o.invoice_list || []).map((i) => ({ n: i.number || i.id.slice(-6), t: i.type || '', s: i.status, d: i.issue_date || '', tot: i.total, p: i.paid, bd: i.balance_due })));
    ws.addRow({}); ws.addRow({ n: 'Finalized invoiced', tot: o.summary.finalized_invoiced }); ws.addRow({ n: 'Allocated to drafts', tot: o.summary.allocated_to_drafts }); ws.addRow({ n: 'Available to invoice (P&S)', tot: o.summary.available_to_invoice });
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const { project_id, format, report_type = 'internal', include_projected = false } = body;
    if (!project_id || !['pdf', 'xlsx'].includes(format) || !['internal', 'client'].includes(report_type)) return Response.json({ error: 'project_id, format (pdf|xlsx) and report_type (internal|client) are required' }, { status: 400 });
    const sections = (Array.isArray(body.sections) ? body.sections : SECTIONS).filter((s) => SECTIONS.includes(s));
    if (!sections.length) return Response.json({ error: 'Select at least one section' }, { status: 400 });

    const res = await base44.functions.invoke('getProjectFinancialOverview', { project_id });
    const o = res?.data ?? res;
    if (!o?.success) return Response.json({ error: o?.error || 'Could not load financials' }, { status: 404 });

    const opts = { report_type, sections, include_projected: !!include_projected };
    const bytes = format === 'pdf' ? buildPdf(o, opts) : await buildXlsx(o, opts);
    const safe = (o.project_name || 'project').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    const filename = `${safe}_${report_type === 'client' ? 'Billing_Detail' : 'Internal_Financials'}_${o.generated_at.slice(0, 10)}.${format}`;
    // Totals returned for verification; client exports return no cost/margin values.
    return Response.json({ success: true, filename, file_base64: b64(bytes), generated_at: o.generated_at,
      check: { total_current_billable: o.summary.total_current_billable, total_projected_billable: o.summary.total_projected_billable, parts: o.lines.parts.length, services: o.lines.services.length } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});