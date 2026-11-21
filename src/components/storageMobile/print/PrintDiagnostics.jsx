import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STICKER_PRINT_VERSION } from "@/lib/stickerPdf";

/**
 * Temporary print diagnostic: identifies the exact PDF handed to Print / Share and lets it be
 * saved byte-for-byte (same File object, never regenerated). Read-only; changes no records.
 */
export default function PrintDiagnostics({ pdf, lastPath, onSave }) {
  const f = pdf.file;
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-2 text-xs text-gray-400">
      <p className="font-semibold text-gray-300">Print check</p>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 font-mono">
        <dt>Version</dt><dd className="text-gray-200">{STICKER_PRINT_VERSION}</dd>
        <dt>Document</dt><dd className="text-gray-200">{f ? `${f.type} · ${f.size.toLocaleString()} bytes` : '…'}</dd>
        <dt>File</dt><dd className="text-gray-200 break-all">{f?.name || '…'}</dd>
        <dt>Fingerprint</dt><dd className="text-gray-200">{pdf.fingerprint || '…'}</dd>
        <dt>Last sent as</dt><dd className="text-gray-200">{lastPath || 'not yet'}</dd>
      </dl>
      <Button variant="outline" onClick={onSave} disabled={!f} className="w-full h-11 gap-2">
        <Download className="w-4 h-4" /> Save this exact PDF
      </Button>
    </div>
  );
}