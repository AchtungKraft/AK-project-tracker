import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import StorageGate from "@/components/storageMobile/StorageGate";
import ReservedLabelActivation from "@/components/storageMobile/ReservedLabelActivation";
import { storageMobile, toteUrl } from "@/lib/storageMobileApi";

function Resolve() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ mode: 'loading' });
  useEffect(() => {
    storageMobile('resolve', { code: token })
      .then((r) => {
        if (r.kind === 'container') navigate(toteUrl(r.container_id), { replace: true });
        else if (r.kind === 'reserved') setState({ mode: 'reserved', label: r.label });
        else setState({ mode: 'error', message: 'This code is not a tote label.' });
      })
      .catch((e) => setState({ mode: 'error', message: e.message }));
  }, [token, navigate]);

  if (state.mode === 'reserved') {
    return <ReservedLabelActivation label={state.label} onCancel={() => navigate('/storage')}
      onActivated={(c) => navigate(toteUrl(c.id), { replace: true })} />;
  }
  if (state.mode === 'error') {
    return (
      <div className="py-16 text-center space-y-3">
        <AlertTriangle className="w-9 h-9 text-amber-400 mx-auto" />
        <p className="text-white">{state.message}</p>
        <Link to="/storage" className="text-sm text-gray-300 underline">Go to Storage</Link>
      </div>
    );
  }
  return <div className="flex items-center justify-center gap-2 py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /> Opening tote…</div>;
}

/** Target of browser-opening tote QR codes: /st/{opaque id}. Login first, then the tote. */
export default function StorageQrRedirect() {
  return <StorageGate><div className="mx-auto w-full max-w-xl"><Resolve /></div></StorageGate>;
}