import { renderQRSVGString } from "./QRCodeSVG";
import { renderBarcodeSVGString } from "./Code128SVG";

/**
 * US Letter portrait: two full-width (8 × 3 in) labels per page, one per row.
 * Fixed inch dimensions so output matches print at 100% scale.
 */
export function buildLetterLabelSheet(labels, batchCode, escapeHtml) {
  const renderLabel = (c) => {
    const code = escapeHtml(c.short_code);
    const type = escapeHtml((c.container_type || 'box').toUpperCase());
    return `<section class="label">
      <div class="top">
        <div class="qr">${renderQRSVGString(c.qr_code_value, 300)}</div>
        <div class="ident">
          <header><span>ÄCHTUNG KRAFT &nbsp;|&nbsp; STORAGE</span><span>${type}</span></header>
          <div class="number">${code}</div>
          <div class="scan">SCAN TO DOCUMENT CONTENTS</div>
          <div class="barcode">${renderBarcodeSVGString(c.short_code, 300, 36)}</div>
          <div class="meta">${escapeHtml(batchCode)}</div>
        </div>
      </div>
      <div class="write">
        <div class="field"><b>CLIENT:</b><span></span></div>
        <div class="field"><b>PROJECT:</b><span></span></div>
      </div>
    </section>`;
  };

  const pages = [];
  for (let i = 0; i < labels.length; i += 2) {
    pages.push(`<div class="page">${labels.slice(i, i + 2).map(renderLabel).join('')}</div>`);
  }

  const css = `
    @page{size:letter portrait;margin:.25in}
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{width:8in;display:flex;flex-direction:column;gap:.3in;break-after:page;page-break-after:always}
    .page:last-child{break-after:auto;page-break-after:auto}
    .label{width:8in;height:3in;border:1px solid #888;display:flex;flex-direction:column;overflow:hidden;break-inside:avoid;page-break-inside:avoid}
    .top{flex:1;display:flex;min-height:0}
    .qr{width:1.95in;height:1.95in;flex-shrink:0;padding:.08in;background:#fff}
    .qr svg{width:100%;height:100%;display:block}
    .ident{flex:1;min-width:0;padding:.08in .16in;display:flex;flex-direction:column;border-left:1px solid #ccc}
    header{display:flex;justify-content:space-between;font-size:11pt;font-weight:700;letter-spacing:.8px;border-bottom:1px solid #999;padding-bottom:.04in}
    .number{font-size:34pt;font-weight:900;line-height:1.05;margin-top:.06in;white-space:nowrap;overflow:hidden;text-overflow:clip}
    .scan{font-size:10pt;font-weight:700;letter-spacing:.5px;margin-top:.04in}
    .barcode{margin-top:auto}
    .barcode svg{width:3.4in;height:.32in;display:block}
    .meta{font-size:7pt;font-family:monospace;color:#444;text-align:right}
    .write{height:.95in;flex-shrink:0;background:#fff;border-top:1px solid #888;padding:.06in .16in;display:flex;flex-direction:column;justify-content:space-around}
    .field{display:flex;align-items:flex-end;gap:.1in;font-size:12pt}
    .field b{width:.95in;flex-shrink:0}
    .field span{flex:1;border-bottom:1px solid #000;height:.3in}
    @media screen{body{background:#eee;padding:12px}.page{margin:0 auto 24px}.label{background:#fff}}
  `;
  return { css, body: pages.join('') };
}