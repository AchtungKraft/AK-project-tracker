import { renderQRSVGString } from "./QRCodeSVG";
import { getContainerTypeConfig } from "./containerTypeConfig";

/**
 * Generate and print a container QR label optimized for shop use.
 * Large name, container number, type, home location, large QR code.
 * Designed to be readable from several feet away.
 */
export function printContainerQRLabel(container, { locations = [] } = {}) {
  const qrValue = container.qr_code_value;
  if (!qrValue) return;

  const tc = getContainerTypeConfig(container.container_type);
  const homeLoc = container.home_location_id
    ? locations.find(l => l.id === container.home_location_id)
    : null;
  const currentLoc = container.location_id
    ? locations.find(l => l.id === container.location_id)
    : null;

  const qrSvg = renderQRSVGString(qrValue, 200);

  const html = `<!DOCTYPE html>
<html><head><title>Container Label</title>
<style>
  @page { size: 4in 3in; margin: 0.15in; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; padding: 10px; }
  .label { display: flex; gap: 16px; align-items: flex-start; height: 100%; }
  .qr { flex-shrink: 0; padding-top: 4px; }
  .info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
  .icon { font-size: 20px; margin-bottom: 2px; }
  .name { font-size: 22px; font-weight: 900; line-height: 1.15; letter-spacing: -0.3px; }
  .number { font-size: 28px; font-weight: 900; font-family: 'Courier New', monospace; margin: 4px 0; }
  .type { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
  .home { font-size: 11px; color: #666; margin-top: 4px; }
  .home-label { font-weight: 600; color: #444; }
  .qr-id { font-size: 7px; color: #bbb; font-family: monospace; margin-top: auto; word-break: break-all; }
</style>
</head><body>
<div class="label">
  <div class="qr">${qrSvg}</div>
  <div class="info">
    <div class="icon">📦</div>
    <div class="name">${container.name}</div>
    ${container.short_code ? `<div class="number">${container.short_code}</div>` : ''}
    <div class="type">${tc.label}</div>
    ${homeLoc ? `<div class="home"><span class="home-label">Home:</span> ${homeLoc.location_area}</div>` : ''}
    <div class="qr-id">${qrValue}</div>
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