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
const COMP_TYPE = { vendor_cost: 'Vendor', internal_labor: 'AK labor' };
// Explanatory component rows for one service; never added to totals. diff = parent − components.
const svcBreakdown = (o, s) => {
  const rows = (o.svc_components?.[s.id] || []).map((li) => ({ t: COMP_TYPE[li.type] || li.type || 'Item', d: li.description || '—', q: li.quantity ?? null, c: li.cost == null ? null : r2(li.cost * (li.quantity ?? 1)), b: li.billing_rate == null ? null : r2(li.billing_rate * (li.quantity ?? 1)) }));
  if (!rows.length) return null;
  return { rows, dc: r2((s.est_cost ?? 0) - sum(rows, (r) => r.c)), db: r2((s.billable ?? 0) - sum(rows, (r) => r.b)) };
};
// Client-safe presentation: removes only the recognized trailing internal tag "// Achtung Kraft Labor"; stored text untouched.
const CLIENT_TYPE = { vendor_cost: 'Outside service / materials', internal_labor: 'Work performed by AK' };
const clientDesc = (d) => (d || '').replace(/\s*\/\/\s*\.?\s*achtung\s+kraft\s+labor\s*\.?\s*$/i, '').trim() || '—';
// PDF-only text safety: standard PDF fonts can't render glyphs outside Latin-1 (e.g. U+276D "❭").
const pdfSafe = (t) => String(t ?? '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/[\u2039\u203A\u276D\u276F\u00BB\u00AB\u2192]/g, '>').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '').replace(/[ \t]+/g, ' ').trim();
// Drop a trailing copy of the part number from the name (it already prints on its own line).
const pdfPartName = (p) => {
  let n = pdfSafe(p.part_name) || 'Unknown part';
  const pn = (p.part_number || '').trim();
  if (pn) { const esc = pn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); n = n.replace(new RegExp(`\\s*[>|#:-]?\\s*${esc}\\s*$`), '').trim() || n; }
  return n;
};
// Accounting wording that may need a customer-facing rewrite (flagged for admin review, not changed).
const NEEDS_REVIEW = /\b(cost|markup|margin|internal)\b/i;
const clientBreakdown = (o, s) => {
  const items = o.svc_components?.[s.id] || [];
  if (!items.length) return null;
  const rows = items.map((li) => ({ t: CLIENT_TYPE[li.type] || 'Service item', d: clientDesc(li.description), q: li.quantity ?? null, b: li.billing_rate == null ? null : r2(li.billing_rate * (li.quantity ?? 1)), long: (li.description || '').length > 200 }));
  return { rows, db: r2((s.billable ?? 0) - sum(rows, (r) => r.b)) };
};

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
  const otherTasks = o.labor_billing.tasks.filter((t) => !isBill(t) && (hasHours(t) || !t.cancelled) && otherKinds.includes(kind(t)));
  const otherGroups = otherKinds.map((k) => {
    const rows = otherTasks.filter((t) => kind(t) === k);
    return { key: k, title: OTHER_LABEL[k], rows, h: sum(rows, (t) => t.logged), eh: sum(rows, (t) => t.estimated_hours), rh: sum(rows, (t) => t.remaining_hours) };
  }).filter((g) => g.rows.length);
  const other = { groups: otherGroups, h: sum(otherTasks, (t) => t.logged), eh: sum(otherTasks, (t) => t.estimated_hours), rh: sum(otherTasks, (t) => t.remaining_hours), svc: (t) => (t.service_commitment_id ? svcName.get(t.service_commitment_id) || 'Linked service' : '—') };
  // Phase grouping: canonical Task.kanban_bucket_id → ProjectKanbanBucket (Workload order). Each task appears once.
  const phaseOf = (t) => o.task_phase?.[t.id] ?? null;
  const phases = [...(o.phases || []), { id: null, name: 'Unassigned Phase' }].map((p) => {
    const inP = (t) => phaseOf(t) === p.id;
    const groups = laborGroups.map((g) => grp(g.title, g.rows.filter(inP)));
    const og = otherGroups.map((g) => { const rows = g.rows.filter(inP); return { ...g, rows, h: sum(rows, (t) => t.logged), eh: sum(rows, (t) => t.estimated_hours), rh: sum(rows, (t) => t.remaining_hours) }; }).filter((g) => g.rows.length);
    const bill = groups.flatMap((g) => g.rows), oth = og.flatMap((g) => g.rows);
    const kh = (k) => sum(og.filter((g) => g.key === k), (g) => g.h);
    const b = sum(bill, (t) => t.billable_to_date), pa = sum(bill, (t) => t.projected_remaining);
    return { name: p.name, groups, other: og, n: bill.length + oth.length, allH: r2(sum(bill, (t) => t.logged) + sum(oth, (t) => t.logged)), h: sum(bill, (t) => t.logged), b, rh: sum(bill, (t) => t.remaining_hours), pa, pt: r2(b + pa), nbH: kh('NON_BILLABLE'), incH: kh('INCLUDED_IN_SERVICE'), uncH: r2(kh('UNCLASSIFIED') + kh('CANCELLED')) };
  }).filter((p) => p.n);
  const svcActKnown = services.every((s) => s.actual_cost != null);
  const s = o.summary;
  return {
    parts, services, labor, laborGroups, other, phases,
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
    styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak', valign: 'middle', lineColor: [209, 213, 219], lineWidth: 0.5 },
    headStyles: { fillColor: DARK, textColor: 255, fontStyle: 'bold', fontSize: 8 },
  };
  const heading = (name, minBelow = 70) => {
    if (y + 18 + minBelow > H - 40) { doc.addPage(); y = 40; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...RED); doc.text(name, L, y + 10); doc.setTextColor(20);
    y += 14;
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
    if (body.length <= 12 && y + 20 + body.length * 14 > H - 40) { doc.addPage(); y = 40; }
    // Dry-run on a scratch doc, then break early so subtotal/grand rows never start a page
    // without their last task, and phase name rows never end a page alone.
    let rest = body, rm = marks;
    for (let guard = 0; guard < 50 && rest.length > 2; guard++) {
      const scratch = new jsPDF({ orientation: client ? 'portrait' : 'landscape', unit: 'pt', format: 'letter' });
      const pg = {};
      autoTable(scratch, { ...base, startY: y, head: [head], body: rest, columnStyles, didDrawCell: (d) => { if (d.section === 'body' && pg[d.row.index] == null) pg[d.row.index] = d.pageNumber; } });
      let cut = -1;
      for (let i = 1; i < rest.length && cut < 0; i++) {
        if (pg[i] === pg[i - 1]) continue;
        // row i starts a new page
        if (rm[i] === 'sub' || rm[i] === 'grand') cut = rm[i - 1] === 'sub' || rm[i - 1] === 'grand' ? i - 2 : i - 1;
        else if (rm[i - 1] === 'phase') cut = i - 1;
      }
      if (cut <= 0) break;
      draw(head, rest.slice(0, cut), rm, columnStyles);
      doc.addPage(); y = 40;
      const nm = {}; Object.entries(rm).forEach(([k, v]) => { if (+k >= cut) nm[+k - cut] = v; });
      rest = rest.slice(cut); rm = nm;
    }
    draw(head, rest, rm, columnStyles);
  };
  const draw = (head, body, marks, columnStyles) => {
    autoTable(doc, {
      ...base, startY: y, head: [head], body, columnStyles,
      didParseCell: (d) => {
        if (d.section !== 'body') return;
        const k = marks[d.row.index];
        if (k === 'sub') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = SUB; }
        if (k === 'grand') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = GRAND; d.cell.styles.textColor = [127, 29, 29]; }
        if (k === 'phase') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [55, 65, 81]; d.cell.styles.textColor = 255; }
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
      const name = (p) => { const n = pdfPartName(p); return p.part_number ? `${n}\n${p.part_number}` : n; };
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
        const body = [], marks = {};
        for (const s of m.services) {
          const bd = clientBreakdown(o, s);
          if (bd) marks[body.length] = 'group';
          body.push([`${s.description || '—'} — ${usd(s.billable)}`, 1, usd(s.billable), dr(s), svcStatus(s)]);
          if (!bd) continue;
          bd.rows.forEach((r) => body.push([`      ${r.t}: ${r.d}`, r.q ?? '—', r.b == null ? '—' : usd(r.b), '', '']));
          body.push([`      Service subtotal — ${s.description || '—'}`, '', usd(s.billable), '', '']);
        }
        body.push(['TOTAL SERVICES BILLABLE', T.svcQty, usd(T.services), usd(T.svcDraft), '']);
        marks[body.length - 1] = 'sub';
        table(['Description', 'Qty / hrs', 'Billable', 'Draft allocation', 'Billing status'], body, { right: [1, 2, 3], marks, widths: { 0: 250 } });
        note('Indented lines show what each service includes; they are part of the service total, not additional charges. Draft allocation is the amount locked when drafted.');
      } else {
        const body = [], marks = {};
        for (const s of m.services) {
          const bd = svcBreakdown(o, s);
          if (bd) marks[body.length] = 'group';
          body.push([s.description || '—', 1, usd(s.est_cost), s.actual_cost == null ? 'Not recorded' : usd(s.actual_cost), usd(s.billable), dr(s), svcStatus(s)]);
          if (!bd) continue;
          bd.rows.forEach((r) => body.push([`      ${r.t}: ${r.d}`, r.q ?? '—', r.c == null ? '—' : usd(r.c), '—', r.b == null ? '—' : usd(r.b), '', 'Component (info)']));
          if (bd.dc || bd.db) body.push(['      Difference: service total − components', '', usd(bd.dc), '', usd(bd.db), '', 'Review']);
        }
        body.push(['Services subtotal', T.svcQty, usd(T.svcEst), T.svcAct == null ? (T.svcActPartial ? `${usd(T.svcActPartial)} (partial)` : 'Not recorded') : usd(T.svcAct), usd(T.services), usd(T.svcDraft), '']);
        marks[body.length - 1] = 'sub';
        table(['Description', 'Qty / hrs', 'Est. cost', 'Actual cost', 'Billable', 'Draft allocation', 'Billing status'], body, { right: [1, 2, 3, 4, 5], marks, widths: { 0: 260 } });
        note('Shaded rows carry service totals; indented components are explanatory and not added again. Draft allocation is the amount locked when drafted.');
      }
    }
  }

  if (S.includes('labor')) {
    heading(client ? 'Separately Billable Labor' : 'Labor Detail');
    if (!m.labor.length && !m.other.groups.length) empty('No labor recorded.');
    else {
      const T = m.tot;
      // One table: phase rows, task rows, one subtotal per phase, one grand total.
      const head = ['Task', 'Logged hrs', ...(client ? [] : ['Rate']), 'Current billable', ...(proj ? ['Remaining est. hrs', 'Projected add\'l'] : []), 'Classification'];
      const nc = head.length, body = [], marks = {};
      const money = (v) => (v ? usd(v) : '—');
      for (const ph of m.phases) {
        marks[body.length] = 'phase'; body.push([{ content: ph.name.toUpperCase(), colSpan: nc }]);
        for (const t of [...ph.groups.flatMap((g) => g.rows), ...ph.other.flatMap((g) => g.rows.map((r) => ({ ...r, _lbl: g.title })))]) {
          const b = isBill(t);
          body.push([t.name, hrs(t.logged), ...(client ? [] : [b && t.effective_rate != null ? `${usd(t.effective_rate)}/h` : '']), b ? money(t.billable_to_date) : '—', ...(proj ? [b ? hrs(t.remaining_hours) : '—', b ? money(t.projected_remaining) : '—'] : []), b ? '' : t._lbl + (t.service_commitment_id ? ` — ${m.other.svc(t)}` : '')]);
        }
        const extra = [ph.nbH && `No Charge ${hrs(ph.nbH)}`, ph.incH && `Incl. in Service ${hrs(ph.incH)}`, !client && ph.uncH && `Unclassified ${hrs(ph.uncH)}`, proj && ph.pa && `Proj. total ${usd(ph.pt)}`].filter(Boolean).join(' · ');
        marks[body.length] = 'sub';
        body.push([`${ph.name} subtotal`, ph.h === ph.allH ? hrs(ph.allH) : `${hrs(ph.allH)} (${hrs(ph.h)} billable)`, ...(client ? [] : ['']), usd(ph.b), ...(proj ? [hrs(ph.rh), usd(ph.pa)] : []), extra]);
      }
      marks[body.length] = 'grand';
      body.push(['PROJECT LABOR GRAND TOTAL', `${hrs(T.laborHours)} billable`, ...(client ? [] : ['']), usd(T.laborToDate), ...(proj ? [hrs(T.laborRemHours), usd(T.laborProjected)] : []), proj ? `Proj. total ${usd(r2(T.laborToDate + T.laborProjected))}` : '']);
      const R = client ? (proj ? [1, 2, 3, 4] : [1, 2]) : (proj ? [1, 2, 3, 4, 5] : [1, 2, 3]);
      table(head, body, { right: R, marks, widths: { 0: client ? 230 : 280, [nc - 1]: client ? 150 : 170 } });
      note('Only Billable labor is valued (not yet invoiced). No Charge, Included in Service' + (client ? '' : ', unclassified') + ' hours carry no additional billing. Projected amounts are estimates.' + (client ? '' : ' Internal labor cost not configured.'));
    }
  }

  if (S.includes('invoices')) {
    const list = o.invoice_list || [];
    heading('Invoices', list.length <= 12 ? 30 + list.length * 17 : 60);
    if (!list.length) empty('No invoices recorded.');
    else table(['Invoice', 'Type', 'Status', 'Issue date', 'Total', 'Paid', 'Balance due'], list.map((i) => [i.number || i.id.slice(-6), i.type || '', i.status, i.issue_date || '', usd(i.total), usd(i.paid), i.balance_due == null ? '—' : usd(i.balance_due)]), { right: [4, 5, 6] });
  }

  // Final reconciliation
  heading('Financial Reconciliation', 190); // keep reconciliation + invoice position + note together
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
    cols.push({ h: 'Row Type', k: 'rt', w: 16 }, { h: 'Service', k: 'sv', w: 30, wrap: true }, { h: 'Component Qty / Hrs', k: 'cq', f: QTY });
    if (!client) cols.push({ h: 'Component Est. Cost (info)', k: 'cc', f: MONEY });
    cols.push({ h: client ? 'Component Billable (included in service)' : 'Component Billable (info)', k: 'cb', f: MONEY });
    const svcRows = [];
    for (const s of m.services) {
      svcRows.push({ d: s.description || '—', q: 1, ...(client ? {} : { ec: s.est_cost ?? 'Missing', ac: s.actual_cost ?? 'Not recorded' }), rt: 'Service', sv: s.description || '—', b: s.billable, da: s.allocated ? s.draft_amount : null, s: svcStatus(s), el: !s.invoiced && !s.allocated ? 'Yes' : 'No' });
      if (client) {
        const cb = clientBreakdown(o, s);
        if (cb) cb.rows.forEach((r) => svcRows.push({ d: `   ${r.t}: ${r.d}`, rt: 'Component (included)', sv: s.description || '—', cq: r.q, cb: r.b }));
        continue;
      }
      const bd = svcBreakdown(o, s);
      if (!bd) continue;
      bd.rows.forEach((r) => svcRows.push({ d: `   ${r.t}: ${r.d}`, rt: 'Component (info)', sv: s.description || '—', cq: r.q, cc: r.c, cb: r.b }));
      if (bd.dc || bd.db) svcRows.push({ d: '   Difference: service total − components', rt: 'Difference', sv: s.description || '—', cc: bd.dc, cb: bd.db });
    }
    sheet('Services', cols, svcRows,
      { d: 'Services subtotal', q: T.svcQty, ...(client ? {} : { ec: T.svcEst, ac: T.svcAct ?? (T.svcActPartial ? `Partial: ${usd(T.svcActPartial)}` : 'Not recorded') }), b: T.services, da: T.svcDraft }, 'No services recorded.');
  }
  if (S.includes('labor')) {
    const cols = [{ h: 'Phase', k: 'ph', w: 22 }, { h: 'Row Type', k: 'rt', w: 12 }, { h: 'Task', k: 'd', w: 46, wrap: true }, { h: 'Logged Hours', k: 'lh', f: HRS }, { h: 'Billable Logged Hours', k: 'h', f: HRS }];
    if (!client) cols.push({ h: 'Approved Rate', k: 'r', f: MONEY });
    cols.push({ h: 'Current Billable', k: 'b', f: MONEY });
    if (proj) cols.push({ h: 'Remaining Est. Hours', k: 'rh', f: HRS }, { h: 'Projected Additional Billing', k: 'pa', f: MONEY });
    cols.push({ h: 'Classification', k: 's', w: 30, wrap: true });
    const ws = wb.addWorksheet('Labor', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: c.h, key: c.k, width: c.w || 14, style: { ...(c.f ? { numFmt: c.f } : {}), alignment: { wrapText: !!c.wrap, vertical: 'top', ...(c.f ? { horizontal: 'right' } : {}) } } }));
    const hr = ws.getRow(1); hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }; hr.fill = fill('FF1F2937'); hr.alignment = { wrapText: true, vertical: 'middle' }; hr.height = 30;
    if (!m.labor.length && !m.other.groups.length) ws.addRow({ d: 'No labor recorded.' }).font = { italic: true, color: { argb: 'FF6B7280' } };
    else {
      // One row per task; Row Type = Task | Phase subtotal | Grand total, so filtering on Task rows cannot double-count.
      for (const ph of m.phases) {
        const tasks = [...ph.groups.flatMap((g) => g.rows), ...ph.other.flatMap((g) => g.rows.map((r) => ({ ...r, _lbl: g.title })))];
        for (const t of tasks) {
          const b = isBill(t);
          ws.addRow({ ph: ph.name, rt: 'Task', d: t.name, lh: t.logged || 0, h: b ? t.logged || 0 : 0, r: b ? t.effective_rate : null, b: b ? t.billable_to_date : null, rh: b ? t.remaining_hours : null, pa: b ? t.projected_remaining : null, s: b ? 'Billable' : t._lbl + (t.service_commitment_id ? ` — ${m.other.svc(t)}` : '') });
        }
        const extra = [ph.nbH && `No Charge ${ph.nbH} h`, ph.incH && `Included in Service ${ph.incH} h`, !client && ph.uncH && `Unclassified ${ph.uncH} h`].filter(Boolean).join(' · ');
        styleRow(ws.addRow({ ph: ph.name, rt: 'Phase subtotal', d: `${ph.name} subtotal`, lh: ph.allH, h: ph.h, b: ph.b, ...(proj ? { rh: ph.rh, pa: ph.pa } : {}), s: extra }), 'sub');
      }
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: cols.length } };
      styleRow(ws.addRow({ rt: 'Grand total', d: 'PROJECT LABOR GRAND TOTAL', h: T.laborHours, b: T.laborToDate, ...(proj ? { rh: T.laborRemHours, pa: T.laborProjected, s: `Projected total labor ${usd(r2(T.laborToDate + T.laborProjected))}` } : {}) }), 'grand');
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

    // Internal only: explanatory service components (read-only ServiceLineItem records; parent stays authoritative).
    o.svc_components = {};
    if (sections.includes('services') && o.lines.services.length) {
      const items = await base44.entities.ServiceLineItem.filter({ service_commitment_id: { $in: o.lines.services.map((s) => s.id) } }, 'sort_order', 1000);
      for (const li of items) (o.svc_components[li.service_commitment_id] ||= []).push(li);
    }
    // Read-only phase lookup (same source/order as Project Workload).
    const [buckets, ptasks] = await Promise.all([
      base44.entities.ProjectKanbanBucket.filter({ project_id }, 'order', 500),
      base44.entities.Task.filter({ project_id }, null, 5000),
    ]);
    buckets.sort((a, b) => (a.order || 0) - (b.order || 0));
    const bucketIds = new Set(buckets.map((b) => b.id));
    o.phases = buckets.map((b) => ({ id: b.id, name: b.name || 'Unnamed phase' }));
    o.task_phase = Object.fromEntries(ptasks.map((t) => [t.id, bucketIds.has(t.kanban_bucket_id) ? t.kanban_bucket_id : null]));
    const opts = { report_type, sections, include_projected: !!include_projected };
    const bytes = format === 'pdf' ? buildPdf(o, opts) : await buildXlsx(o, opts);
    const safe = (o.project_name || 'project').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    const filename = `${safe}_${report_type === 'client' ? 'Billing_Detail' : 'Internal_Financials'}_${o.generated_at.slice(0, 10)}.${format}`;
    const { tot, laborGroups, other, phases } = buildModel(o, report_type === 'client');
    const check = { total_current_billable: o.summary.total_current_billable, total_projected_billable: o.summary.total_projected_billable, parts: tot.parts, parts_rows: tot.partsRows, services: tot.services, services_rows: tot.servicesRows, qty: [tot.qReq, tot.qFin, tot.qDraft, tot.qAvail], labor: [tot.laborHours, tot.laborRowsHours, tot.laborToDate, tot.laborRowsToDate, tot.laborRemHours, tot.laborRowsRemHours, tot.laborProjected, tot.laborRowsProjected], drafts: [tot.partsDraft, tot.svcDraft, o.summary.allocated_to_drafts],
      phase_check: { phases: phases.map((p) => ({ name: p.name, tasks: p.n, h: p.h, b: p.b, rh: p.rh, pa: p.pa, pt: p.pt, allH: p.allH, nbH: p.nbH, incH: p.incH, uncH: p.uncH })), sum_h: sum(phases, (p) => p.h), sum_b: sum(phases, (p) => p.b), sum_rh: sum(phases, (p) => p.rh), sum_pa: sum(phases, (p) => p.pa), sum_pt: sum(phases, (p) => p.pt), task_rows: phases.reduce((n, p) => n + p.n, 0), model_tasks: laborGroups.reduce((n, g) => n + g.rows.length, 0) + other.groups.reduce((n, g) => n + g.rows.length, 0) },
      // Internal-only review flags (never rendered in client files)
      service_review: o.lines.services.map((s) => { const cb = clientBreakdown(o, s); return cb && { service: s.description, components: cb.rows.length, component_billable: sum(cb.rows, (r) => r.b), parent_billable: s.billable, unreconciled: cb.db, long_descriptions: cb.rows.filter((r) => r.long).length, needs_admin_review: cb.rows.filter((r) => NEEDS_REVIEW.test(r.d)).map((r) => r.d) }; }).filter(Boolean) };
    check.labor_groups = laborGroups.map((g) => ({ title: g.title, tasks: g.rows.map((t) => t.task_id || t.id || t.name), h: g.h, b: g.b, rh: g.rh, pa: g.pa }));
    check.other_groups = other.groups.map((g) => ({ title: g.title, tasks: g.rows.map((t) => t.id || t.name), h: g.h, rh: g.rh }));
    check.all_logged = sum(o.labor_billing.tasks, (t) => t.logged);
    if (report_type === 'internal') check.est_cost = [o.summary.estimated_cost, o.summary.estimated_gross_profit];
    return Response.json({ success: true, filename, file_base64: b64(bytes), generated_at: o.generated_at, check });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});