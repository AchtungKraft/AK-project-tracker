import { Progress } from "@/components/ui/progress";
import CaptureThumb from "./CaptureThumb";

const DONE = ['uploaded', 'saving', 'saved'];

/** Queued photos with per-photo status, plus overall progress while saving. */
export default function CaptureQueue({ items, saving, onRemove, emptyText }) {
  const uploaded = items.filter(i => DONE.includes(i.status)).length;
  const registering = items.length > 0 && items.every(i => i.status === 'saving');
  return (
    <>
      {items.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map(i => <CaptureThumb key={i.key} item={i} onRemove={onRemove} disabled={saving} />)}
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-4 border border-dashed border-gray-800 rounded-lg">{emptyText}</p>
      )}
      {saving && (
        <div className="space-y-1">
          <Progress value={items.length ? (uploaded / items.length) * 100 : 0} className="h-2" />
          <p className="text-xs text-gray-400">
            {registering ? 'Saving to tote…' : `Uploading ${uploaded} of ${items.length}…`}
          </p>
        </div>
      )}
    </>
  );
}