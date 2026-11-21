import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";

const LABELS = { pending: 'Ready', uploading: 'Uploading', uploaded: 'Uploaded', saving: 'Saving', saved: 'Saved', failed: 'Failed' };

export default function CaptureThumb({ item, onRemove, disabled }) {
  const busy = ['uploading', 'saving'].includes(item.status);
  const removable = !disabled && ['pending', 'failed', 'uploaded'].includes(item.status);
  return (
    <div className="relative w-24 h-24 shrink-0 rounded-lg overflow-hidden border border-gray-700 bg-gray-900">
      <img src={item.preview} alt="" className="w-full h-full object-cover" />
      {removable && (
        <button type="button" onClick={() => onRemove(item.key)} aria-label="Remove photo"
          className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/75 text-white flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>
      )}
      <div className={`absolute bottom-0 inset-x-0 px-1.5 py-0.5 text-[10px] font-medium flex items-center gap-1 ${item.status === 'failed' ? 'bg-red-700/90 text-white' : item.status === 'saved' ? 'bg-green-700/90 text-white' : 'bg-black/70 text-gray-200'}`}
        title={item.error || ''}>
        {busy && <Loader2 className="w-3 h-3 animate-spin" />}
        {item.status === 'saved' && <CheckCircle2 className="w-3 h-3" />}
        {item.status === 'failed' && <AlertTriangle className="w-3 h-3" />}
        {LABELS[item.status]}
      </div>
    </div>
  );
}