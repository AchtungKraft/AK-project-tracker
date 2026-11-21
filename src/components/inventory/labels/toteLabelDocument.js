import { renderQRSVGString } from "../QRCodeSVG";
import { inkFor, PANEL_MIN_CONTRAST, QR_MIN_CONTRAST } from "./labelColors";

/**
 * Canonical Tote Label V2 renderer (US Letter, portrait).
 * One 8 × 3.25 in label per row, three per page. Used by single-container and batch printing,
 * and by the on-screen preview (same document), so preview and print are identical.
 * The QR payload is the container's existing qr_code_value, unchanged.
 */
export const LABELS_PER_PAGE = 3;
export const QR_RENDER_SIZE = 480;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// Uppercase headline sized so long names wrap to at most two/three lines inside the panel.
export function nameFontPt(name) {
  const n = name.length;
  return n <= 14 ? 42 : n <= 17 ? 36 : n <= 21 ? 30 : n <= 42 ? 27 : n <= 54 ? 22 : 17;
}

export function renderToteLabel(label) {
  const panel = inkFor(label.category.color, PANEL_MIN_CONTRAST);
  const qrInk = inkFor(label.category.color, QR_MIN_CONTRAST);
  const name = String(label.name || '').trim();
  const headline = name
    ? `<div class="name" style="font-size:${nameFontPt(name)}pt">${esc(name)}</div>`
    : `<div class="name-blank"><b>NAME:</b><span></span></div>`;
  return `<section class="tl" style="--panel:${panel}">
    <header>ÄCHTUNG KRAFT &nbsp;|&nbsp; STORAGE — ${esc(label.category.name.toUpperCase())}</header>
    <div class="body">
      <div class="qr">${renderQRSVGString(label.qr_code_value, QR_RENDER_SIZE, qrInk)}</div>
      <div class="ident">
        ${headline}
        <div class="number">${esc(label.short_code)}</div>
        <div class="scan">SCAN TO DOCUMENT CONTENTS</div>
      </div>
    </div>
    <div class="write">
      <div class="field"><b>CLIENT:</b><span></span></div>
      <div class="field"><b>PROJECT:</b><span></span></div>
    </div>
  </section>`;
}

export const TOTE_LABEL_CSS = `
  @page{size:letter portrait;margin:.25in}
  *{box-sizing:border-box}
  html,body{margin:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{width:8in;display:flex;flex-direction:column;gap:.3in;break-after:page;page-break-after:always}
  .sheet:last-child{break-after:auto;page-break-after:auto}
  .tl{width:8in;height:3.25in;flex:none;display:flex;flex-direction:column;border:1.5px solid var(--panel);overflow:hidden;break-inside:avoid;page-break-inside:avoid}
  .tl header{height:.36in;flex:none;background:var(--panel);color:#fff;font-weight:700;font-size:12pt;letter-spacing:1px;display:flex;align-items:center;padding:0 .16in;white-space:nowrap;overflow:hidden}
  .tl .body{flex:1;min-height:0;display:flex}
  .tl .qr{width:2in;flex:none;background:#fff;padding:.04in;display:flex;align-items:center;justify-content:center}
  .tl .qr svg{width:1.88in;height:1.88in;display:block}
  .tl .ident{flex:1;min-width:0;background:var(--panel);color:#fff;padding:.08in .18in;display:flex;flex-direction:column;justify-content:center;gap:.06in;overflow:hidden}
  .tl .name{font-weight:900;line-height:1.05;text-transform:uppercase;overflow-wrap:anywhere}
  .tl .name-blank{display:flex;align-items:flex-end;gap:.1in;font-size:14pt}
  .tl .name-blank span{flex:1;height:.36in;border-bottom:2px solid #fff}
  .tl .number{align-self:flex-start;max-width:100%;background:#fff;color:var(--panel);font-family:'Courier New',monospace;font-weight:900;font-size:26pt;line-height:1;padding:.05in .12in;border-radius:3px;white-space:nowrap;overflow:hidden}
  .tl .scan{font-size:9pt;font-weight:700;letter-spacing:.8px}
  .tl .write{height:.9in;flex:none;background:#fff;border-top:1.5px solid var(--panel);padding:.04in .18in .1in;display:flex;flex-direction:column;justify-content:space-around}
  .tl .field{display:flex;align-items:flex-end;gap:.1in;font-size:12pt}
  .tl .field b{width:.95in;flex:none}
  .tl .field span{flex:1;height:.3in;border-bottom:1px solid #000}
  @media screen{
    body{background:#d1d5db;padding:.2in 0}
    .sheet{width:8.5in;height:11in;padding:.25in;background:#fff;margin:0 auto .2in;box-shadow:0 1px 6px rgba(0,0,0,.25)}
  }
`;

export function paginate(labels) {
  const pages = [];
  for (let i = 0; i < labels.length; i += LABELS_PER_PAGE) pages.push(labels.slice(i, i + LABELS_PER_PAGE));
  return pages;
}

export function buildToteLabelDocument(labels) {
  const body = paginate(labels).map(p => `<div class="sheet">${p.map(renderToteLabel).join('')}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>AK Tote Labels</title><style>${TOTE_LABEL_CSS}</style></head><body>${body}</body></html>`;
}

export function printToteLabels(labels) {
  const missing = labels.filter(l => !l.qr_code_value || !l.short_code);
  if (!labels.length || missing.length) throw new Error('Every label needs a permanent tote number and QR identity');
  const w = window.open('', '_blank', 'width=900,height=900');
  if (!w) return false;
  w.document.open();
  w.document.write(buildToteLabelDocument(labels));
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
  return true;
}