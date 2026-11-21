import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import QRScanner from "@/components/inventory/QRScanner";
import { storageMobile, toteUrl, findUrl } from "@/lib/storageMobileApi";
import ReservedLabelActivation from "./ReservedLabelActivation";

/**
 * Full-screen tote scanner. Accepts new browser links, existing AK_CTR labels and
 * location QR codes; the server resolves every code. act: capture | move | undefined.
 */
export default function ToteScanner({ act, onClose }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState('scan'); // scan | resolving | reserved | error
  const [message, setMessage] = useState('');
  const [label, setLabel] = useState(null);

  const handleScan = useCallback(async (text) => {
    setMode('resolving');
    try {
      const r = await storageMobile('resolve', { code: text });
      if (r.kind === 'container') { navigate(toteUrl(r.container_id, act)); onClose(); return; }
      if (r.kind === 'reserved') { setLabel(r.label); setMode('reserved'); return; }
      setMessage(`That is a location code (${r.location_name}). Scan the label on the tote.`);
    } catch (e) {
      setMessage(e.message);
    }
    setMode('error');
  }, [act, navigate, onClose]);

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      {mode === 'scan' && <QRScanner onScan={handleScan} onClose={onClose} className="h-full" />}
      {mode === 'resolving' && (
        <div className="flex-1 flex items-center justify-center gap-2 text-gray-300"><Loader2 className="w-5 h-5 animate-spin" /> Opening tote…</div>
      )}
      {mode === 'reserved' && label && (
        <ReservedLabelActivation label={label} onCancel={() => setMode('scan')}
          onActivated={(c) => { navigate(toteUrl(c.id, act)); onClose(); }} />
      )}
      {mode === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
          <p className="text-white text-base">{message}</p>
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <Button className="h-12 text-base" onClick={() => setMode('scan')}>Scan again</Button>
            <Button variant="outline" className="h-12 text-base" onClick={() => { navigate(findUrl(act)); onClose(); }}>Search instead</Button>
            <Button variant="ghost" className="h-11" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}