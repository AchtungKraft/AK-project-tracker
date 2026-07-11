import React, { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Printer, QrCode } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getLocationTypeConfig, buildLocationPathString } from "./locationTypeConfig";
import { renderQRSVGString } from "./QRCodeSVG";

/**
 * LocationQRLabel — generates a printable label with a locally-generated QR code.
 * No external APIs. QR value is persisted to the Location record if not already set.
 */
export default function LocationQRLabel({ location, locations, compact = false }) {
  const tc = getLocationTypeConfig(location.location_type);
  const breadcrumb = buildLocationPathString(location.id, locations);

  const handlePrint = useCallback(async () => {
    // Ensure stable QR value is persisted
    let qrValue = location.qr_code_value;
    if (!qrValue) {
      qrValue = `AK_LOCATION:${location.id}`;
      // Persist to entity — fire and forget, don't block print
      base44.entities.Location.update(location.id, { qr_code_value: qrValue }).catch(() => {});
    }

    const qrSvg = renderQRSVGString(qrValue, 140);

    const html = `<!DOCTYPE html>
<html><head><title>Location Label</title>
<style>
  @page { size: 4in 2in; margin: 0.15in; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 8px; }
  .label { display: flex; gap: 12px; align-items: flex-start; }
  .qr { flex-shrink: 0; }
  .info { flex: 1; }
  .name { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
  .type { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .code { font-size: 24px; font-weight: bold; font-family: monospace; margin: 6px 0; }
  .path { font-size: 10px; color: #999; margin-top: 4px; word-break: break-word; }
  .qr-text { font-size: 8px; color: #aaa; font-family: monospace; margin-top: 4px; word-break: break-all; }
</style></head>
<body>
<div class="label">
  <div class="qr">${qrSvg}</div>
  <div class="info">
    <div class="name">${location.location_area}</div>
    <div class="type">${tc.label}</div>
    ${location.short_code ? `<div class="code">${location.short_code}</div>` : ''}
    <div class="path">${breadcrumb}</div>
    <div class="qr-text">${qrValue}</div>
  </div>
</div>
</body></html>`;

    const w = window.open('', '_blank', 'width=500,height=300');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.onload = () => {
      w.print();
      w.onafterprint = () => w.close();
    };
  }, [location, tc.label, breadcrumb]);

  if (compact) {
    return (
      <Button size="sm" variant="ghost" onClick={handlePrint} className="h-7 px-2 text-gray-400 hover:text-white gap-1">
        <QrCode className="w-3.5 h-3.5" />
        <span className="text-xs">QR</span>
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2 border-gray-700 text-gray-300">
      <Printer className="w-4 h-4" />
      Print QR Label
    </Button>
  );
}