import { renderQRSVGString } from "./QRCodeSVG";
import { renderBarcodeSVGString } from "./Code128SVG";

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]
  ));
}

/**
 * Print previously reserved, canonical AK_CTR entity identities.
 * Does NOT allocate identifiers and does not mark print success (browser printing cannot be confirmed).
 * sheet = 4x3 thermal or US-letter grid. Uses native print only.
 */
export function printStorageLabelBatch(labels, { format = 'thermal', batchCode = '' } = {}) {
  if (!Array.isArray(labels) || labels.length === 0) return false;
  const valid = labels.every(c => /^AK_CTR:[a-f0-9]{24}$/i.test(c.qr_code_value || '') && c.short_code);
  if (!valid) throw new Error('Some labels have not been assigned permanent QR identities');

  const sheet = format === 'letter';
  const pages = labels.map((c) => {
    const code = escapeHtml(c.short_code);
    const type = escapeHtml(c.container_type || 'box');
    return `<section class="label">
      <header>ÄCHTUNG KRAFT &nbsp; | &nbsp; STORAGE</header>
      <div class="main">
        <div class="qr">${renderQRSVGString(c.qr_code_value, 155)}</div>
        <div class="content">
          <div class="number">${code}</div>
          <div class="type">${type.toUpperCase()}</div>
          <p>SCAN TO DOCUMENT CONTENTS</p>
          <div class="line">Client: ______________________</div>
          <div class="line">Project: _____________________</div>
        </div>
      </div>
      <div class="barcode">${renderBarcodeSVGString(c.short_code, 246, 36)}</div>
      <footer><span>${code}</span><span>${escapeHtml(batchCode)}</span></footer>
    </section>`;
  }).join('');

  const css = `
    @page {size: ${sheet ? 'letter' : '4in 3in'}; margin: ${sheet ? '.28in' : '.08in'};}
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;background:#fff}
    main{${sheet ? 'display:grid;grid-template-columns:1fr 1fr;gap:.12in;' : ''}}
    .label{border:1px solid #ccc;padding:9px;width:100%;height:${sheet ? '3.1in' : '2.8in'};overflow:hidden;break-inside:avoid;page-break-inside:avoid}
    ${sheet ? '.label{font-size:90%}' : '.label{break-after:page;page-break-after:always} .label:last-child{break-after:auto;page-break-after:auto}'}
    header{font-size:11px;font-weight:bold;letter-spacing:.8px;border-bottom:1px solid #999;padding-bottom:4px}
    .main{display:flex;align-items:center;gap:8px;padding-top:6px}
    .qr{width:155px;flex-shrink:0}
    .qr svg{width:100%;height:auto;display:block}
    .content{min-width:0;flex:1}
    .number{font-size:19px;font-weight:900;overflow-wrap:anywhere}
    .type{font-size:11px;font-weight:700;text-transform:uppercase;margin-top:4px}
    p{font-size:9px;font-weight:bold;margin:6px 0}
    .line{font-size:10px;margin-top:7px}
    .barcode{margin:2px auto 0;text-align:center}
    .barcode svg{max-width:90%;height:29px}
    footer{font-size:8px;font-family:monospace;display:flex;justify-content:space-between}
    @media screen{body{background:#eee;padding:12px}.label{background:white;margin:0 auto 10px;max-width:4in}}
  `;
  const w = window.open('','_blank','width=800,height=720');
  if (!w) return false;
  w.document.open();
  w.document.write(`<!doctype html><html><head><title>AK Storage Labels</title><meta charset="utf-8"><style>${css}</style></head><body><main>${pages}</main></body></html>`);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
  return true;
}
