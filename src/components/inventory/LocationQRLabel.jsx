import React, { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Printer, QrCode } from "lucide-react";
import { getLocationTypeConfig, buildLocationPathString } from "./locationTypeConfig";

/**
 * LocationQRLabel — generates a printable label with a QR code for a location.
 * Uses a simple table-based QR from a public API (no extra npm dependency).
 * The QR encodes the location's qr_code_value or falls back to location ID.
 */
export default function LocationQRLabel({ location, locations, compact = false }) {
  const qrValue = location.qr_code_value || `LOC:${location.id}`;
  const tc = getLocationTypeConfig(location.location_type);
  const breadcrumb = buildLocationPathString(location.id, locations);

  const handlePrint = useCallback(() => {
    // QR image from a public chart API — no npm dependency needed
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrValue)}`;

    const html = `<!DOCTYPE html>
<html><head><title>Location Label</title>
<style>
  @page { size: 4in 2in; margin: 0.15in; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 8px; }
  .label { display: flex; gap: 12px; align-items: flex-start; }
  .qr img { width: 120px; height: 120px; }
  .info { flex: 1; }
  .name { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
  .type { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .code { font-size: 24px; font-weight: bold; font-family: monospace; margin: 6px 0; }
  .path { font-size: 10px; color: #999; margin-top: 4px; word-break: break-word; }
  .qr-text { font-size: 8px; color: #aaa; font-family: monospace; margin-top: 4px; word-break: break-all; }
</style></head>
<body>
<div class="label">
  <div class="qr"><img src="${qrUrl}" alt="QR" /></div>
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
  }, [location, qrValue, tc.label, breadcrumb]);

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