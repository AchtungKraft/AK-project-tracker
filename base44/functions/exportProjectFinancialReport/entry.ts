import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { jsPDF } from 'npm:jspdf@2.5.2';
import * as autoTableMod from 'npm:jspdf-autotable@3.8.2';
const autoTable = (doc, o) => ((autoTableMod.autoTable || autoTableMod.default?.default || autoTableMod.default)(doc, o));
import ExcelJS from 'npm:exceljs@4.4.0';

/**
 * exportProjectFinancialReport — admin-only, READ-ONLY.
 * Single snapshot from getProjectFinancialOverview (no independent formulas). PDF and Excel are both built
 * from the same model below. Client report never contains internal cost/margin.
 */
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const usd = (n) => (n == null ? 'Missing' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const hrs = (n) => (n == null ? '—' : `${Number(n).toFixed(2)} h`);
const TYPE = { BILLABLE: 'Billable', INCLUDED_IN_SERVICE: 'Included in service', NON_BILLABLE: 'Non-billable', UNCLASSIFIED: 'Unclassified' };
const OTHER_LABEL = { INCLUDED_IN_SERVICE: 'Included in Service', NON_BILLABLE: 'No Charge', UNCLASSIFIED: 'Needs Classification', CANCELLED: 'Cancelled' };
const OTHER_TITLE = 'Other Labor — Not Separately Billable';
const SECTIONS = ['summary', 'parts', 'services', 'labor', 'invoices'];

const avail = (p) => Math.max(0, p.available_qty - p.allocated_qty);
const partStatus = (p) => [p.invoiced_qty > 0 && `${p.invoiced_qty} finalized`, p.allocated_qty > 0 && `${p.allocated_qty} on draft`, avail(p) > 0 && `${avail(p)} available`].filter(Boolean).join(', ') || 'Nothing to bill';
const partEst = (p) => (p.cost_state === 'missing' ? null : p.est_cost);
const partAct = (p) => (p.actual_unit_cost == null ? null : r2(p.actual_unit_cost * p.qty));
const svcStatus = (s) => (s.invoiced ? 'Finalized' : s.allocated ? `On ${s.draft_count} draft(s)` : 'Available');
const isBill = (t) => t.billing_type === 'BILLABLE' && !t.cancelled;
const laborStatus = (t) => (t.cancelled ? 'Cancelled' : TYPE[t.billing_type] || 'Unclassified') + (isBill(t) ? ' (valued, not invoiced)' : '');
const sum = (a, f) => r2(a.reduce((x, r) => x + (f(r) || 0), 0));

function buildModel(o, client) {
  const parts = o.lines.parts.filter((p) => !client || p.qty > 0);
  const services = o.lines.services;
  const hasHours = (t) => t.logged > 0 || t.remaining_hours > 0;
  const labor = o.labor_billing.tasks.filter((t) => isBill(t) && (client ? t.effective_rate != null : hasHours(t)));
  const bl = labor;
  // Group by canonical remaining estimated BILLABLE hours. Not a completion status.
  const grp = (title, rows) => ({ title, rows, h: sum(rows, (t) => t.logged), b: sum(rows, (t) => t.billable_to_date), rh: sum(rows, (t) => t.remaining_hours), pa: sum(rows, (t) => t.projected_remaining) });
  const laborGroups = [grp('Billable — Remaining Estimated Work', labor.filter((t) => t.remaining_hours > 0)), grp('Billable — No Remaining Estimated Hours', labor.filter((t) => !(t.remaining_hours > 0)))];
  // Group C: labor not separately billable — hours only, $0 additional revenue.
  const svcName = new Map(services.map((x) => [x.id || x.commitment_id, x.description]));
  const kind = (t) => (t.cancelled ? 'CANCELLED' : t.billing_type === 'INCLUDED_IN_SERVICE' || t.billing_type === 'NON_BILLABLE' ? t.billing_type : 'UNCLASSIFIED');
  const otherKinds = client ? ['INCLUDED_IN_SERVICE', 'NON_BILLABLE'] : ['INCLUDED_IN_SERVICE', 'NON_BILLABLE', 'UNCLASSIFIED', 'CANCELLED'];
  const otherTasks = o.labor_billing.tasks.filter((t) => !isBill(t) && hasHours(t) && otherKinds.includes(kind(t)));
  const otherGroups = otherKinds.map((k) => {
    const rows = otherTasks.filter((t) => kind(t) === k);
    return { key: k, title: OTHER_LABEL[k], rows, h: sum(rows, (t) => t.logged), eh: sum(rows, (t) => t.estimated_hours), rh: sum(rows, (t) => t.remaining_hours) };
  }).filter((g) => g.rows.length);
  const other = { groups: otherGroups, h: sum(otherTasks, (t) => t.logged), eh: sum(otherTasks, (t) => t.estimated_hours), rh: sum(otherTasks, (t) => t.remaining_hours), svc: (t) => (t.service_commitment_id ? svcName.get(t.service_commitment_id) || 'Linked service' : '—') };
  const svcActKnown = services.every((s) => s.actual_cost != null);
  const s = o.summary;
  return {
    parts, services, labor, laborGroups, other,
    tot: {
      parts: o.categories.parts.billable, services: o.categories.services.billable,
      partsRows: sum(parts, (p) => p.billable), servicesRows: sum(services, (x) => x.billable),
      qReq: sum(parts, (p) => p.qty), qFin: sum(parts, (p) => p.invoiced_qty), qDraft: sum(parts, (p) => p.allocated_qty), qAvail: sum(parts, avail),
      partsEst: o.categories.parts.estimated_cost, partsDraft: sum(parts, (p) => p.draft_amount),
      svcQty: services.length, svcEst: o.categories.services.estimated_cost,
      svcAct: svcActKnown ? sum(services, (x) => x.actual_cost) : null, svcActPartial: sum(services, (x) => x.actual_cost),
      svcDraft: sum(services, (x) => x.draft_amount),
      laborHours: o.labor_billing.hours.billable, laborRemHours: o.labor_billing.remaining_billable_hours,
      laborToDate: s.labor_billable_to_date, laborProjected: s.labor_projected_remaining,
      laborRowsToDate: sum(bl, (t) => t.billable_to_date), laborRowsProjected: sum(bl, (t) => t.projected_remaining),
      laborRowsHours: sum(bl, (t) => t.logged), laborRowsRemHours: sum(bl, (t) => t.remaining_hours),
    },
  };
}

// Summary groups shared by PDF + Excel. Values are numbers (money) or strings.
function summaryGroups(o, client, proj) {
  const s = o.summary;
  const g = [{ title: 'Current Project Value', rows: [
    ['Parts billable', o.categories.parts.billable],
    ['Services billable', o.categories.services.billable],
    ['Separately billable labor to date (valued, not yet invoiced)', s.labor_billable_to_date],
    ['Total current billable', s.total_current_billable, true],
  ] }];
  if (proj) g.push({ title: client ? 'Projected Value (estimate, not currently payable)' : 'Projected Value (estimate)', rows: [
    ['Remaining estimated billable labor', s.labor_projected_remaining],
    ['Total projected project value', s.total_projected_billable, true],
  ] });
  g.push({ title: 'Invoice Position', rows: [
    ['Finalized invoiced' + (client ? ' (historical)' : ''), s.finalized_invoiced],
    ['Paid', s.paid_amount],
    ['Outstanding', s.outstanding_balance],
    ['Allocated to drafts', s.allocated_to_drafts],
    ['Parts & Services available to invoice', s.available_to_invoice, true],
  ] });
  if (!client) g.push({ title: 'Parts & Services Profitability (internal)', rows: [
    ['Estimated Parts & Services cost' + (s.cost_complete ? '' : ' (incomplete)'), s.estimated_cost],
    ['Estimated gross profit', s.estimated_gross_profit],
    ['Estimated gross margin', s.estimated_gross_margin_pct == null ? '—' : `${s.estimated_gross_margin_pct}%`, true],
  ] });
  return g;
}

function reconRows(o, proj) {
  const s = o.summary;
  const rows = [
    ['Parts', o.categories.parts.billable, null, o.categories.parts.billable],
    ['Services', o.categories.services.billable, null, o.categories.services.billable],
    ['Labor', s.labor_billable_to_date, s.labor_projected_remaining, r2(s.labor_billable_to_date + s.labor_projected_remaining)],
    ['TOTAL', s.total_current_billable, s.labor_projected_remaining, s.total_projected_billable],
  ];
  return proj ? rows : rows.map((r) => [r[0], r[1]]);
}

const DARK = [31, 41, 55], RED = [220, 38, 38], SUB = [229, 231, 235], GRAND = [254, 226, 226];

function buildPdf(o, opts) {
  const client = opts.report_type === 'client';
  const proj = !client || opts.include_projected;
  const m = buildModel(o, client);
  const doc = new jsPDF({ orientation: client ? 'portrait' : 'landscape', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), L = 36;
  const title = client ? 'Client Billing Detail — Not an Invoice' : 'Internal Financial Report';
  const stamp = new Date(o.generated_at).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });
  const pid = o.project_id.slice(-8).toUpperCase();

  // Compact header
  doc.setFillColor(...RED); doc.rect(0, 0, W, 34, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('ÄCHTUNG KRAFT', L, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(title, W - L, 22, { align: 'right' });
  doc.setFillColor(...DARK); doc.rect(0, 34, W, 40, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(o.project_name || 'Project', L, 50);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(209, 213, 219);
  doc.text(`Client: ${o.project_info?.client_name || '—'}   ·   Project ID: ${pid}   ·   VIN/Chassis: ${o.project_info?.vin || '—'}   ·   Generated: ${stamp} CT`, L, 64);
  let y = 86;
  doc.setTextColor(20);
  if (client) {
    doc.setFontSize(8); doc.setTextColor(160, 0, 0);
    const t = doc.splitTextToSize('Billing detail for review only. This is not an invoice and creates no payment obligation. Previously invoiced amounts are historical. Projected amounts are estimates, not amounts currently payable.', W - 2 * L);
    doc.text(t, L, y); y += t.length * 10 + 4; doc.setTextColor(20);
  }

  const base = {
    theme: 'grid', showHead: 'everyPage', rowPageBreak: 'avoid', margin: { left: L, right: L, top: 40, bottom: 40 },
    styles: { fontSize: 8, cellPadding: 3.5, overflow: 'linebreak', valign: 'middle', lineColor: [209, 213, 219], lineWidth: 0.5 },
    headStyles: { fillColor: DARK, textColor: 255, fontStyle: 'bold', fontSize: 8 },
  };
  const heading = (name, minBelow = 130) => {
    if (y + 22 + minBelow > H - 40) { doc.addPage(); y = 40; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...RED); doc.text(name, L, y + 12); doc.setTextColor(20);
    y += 18;
  };
  const subheading = (name, minBelow = 70) => {
    if (y + 16 + minBelow > H - 40) { doc.addPage(); y = 40; } // keep with header + first rows
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...DARK); doc.text(name, L, y + 10); doc.setTextColor(20); doc.setFont('helvetica', 'normal');
    y += 15;
  };
  const note = (txt) => {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(90);
    const t = doc.splitTextToSize(txt, W - 2 * L);
    if (y + t.length * 10 > H - 40) { doc.addPage(); y = 40; }
    doc.text(t, L, y + 8); y += t.length * 10 + 4; doc.setTextColor(20); doc.setFont('helvetica', 'normal');
  };
  // marks: { [rowIndex]: 'sub' | 'grand' | 'group' }
  const table = (head, body, { right = [], marks = {}, widths = {} } = {}) => {
    const columnStyles = {};
    right.forEach((i) => (columnStyles[i] = { halign: 'right' }));
    Object.entries(widths).forEach(([i, w]) => (columnStyles[i] = { ...(columnStyles[i] || {}), cellWidth: w }));
    // Keep short tables (summaries, reconciliation) together on one page.
    if (body.length <= 12 && y + 20 + body.length * 17 > H - 40) { doc.addPage(); y = 40; }
    const subIdx = body.length - 1;
    if (marks[subIdx] === 'sub' && body.length > 3) {
      // Dry-run on a scratch doc: if the subtotal would land alone on a new page, break before the last data row.
      const scratch = new jsPDF({ orientation: client ? 'portrait' : 'landscape', unit: 'pt', format: 'letter' });
      const pg = {};
      autoTable(scratch, { ...base, startY: y, head: [head], body, columnStyles, didDrawCell: (d) => { if (d.section === 'body') pg[d.row.index] = d.pageNumber; } });
      if (pg[subIdx] !== pg[subIdx - 1]) {
        const cut = subIdx - 1;
        draw(head, body.slice(0, cut), marks, columnStyles);
        doc.addPage(); y = 40;
        draw(head, body.slice(cut), { 1: 'sub' }, columnStyles);
        return;
      }
    }
    draw(head, body, marks, columnStyles);
  };
  const draw = (head, body, marks, columnStyles) => {
    autoTable(doc, {
      ...base, startY: y, head: [head], body, columnStyles,
      didParseCell: (d) => {
        if (d.section !== 'body') return;
        const k = marks[d.row.index];
        if (k === 'sub') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = SUB; }
        if (k === 'grand') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = GRAND; d.cell.styles.textColor = [127, 29, 29]; }
        if (k === 'group') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [243, 244, 246]; d.cell.styles.textColor = [55, 65, 81]; }
      },
    });
    y = doc.lastAutoTable.finalY + 14;
  };
  const empty = (txt) => { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(110); doc.text(txt, L, y + 6); doc.setTextColor(20); y += 20; };
  const S = opts.sections;

  if (S.includes('summary')) {
    heading('Financial Summary');
    const body = [], marks = {};
    summaryGroups(o, client, proj).forEach((g) => {
      marks[body.length] = 'group'; body.push([g.title, '']);
      g.rows.forEach(([k, v, strong]) => { if (strong) marks[body.length] = 'sub'; body.push([k, typeof v === 'number' ? usd(v) : v]); });
    });
    table(['Measure', 'Amount'], body, { right: [1], marks, widths: { 1: 110 } });
    note('Current project value is not the amount currently invoice-eligible. Separately billable labor is valued but not yet supported by the invoicing workflow. Projected labor is an estimate of future work, not completed work.');
  }

  if (S.includes('parts')) {
    heading('Parts Detail');
    if (!m.parts.length) empty('No parts recorded.');
    else {
      const T = m.tot;
      const name = (p) => (p.part_number ? `${p.part_name || 'Unknown part'}\n${p.part_number}` : p.part_name || 'Unknown part');
      if (client) {
        const body = m.parts.map((p) => [name(p), p.qty, p.invoiced_qty, p.allocated_qty, avail(p), usd(p.unit_retail), usd(p.billable), partStatus(p)]);
        body.push(['Parts subtotal', T.qReq, T.qFin, T.qDraft, T.qAvail, '', usd(T.parts), '']);
        table(['Description / Part #', 'Required', 'Finalized', 'On draft', 'Available', 'Unit price', 'Billable', 'Billing status'], body, { right: [1, 2, 3, 4, 5, 6], marks: { [body.length - 1]: 'sub' }, widths: { 0: 150, 7: 80 } });
      } else {
        const body = m.parts.map((p) => [name(p), p.qty, p.invoiced_qty, p.allocated_qty, avail(p), p.cost_state === 'zero_client_supplied' ? '$0.00 (client)' : usd(partEst(p)), p.actual_unit_cost == null ? 'Not recorded' : usd(partAct(p)), usd(p.unit_retail), usd(p.billable), partStatus(p)]);
        body.push(['Parts subtotal', T.qReq, T.qFin, T.qDraft, T.qAvail, usd(T.partsEst), '', '', usd(T.parts), '']);
        table(['Description / Part #', 'Required', 'Finalized', 'On draft', 'Available', 'Est. cost (ext.)', 'Actual cost (ext.)', 'Unit sale price', 'Billable', 'Billing status'], body, { right: [1, 2, 3, 4, 5, 6, 7, 8], marks: { [body.length - 1]: 'sub' }, widths: { 0: 200, 9: 110 } });
        note('Estimated and actual cost are extended (quantity × unit cost). Unit sale price is the per-unit billing price; unit prices are not totaled.');
      }
    }
  }

  if (S.includes('services')) {
    heading('Services Detail');
    if (!m.services.length) empty('No services recorded.');
    else {
      const T = m.tot;
      const dr = (s) => (s.allocated ? usd(s.draft_amount) : '—');
      if (client) {
        const body = m.services.map((s) => [s.description || '—', 1, usd(s.billable), dr(s), svcStatus(s)]);
        body.push(['Services subtotal', T.svcQty, usd(T.services), usd(T.svcDraft), '']);
        table(['Description', 'Qty', 'Billable', 'Draft allocation', 'Billing status'], body, { right: [1, 2, 3], marks: { [body.length - 1]: 'sub' } });
      } else {
        const body = m.services.map((s) => [s.description || '—', 1, usd(s.est_cost), s.actual_cost == null ? 'Not recorded' : usd(s.actual_cost), usd(s.billable), dr(s), svcStatus(s)]);
        body.push(['Services subtotal', T.svcQty, usd(T.svcEst), T.svcAct == null ? (T.svcActPartial ? `${usd(T.svcActPartial)} (partial)` : 'Not recorded') : usd(T.svcAct), usd(T.services), usd(T.svcDraft), '']);
        table(['Description', 'Qty', 'Est. cost', 'Actual cost', 'Billable', 'Draft allocation', 'Billing status'], body, { right: [1, 2, 3, 4, 5], marks: { [body.length - 1]: 'sub' }, widths: { 0: 240 } });
      }
      note('Draft allocation is the amount locked on a draft invoice at the time it was drafted; it can differ from the current billable price.');
    }
  }

  if (S.includes('labor')) {
    heading(client ? 'Separately Billable Labor' : 'Labor Detail');
    if (!m.labor.length && !m.other.groups.length) empty('No labor recorded.');
    else {
      const T = m.tot;
      const head = ['Task', 'Billable logged hrs', 'Approved rate', 'Billable to date', ...(proj ? ['Remaining est. hrs', 'Projected add\'l billing'] : []), 'Classification'];
      const opt = (n) => ({ right: proj ? [1, 2, 3, 4, 5] : [1, 2, 3], marks: { [n - 1]: 'sub' }, widths: { 0: client ? 140 : 220 } });
      m.laborGroups.forEach((g) => {
        subheading(`${g.title} (${g.rows.length} task${g.rows.length === 1 ? '' : 's'})`);
        if (!g.rows.length) { empty('No tasks in this group.'); return; }
        const body = g.rows.map((t) => [t.name, isBill(t) ? hrs(t.logged) : `${hrs(t.logged)} (not billed separately)`, isBill(t) && t.effective_rate != null ? `${usd(t.effective_rate)}/h` : '—', isBill(t) ? usd(t.billable_to_date) : '—', ...(proj ? [isBill(t) ? hrs(t.remaining_hours) : '—', isBill(t) ? usd(t.projected_remaining) : '—'] : []), laborStatus(t)]);
        body.push([`${g.title} subtotal (billable only)`, hrs(g.h), '', usd(g.b), ...(proj ? [hrs(g.rh), usd(g.pa)] : []), '']);
        table(head, body, opt(body.length));
      });
      subheading(`${OTHER_TITLE} (${m.other.groups.reduce((n, g) => n + g.rows.length, 0)} tasks)`);
      if (!m.other.groups.length) empty('No other labor recorded.');
      else {
        note('Hours only — $0 additional labor billing. Recorded hours are work already logged; estimated and remaining hours are future estimates.');
        const oh = ['Task', 'Classification', 'Linked service', 'Recorded hrs (logged)', 'Estimated hrs', 'Remaining est. hrs (future)'];
        m.other.groups.forEach((g) => {
          subheading(`${g.title} (${g.rows.length})`);
          const body = g.rows.map((t) => [t.name, g.title, m.other.svc(t), hrs(t.logged), hrs(t.estimated_hours), hrs(t.remaining_hours)]);
          body.push([`${g.title} subtotal (no revenue)`, '', '', hrs(g.h), hrs(g.eh), hrs(g.rh)]);
          table(oh, body, { right: [3, 4, 5], marks: { [body.length - 1]: 'sub' }, widths: { 0: client ? 150 : 220 } });
        });
        table(['Other labor totals (no revenue)', 'Recorded hrs', 'Remaining est. hrs'], [['Total other labor', hrs(m.other.h), hrs(m.other.rh)]], { right: [1, 2], marks: { 0: 'sub' } });
      }
      subheading('Labor Grand Totals', 120);
      const gt = [['Total billable logged hours', hrs(T.laborHours)], ['Total labor billable to date (current)', usd(T.laborToDate)]];
      if (proj) gt.push(['Total remaining estimated billable hours (projected)', hrs(T.laborRemHours)], ['Total projected additional labor (estimate)', usd(T.laborProjected)], ['= Projected total labor billing', usd(r2(T.laborToDate + T.laborProjected))]);
      table(['Labor grand totals', 'Value'], gt, { right: [1], marks: { [gt.length - 1]: 'grand' }, widths: { 1: 110 } });
      note((client ? '' : 'Internal labor costs are not configured; labor margin is not calculated. ') + 'Only labor classified Billable is valued. Service-included, non-billable and unclassified hours are not counted as additional labor revenue. Rates are not totaled.');
    }
  }

  if (S.includes('invoices')) {
    const list = o.invoice_list || [];
    heading('Invoices', list.length <= 12 ? 30 + list.length * 17 : 60);
    if (!list.length) empty('No invoices recorded.');
    else table(['Invoice', 'Type', 'Status', 'Issue date', 'Total', 'Paid', 'Balance due'], list.map((i) => [i.number || i.id.slice(-6), i.type || '', i.status, i.issue_date || '', usd(i.total), usd(i.paid), i.balance_due == null ? '—' : usd(i.balance_due)]), { right: [4, 5, 6] });
  }

  // Final reconciliation
  heading('Financial Reconciliation', 250); // keep reconciliation + invoice position + note together
  const rr = reconRows(o, proj).map((r) => r.map((v, i) => (i === 0 ? v : v == null ? '—' : usd(v))));
  table(proj ? ['Category', 'Current billable', 'Projected additional', 'Projected total'] : ['Category', 'Current billable'], rr, { right: proj ? [1, 2, 3] : [1], marks: { 3: 'grand' } });
  const s = o.summary;
  table(['Invoice position (Parts & Services only)', 'Amount'], [['Finalized invoiced', usd(s.finalized_invoiced)], ['Paid', usd(s.paid_amount)], ['Outstanding', usd(s.outstanding_balance)], ['Allocated to drafts', usd(s.allocated_to_drafts)], ['Available to invoice', usd(s.available_to_invoice)]], { right: [1], marks: { 4: 'sub' }, widths: { 1: 110 } });
  note(client ? 'Projected totals are estimates and are not amounts currently payable. Labor is valued but not yet invoiced.' : 'Invoice position covers Parts & Services only. Labor is valued but not yet supported by the invoicing workflow and is not included in available-to-invoice.');

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120);
    doc.text(`Ächtung Kraft · ${o.project_name} · ${title} · ${pid} · ${stamp} CT`, L, H - 18);
    doc.text(`Page ${i} of ${n}`, W - L, H - 18, { align: 'right' });
  }
  doc.setProperties({ title: `${o.project_name} — ${title}`, author: 'Ächtung Kraft', subject: title });
  return new Uint8Array(doc.output('arraybuffer'));
}

