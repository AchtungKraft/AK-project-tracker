import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

/** Save buttons for the current capture mode. `onSave(keepOpen)` saves; keepOpen starts the next batch or item. */
export default function CaptureFooter({ mode, saving, unsaved, failed, onSave, onCancel, sessionCount }) {
  const spin = saving && <Loader2 className="w-4 h-4 animate-spin" />;
  const retry = failed > 0 && !saving;
  const none = saving || !unsaved;
  return (
    <div className="space-y-2 pt-1">
      {mode === 'quick' && (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => onSave(false)} disabled={none} className="h-12 bg-green-700 hover:bg-green-600 gap-2">
            {spin}{retry ? 'Retry Failed' : `Save All${unsaved ? ` (${unsaved})` : ''}`}
          </Button>
          <Button onClick={() => onSave(true)} disabled={none} variant="outline" className="h-12 border-gray-700 text-gray-200">
            Save & Capture More
          </Button>
        </div>
      )}
      {mode === 'item' && (
        <div className="grid grid-cols-[1.4fr_1fr] gap-2">
          <Button onClick={() => onSave(true)} disabled={none} className="h-14 text-base bg-green-700 hover:bg-green-600 gap-2">
            {spin}{retry ? 'Retry Save & Next' : 'Save Item & Next'}
          </Button>
          <Button onClick={() => onSave(false)} disabled={none} variant="outline" className="h-14 border-gray-700 text-gray-200">
            {retry ? 'Retry & Done' : 'Save & Done'}
          </Button>
        </div>
      )}
      {mode === 'existing' && (
        <Button onClick={() => onSave(false)} disabled={none} className="w-full h-14 text-base bg-green-700 hover:bg-green-600 gap-2">
          {spin}{retry ? 'Retry Add Photos' : `Add ${unsaved || ''} Photo${unsaved === 1 ? '' : 's'}`}
        </Button>
      )}
      {sessionCount > 0 && <p className="text-xs text-green-300 text-center">{sessionCount} item{sessionCount === 1 ? '' : 's'} saved in this session</p>}
      <Button variant="ghost" onClick={onCancel} disabled={saving} className="w-full h-11 text-gray-400">
        {mode === 'item' && sessionCount > 0 && !unsaved ? 'Done' : 'Cancel'}
      </Button>
    </div>
  );
}