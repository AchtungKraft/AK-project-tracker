import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowDown, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig, buildLocationPathString } from "../locationTypeConfig";
import { getContainerTypeConfig } from "../containerTypeConfig";

/**
 * MoveSuccessPanel — post-confirmation result view.
 *
 * Props:
 *   result         — backend response { success, batch_id, executed, failed, errors, results }
 *   source         — { type, entity, location_id }
 *   destination    — { type, entity, location_id }
 *   moveLines      — [{ part, qty }]
 *   locations, projects
 *   onDone, onViewDestination, onMoveMore
 */
export default function MoveSuccessPanel({
  result, source, destination, moveLines, locations, projects,
  onDone, onViewDestination, onMoveMore,
}) {
  // Normalize: unwrap .data if the raw SDK response leaked through
  const r = result?.data || result || {};
  const isFullSuccess = r.success && (!r.errors || r.errors.length === 0);
  const hasPartialFailure = (r.executed || 0) > 0 && (r.failed || 0) > 0;
  const totalFailed = r.failed || 0;
  const totalExecuted = r.executed || 0;
  const totalPieces = moveLines.reduce((s, l) => s + l.qty, 0);

  const destName = destination.type === 'CONTAINER'
    ? destination.entity.name
    : destination.entity.location_area;

  const sourceName = source.type === 'CONTAINER'
    ? source.entity.name
    : source.entity.location_area;

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      {/* Status icon */}
      {isFullSuccess ? (
        <div className="w-20 h-20 rounded-full bg-green-950/50 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-12 h-12 text-green-400" />
        </div>
      ) : hasPartialFailure ? (
        <div className="w-20 h-20 rounded-full bg-yellow-950/50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-12 h-12 text-yellow-400" />
        </div>
      ) : (
        <div className="w-20 h-20 rounded-full bg-red-950/50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-12 h-12 text-red-400" />
        </div>
      )}

      {/* Title */}
      <h2 className={cn("text-2xl font-bold mb-1",
        isFullSuccess ? "text-green-400" : hasPartialFailure ? "text-yellow-400" : "text-red-400"
      )}>
        {isFullSuccess ? 'Move Complete' : hasPartialFailure ? 'Move Needs Attention' : 'Move Failed'}
      </h2>

      {/* Summary */}
      <p className="text-sm text-gray-400 mb-4">
        {isFullSuccess
          ? `${totalExecuted} inventory lines · ${totalPieces} pieces moved`
          : hasPartialFailure
            ? `${totalExecuted} succeeded, ${totalFailed} failed`
            : `All ${totalFailed || moveLines.length} lines failed`
        }
      </p>

      {/* From → To summary */}
      <div className="w-full max-w-sm space-y-2 mb-6">
        <div className="text-xs text-gray-500 text-left">FROM</div>
        <div className="bg-gray-900/50 rounded-lg px-3 py-2 text-left">
          <div className="text-sm text-white font-medium">{sourceName}</div>
          {source.location_id && (
            <div className="text-xs text-gray-500 truncate">{buildLocationPathString(source.location_id, locations)}</div>
          )}
        </div>
        <div className="flex justify-center"><ArrowDown className="w-4 h-4 text-gray-600" /></div>
        <div className="text-xs text-gray-500 text-left">TO</div>
        <div className="bg-red-950/20 rounded-lg px-3 py-2 text-left border border-red-900/30">
          <div className="text-sm text-white font-medium">{destName}</div>
          {destination.location_id && (
            <div className="text-xs text-gray-500 truncate">{buildLocationPathString(destination.location_id, locations)}</div>
          )}
        </div>
      </div>

      {/* Failed lines detail */}
      {r.errors && r.errors.length > 0 && (
        <div className="w-full max-w-sm mb-6 border border-red-800/50 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-red-950/30 text-xs text-red-400 font-semibold">Failed Lines</div>
          <div className="divide-y divide-gray-800">
            {r.errors.map((err, idx) => {
              const line = moveLines[err.index];
              return (
                <div key={idx} className="px-3 py-2 text-left">
                  <div className="text-sm text-white">{line?.part?.part_name || `Line ${err.index + 1}`}</div>
                  <div className="text-xs text-red-400">{err.error}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button onClick={onDone} className="h-12 text-base bg-gray-700 hover:bg-gray-600">
          Done
        </Button>
        {isFullSuccess && onViewDestination && (
          <Button onClick={onViewDestination} variant="outline" className="h-11 text-sm border-gray-600 text-gray-300">
            View {destName}
          </Button>
        )}
        {onMoveMore && (
          <Button onClick={onMoveMore} variant="ghost" className="h-10 text-sm text-gray-400">
            Move More from {sourceName}
          </Button>
        )}
      </div>
    </div>
  );
}