async function buildXlsx(o, opts) {
  const client = opts.report_type === 'client';
  const proj = !client || opts.include_projected;
  const m = buildModel(o, client);
  const wb = new ExcelJS.Workbook(); wb.creator = 'Ächtung Kraft'; wb.created = new Date(o.generated_at);
  const MONEY = '"$"#,##0.00', HRS = '0.00" h"', QTY = '#,##0.##';
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const styleRow = (r, kind) => {
    r.font = { bold: true, ...(kind === 'grand' ? { color: { argb: 'FF7F1D1D' } } : kind === 'check' ? { italic: true, bold: false, color: { argb: 'FF6B7280' } } : {}) };
    r.fill = fill(kind === 'grand' ? 'FFFEE2E2' : kind === 'check' ? 'FFFFFFFF' : kind === 'group' ? 'FFF3F4F6' : 'FFE5E7EB');
    if (kind === 'sub' || kind === 'grand') r.eachCell((c) => (c.border = { top: { style: 'thin' } }));
  };
  // cols: {h,k,w,f,sum}  sum = include formula check
  const sheet = (name, cols, rows, totals, emptyText) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: c.h, key: c.k, width: c.w || 14, style: { ...(c.f ? { numFmt: c.f } : {}), alignment: { wrapText: !!c.wrap, vertical: 'top', ...(c.f ? { horizontal: 'right' } : {}) } } }));
    const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = fill('FF1F2937'); h.alignment = { wrapText: true, vertical: 'middle' }; h.height = 30;
    if (!rows.length) { ws.addRow({ [cols[0].k]: emptyText }).font = { italic: true, color: { argb: 'FF6B7280' } }; return ws; }
    rows.forEach((r) => ws.addRow(r));
    const last = rows.length + 1;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: cols.length } };
    if (totals) {
      styleRow(ws.addRow(totals), 'sub');
      const chk = { [cols[0].k]: 'Formula check (sum of rows above)' };
      cols.forEach((c, i) => { if (c.sum) { const col = ws.getColumn(i + 1).letter; chk[c.k] = { formula: `SUBTOTAL(9,${col}2:${col}${last})` }; } });
      styleRow(ws.addRow(chk), 'check');
    }
    return ws;
  };
  const S = opts.sections;
  const T = m.tot;

  if (S.includes('summary')) {
    const ws = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 6 }] });
    ws.columns = [{ key: 'k', width: 58 }, { key: 'v', width: 20, style: { numFmt: MONEY, alignment: { horizontal: 'right' } } }, { key: 'v2', width: 20, style: { numFmt: MONEY } }, { key: 'v3', width: 20, style: { numFmt: MONEY } }];
    const t = ws.addRow({ k: 'ÄCHTUNG KRAFT — ' + (client ? 'Client Billing Detail (Not an Invoice)' : 'Internal Financial Report') }); t.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }; t.fill = fill('FFDC2626');
    ws.addRow({ k: `Project: ${o.project_name}   ·   Project ID: ${o.project_id.slice(-8).toUpperCase()}` });
    ws.addRow({ k: `Client: ${o.project_info?.client_name || '—'}   ·   VIN/Chassis: ${o.project_info?.vin || '—'}` });
    ws.addRow({ k: `Generated: ${new Date(o.generated_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })} (Central)` });
    ws.addRow({ k: client ? 'Billing detail for review only. Not an invoice. Projected amounts are estimates, not currently payable.' : 'Confidential. Internal labor costs are not configured; margin covers Parts & Services only.' }).font = { italic: true, color: { argb: 'FF6B7280' } };
    ws.addRow({});
    summaryGroups(o, client, proj).forEach((g) => {
      styleRow(ws.addRow({ k: g.title }), 'group');
      g.rows.forEach(([k, v, strong]) => { const r = ws.addRow({ k, v }); if (strong) styleRow(r, 'sub'); });
      ws.addRow({});
    });
    styleRow(ws.addRow(proj ? { k: 'Financial Reconciliation', v: 'Current Billable', v2: 'Projected Additional', v3: 'Projected Total' } : { k: 'Financial Reconciliation', v: 'Current Billable' }), 'group');
    reconRows(o, proj).forEach((r) => { const row = ws.addRow({ k: r[0], v: r[1], ...(proj ? { v2: r[2] ?? '—', v3: r[3] } : {}) }); if (r[0] === 'TOTAL') styleRow(row, 'grand'); });
  }

  if (S.includes('parts')) {
    const cols = [{ h: 'Description', k: 'd', w: 40, wrap: true }, { h: 'Part #', k: 'pn', w: 18 }, { h: 'Required Qty', k: 'q', w: 11, f: QTY, sum: 1 }, { h: 'Finalized Qty', k: 'fq', w: 11, f: QTY, sum: 1 }, { h: 'Draft Qty', k: 'dq', w: 10, f: QTY, sum: 1 }, { h: 'Available Qty', k: 'aq', w: 11, f: QTY, sum: 1 }];
    if (!client) cols.push({ h: 'Estimated Cost (ext.)', k: 'ec', f: MONEY, sum: 1 }, { h: 'Actual Cost (ext.)', k: 'ac', f: MONEY });
    cols.push({ h: 'Unit Sale Price', k: 'up', f: MONEY }, { h: 'Billable', k: 'b', f: MONEY, sum: 1 }, { h: 'Draft Amount', k: 'da', f: MONEY, sum: 1 }, { h: 'Billing Status', k: 's', w: 30, wrap: true }, { h: 'Invoice Eligible Now', k: 'el', w: 12 });
    sheet('Parts', cols, m.parts.map((p) => ({ d: p.part_name || 'Unknown part', pn: p.part_number || '', q: p.qty, fq: p.invoiced_qty, dq: p.allocated_qty, aq: avail(p), ...(client ? {} : { ec: partEst(p) ?? 'Missing', ac: partAct(p) ?? 'Not recorded' }), up: p.unit_retail ?? 'Missing', b: p.billable, da: p.draft_amount, s: partStatus(p), el: avail(p) > 0 ? 'Yes' : 'No' })),
      { d: 'Parts subtotal', q: T.qReq, fq: T.qFin, dq: T.qDraft, aq: T.qAvail, ...(client ? {} : { ec: T.partsEst }), b: T.parts, da: T.partsDraft }, 'No parts recorded.');
  }
  if (S.includes('services')) {
    const cols = [{ h: 'Description', k: 'd', w: 46, wrap: true }, { h: 'Qty', k: 'q', w: 8, f: QTY, sum: 1 }];
    if (!client) cols.push({ h: 'Estimated Cost', k: 'ec', f: MONEY, sum: 1 }, { h: 'Actual Cost', k: 'ac', f: MONEY });
    cols.push({ h: 'Billable', k: 'b', f: MONEY, sum: 1 }, { h: 'Draft Amount', k: 'da', f: MONEY, sum: 1 }, { h: 'Billing Status', k: 's', w: 20 }, { h: 'Invoice Eligible Now', k: 'el', w: 12 });
    sheet('Services', cols, m.services.map((s) => ({ d: s.description || '—', q: 1, ...(client ? {} : { ec: s.est_cost ?? 'Missing', ac: s.actual_cost ?? 'Not recorded' }), b: s.billable, da: s.allocated ? s.draft_amount : null, s: svcStatus(s), el: !s.invoiced && !s.allocated ? 'Yes' : 'No' })),
      { d: 'Services subtotal', q: T.svcQty, ...(client ? {} : { ec: T.svcEst, ac: T.svcAct ?? (T.svcActPartial ? `Partial: ${usd(T.svcActPartial)}` : 'Not recorded') }), b: T.services, da: T.svcDraft }, 'No services recorded.');
  }
  if (S.includes('labor')) {
    const cols = [{ h: 'Task', k: 'd', w: 44, wrap: true }, { h: 'Billable Logged Hours', k: 'h', f: HRS, sum: 1 }];
    if (!client) cols.push({ h: 'Logged Hours (all)', k: 'lh', f: HRS });
    cols.push({ h: 'Approved Rate', k: 'r', f: MONEY }, { h: 'Billable To Date', k: 'b', f: MONEY, sum: 1 });
    if (proj) cols.push({ h: 'Remaining Est. Hours', k: 'rh', f: HRS, sum: 1 }, { h: 'Projected Additional Billing', k: 'pa', f: MONEY, sum: 1 });
    cols.push({ h: 'Classification', k: 's', w: 32, wrap: true });
    if (!client) cols.push({ h: 'Internal Labor Cost', k: 'ic', w: 16 });
    cols.unshift({ h: 'Labor Group', k: 'g', w: 28 });
    const row = (t, g) => ({ g, d: t.name, h: isBill(t) ? t.logged : 0, lh: t.logged, r: isBill(t) ? t.effective_rate : null, b: isBill(t) ? t.billable_to_date : null, rh: isBill(t) ? t.remaining_hours : null, pa: isBill(t) ? t.projected_remaining : null, s: laborStatus(t), ic: 'Not configured' });
    const ws = wb.addWorksheet('Labor', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: c.h, key: c.k, width: c.w || 14, style: { ...(c.f ? { numFmt: c.f } : {}), alignment: { wrapText: !!c.wrap, vertical: 'top', ...(c.f ? { horizontal: 'right' } : {}) } } }));
    const hr = ws.getRow(1); hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }; hr.fill = fill('FF1F2937'); hr.alignment = { wrapText: true, vertical: 'middle' }; hr.height = 30;
    if (!m.labor.length && !m.other.groups.length) ws.addRow({ d: 'No labor recorded.' }).font = { italic: true, color: { argb: 'FF6B7280' } };
    else {
      m.laborGroups.forEach((g) => {
        styleRow(ws.addRow({ g: g.title, d: `${g.rows.length} task(s)` }), 'group');
        g.rows.forEach((t) => ws.addRow(row(t, g.title)));
        if (!g.rows.length) ws.addRow({ g: g.title, d: 'No tasks in this group.' }).font = { italic: true, color: { argb: 'FF6B7280' } };
        styleRow(ws.addRow({ g: g.title, d: `${g.title} subtotal (billable only)`, h: g.h, b: g.b, ...(proj ? { rh: g.rh, pa: g.pa } : {}) }), 'sub');
      });
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: cols.length } };
      ws.addRow({});
      // Group C — separate sheet section with hours-only columns (no rate / revenue).
      styleRow(ws.addRow({ g: OTHER_TITLE, d: 'Hours only — $0 additional labor billing' }), 'group');
      // Fixed columns: A group, B task, C recorded, D estimated, E remaining, F linked service, G classification.
      const put = (vals, kind) => {
        const r = ws.addRow([]);
        vals.forEach((v, i) => { const c = r.getCell(i + 1); c.value = v; c.numFmt = i >= 2 && i <= 4 && typeof v === 'number' ? HRS : 'General'; c.alignment = { horizontal: i >= 2 && i <= 4 ? 'right' : 'left', wrapText: true, vertical: 'top' }; });
        if (kind) styleRow(r, kind);
        return r;
      };
      put(['Labor Group', 'Task', 'Recorded Hours (logged)', 'Estimated Hours', 'Remaining Est. Hours (future)', 'Linked Service', 'Classification']).font = { bold: true };
      m.other.groups.forEach((g) => {
        const gl = `${OTHER_TITLE}: ${g.title}`;
        g.rows.forEach((t) => put([gl, t.name, t.logged || 0, t.estimated_hours ?? 0, t.remaining_hours || 0, m.other.svc(t), g.title]));
        put([gl, `${g.title} subtotal (no revenue)`, g.h, g.eh, g.rh, '', ''], 'sub');
      });
      if (!m.other.groups.length) put([OTHER_TITLE, 'No other labor recorded.']);
      else put([OTHER_TITLE, 'Total other labor (no revenue)', m.other.h, m.other.eh, m.other.rh, '', ''], 'sub');
      ws.addRow({});
      styleRow(ws.addRow({ d: 'Labor Grand Totals' }), 'group');
      ws.addRow({ d: 'Total billable logged hours', h: T.laborHours });
      ws.addRow({ d: 'Total labor billable to date (current)', b: T.laborToDate });
      if (proj) {
        ws.addRow({ d: 'Total remaining estimated billable hours (projected)', rh: T.laborRemHours });
        ws.addRow({ d: 'Total projected additional labor (estimate)', pa: T.laborProjected });
        styleRow(ws.addRow({ d: '= Projected total labor billing', b: r2(T.laborToDate + T.laborProjected) }), 'grand');
      }
    }
  }
  if (S.includes('invoices')) {
    const list = o.invoice_list || [];
    const ws = sheet('Invoices & Allocations', [{ h: 'Invoice', k: 'n', w: 34 }, { h: 'Type', k: 't' }, { h: 'Status', k: 's' }, { h: 'Issue Date', k: 'd' }, { h: 'Total', k: 'tot', f: MONEY }, { h: 'Paid', k: 'p', f: MONEY }, { h: 'Balance Due', k: 'bd', f: MONEY }],
      list.map((i) => ({ n: i.number || i.id.slice(-6), t: i.type || '', s: i.status, d: i.issue_date || '', tot: i.total, p: i.paid, bd: i.balance_due })), null, 'No invoices recorded.');
    const s = o.summary;
    ws.addRow({}); styleRow(ws.addRow({ n: 'Invoice position (Parts & Services only)' }), 'group');
    [['Finalized invoiced', s.finalized_invoiced], ['Paid', s.paid_amount], ['Outstanding', s.outstanding_balance], ['Allocated to drafts', s.allocated_to_drafts]].forEach(([n, v]) => ws.addRow({ n, tot: v }));
    styleRow(ws.addRow({ n: 'Available to invoice', tot: s.available_to_invoice }), 'sub');
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
    const { tot, laborGroups, other } = buildModel(o, report_type === 'client');
    const check = { total_current_billable: o.summary.total_current_billable, total_projected_billable: o.summary.total_projected_billable, parts: tot.parts, parts_rows: tot.partsRows, services: tot.services, services_rows: tot.servicesRows, qty: [tot.qReq, tot.qFin, tot.qDraft, tot.qAvail], labor: [tot.laborHours, tot.laborRowsHours, tot.laborToDate, tot.laborRowsToDate, tot.laborRemHours, tot.laborRowsRemHours, tot.laborProjected, tot.laborRowsProjected], drafts: [tot.partsDraft, tot.svcDraft, o.summary.allocated_to_drafts] };
    check.labor_groups = laborGroups.map((g) => ({ title: g.title, tasks: g.rows.map((t) => t.task_id || t.id || t.name), h: g.h, b: g.b, rh: g.rh, pa: g.pa }));
    check.other_groups = other.groups.map((g) => ({ title: g.title, tasks: g.rows.map((t) => t.id || t.name), h: g.h, rh: g.rh }));
    check.all_logged = sum(o.labor_billing.tasks, (t) => t.logged);
    if (report_type === 'internal') check.est_cost = [o.summary.estimated_cost, o.summary.estimated_gross_profit];
    return Response.json({ success: true, filename, file_base64: b64(bytes), generated_at: o.generated_at, check });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});