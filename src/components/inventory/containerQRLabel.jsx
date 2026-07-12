import { renderQRSVGString } from "./QRCodeSVG";
import { renderBarcodeSVGString } from "./Code128SVG";
import { getContainerTypeConfig } from "./containerTypeConfig";

/**
 * Generate and print a container label with both QR code and Code 128 barcode.
 * Both reference the same container identifier.
 * Designed for 4×3" thermal labels and standard paper printing.
 */
export function printContainerQRLabel(container, { locations = [] } = {}) {
  const qrValue = container.qr_code_value;
  if (!qrValue) return;

  const tc = getContainerTypeConfig(container.container_type);
  const homeLoc = container.home_location_id
    ? locations.find(l => l.id === container.home_location_id)
    : null;

  const barcodeValue = container.short_code || qrValue;
  const qrSvg = renderQRSVGString(qrValue, 160);
  const barcodeSvg = renderBarcodeSVGString(barcodeValue, 240, 45);

  const notesLine = container.notes
    ? `<div class="notes">⚠ ${container.notes}</div>`
    : '';

  const html = `<!DOCTYPE html>
<html><head><title>Container Label</title>
<style>
  @page { size: 4in 3in; margin: 0.1in; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; padding: 8px; }
  .label { display: flex; flex-direction: column; height: 100%; }
  .top { display: flex; gap: 12px; align-items: flex-start; }
  .codes { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .name { font-size: 20px; font-weight: 900; line-height: 1.15; letter-spacing: -0.3px; word-break: break-word; }
  .number { font-size: 26px; font-weight: 900; font-family: 'Courier New', monospace; margin: 2px 0; }
  .type { font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
  .home { font-size: 10px; color: #666; margin-top: 2px; }
  .home-label { font-weight: 700; color: #333; }
  .notes { font-size: 10px; color: #333; font-weight: 600; margin-top: 4px; padding: 3px 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 3px; }
  .barcode-label { font-size: 7px; color: #999; font-family: monospace; text-align: center; margin-top: 1px; }
  .qr-id { font-size: 6px; color: #ccc; font-family: monospace; margin-top: auto; word-break: break-all; }
</style>
</head><body>
<div class="label">
  <div class="top">
    <div class="codes">
      ${qrSvg}
      ${barcodeSvg}
      <div class="barcode-label">${barcodeValue}</div>
    </div>
    <div class="info">
      <div class="name">${container.name}</div>
      ${container.short_code ? `<div class="number">${container.short_code}</div>` : ''}
      <div class="type">${tc.label}</div>
      ${homeLoc ? `<div class="home"><span class="home-label">Home:</span> ${homeLoc.location_area}</div>` : ''}
      ${notesLine}
      <div class="qr-id">${qrValue}</div>
    </div>
  </div>
</div>
</body></html>`;

  const w = window.open('', '_blank', 'width=500,height=400');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.print(); w.onafterprint = () => w.close(); };
  }
}