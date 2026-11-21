import { useMemo } from "react";
import { renderQRSVGString } from "../QRCodeSVG";
import { toteQrPayload } from "@/lib/toteQrUrl";
import { inkFor, normalizeHex, PANEL_MIN_CONTRAST, QR_MIN_CONTRAST } from "./labelColors";

/** Mini label sample using the same color rules as the print renderer. */
export default function StickerCategoryPreview({ name, color }) {
  const hex = normalizeHex(color) || '#6b7280';
  const panel = inkFor(hex, PANEL_MIN_CONTRAST);
  const qrInk = inkFor(hex, QR_MIN_CONTRAST);
  const qr = useMemo(() => renderQRSVGString(toteQrPayload('AK_CTR:000000000000000000000000'), 160, qrInk), [qrInk]);
  return (
    <div className="rounded-md overflow-hidden border-2 bg-white text-white" style={{ borderColor: panel }}>
      <div className="px-3 py-1 text-xs font-bold tracking-wider truncate" style={{ backgroundColor: panel }}>
        ÄCHTUNG KRAFT | STORAGE — {(name || 'CATEGORY').toUpperCase()}
      </div>
      <div className="flex">
        <div className="w-24 h-24 p-1 bg-white shrink-0 [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="flex-1 min-w-0 p-2 flex flex-col justify-center gap-1" style={{ backgroundColor: panel }}>
          <div className="font-black uppercase leading-tight truncate">Sample Tote</div>
          <div className="self-start bg-white font-mono font-black text-sm px-1.5 rounded-sm" style={{ color: panel }}>TOTE-SAMPLE-001</div>
          <div className="text-[9px] font-bold tracking-wide">SCAN TO DOCUMENT CONTENTS</div>
        </div>
      </div>
      {(panel !== hex || qrInk !== hex) && (
        <p className="text-[11px] text-gray-600 px-2 py-1 bg-gray-100">Light color: print uses a darker shade for readable text and QR scanning.</p>
      )}
    </div>
  );
}