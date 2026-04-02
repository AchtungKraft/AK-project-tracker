import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Loader2, ChevronDown, ChevronUp, CheckCircle2, XCircle, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";

const STATE_COLORS = {
  PLANNED: "bg-gray-700 text-gray-300",
  NEEDS_ORDER: "bg-amber-900/50 text-amber-300",
  COVERED: "bg-blue-900/50 text-blue-300",
  INSTALL_READY: "bg-emerald-900/50 text-emerald-300",
  INSTALLED: "bg-gray-600 text-gray-300",
};

/**
 * BackfillConfirmModal — Two modes:
 * 1. Preview (dry_run result) — shows what WILL happen
 * 2. Result (apply result) — shows what DID happen
 */
export default function BackfillConfirmModal({ preview, result, onConfirm, onClose, isLoading }) {
  const [showAudit, setShowAudit] = useState(false);
  
  // Result mode — post-apply summary
  if (result) {
    const { summary, conversions = [], skipped = [], errors = [], audit = [] } = result;
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="bg-gray-900 border-gray-700 max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              Backfill Complete
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-green-900/30 border border-green-800 rounded p-2">
                <div className="text-lg font-bold text-green-400">{summary?.applied || 0}</div>
                <div className="text-[10px] text-green-500">Applied</div>
              </div>
              <div className="bg-gray-800/50 border border-gray-700 rounded p-2">
                <div className="text-lg font-bold text-gray-400">{summary?.skipped || 0}</div>
                <div className="text-[10px] text-gray-500">Skipped</div>
              </div>
              <div className="bg-red-900/30 border border-red-800 rounded p-2">
                <div className="text-lg font-bold text-red-400">{summary?.errors || 0}</div>
                <div className="text-[10px] text-red-500">Errors</div>
              </div>
            </div>

            {/* Applied conversions */}
            {conversions.filter(c => c.applied).map(c => (
              <ConversionRow key={c.commitment_id} row={c} mode="applied" />
            ))}

            {/* Skipped rows */}
            {skipped.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Skipped ({skipped.length})</p>
                {skipped.map(s => (
                  <div key={s.commitment_id} className="bg-gray-800/40 rounded px-2 py-1.5 flex items-center gap-2">
                    <SkipForward className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <span className="text-xs text-gray-400 truncate flex-1">{s.part_name}</span>
                    <span className="text-[10px] text-gray-500 font-mono">{s.skip_reason}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Errors */}
            {errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-red-400 uppercase tracking-wide">Errors ({errors.length})</p>
                {errors.map(e => (
                  <div key={e.commitment_id} className="bg-red-900/20 border border-red-900/50 rounded px-2 py-1.5">
                    <span className="text-xs text-red-400">{e.part_name}: {e.error}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Audit log toggle */}
            {audit.length > 0 && (
              <div>
                <button
                  onClick={() => setShowAudit(!showAudit)}
                  className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showAudit ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  Audit Log ({audit.length} entries)
                </button>
                {showAudit && (
                  <div className="mt-1 max-h-40 overflow-y-auto space-y-1">
                    {audit.map((a, i) => (
                      <div key={i} className="bg-gray-900/60 rounded px-2 py-1 text-[10px] text-gray-400 font-mono">
                        [{a.action}] {a.part_name} — {a.skip_reason || `qty:${a.convertible_qty} ${a.before_lifecycle_state || ''}→${a.after_lifecycle_state || ''}`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} className="border-gray-600">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Preview mode — dry_run
  if (!preview || (!preview.conversions?.length && !preview.skipped?.length)) return null;

  const willApply = preview.conversions?.filter(c => c.will_apply) || [];
  const willSkip = [
    ...(preview.conversions?.filter(c => !c.will_apply) || []),
    ...(preview.skipped || []),
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Confirm Backfill</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs text-gray-400">
            {willApply.length} commitment(s) will be converted from PO coverage → stock reservation.
            {willSkip.length > 0 && ` ${willSkip.length} will be skipped.`}
          </p>

          {/* Conversions that will apply */}
          {willApply.map(c => (
            <ConversionRow key={c.commitment_id} row={c} mode="preview" />
          ))}

          {/* Skipped rows with reasons */}
          {willSkip.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Will Skip ({willSkip.length})</p>
              {willSkip.map(s => (
                <div key={s.commitment_id || s.id} className="bg-gray-800/40 rounded px-2 py-1.5 flex items-center gap-2">
                  <SkipForward className="w-3 h-3 text-gray-500 flex-shrink-0" />
                  <span className="text-xs text-gray-400 truncate flex-1">{s.part_name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{s.skip_reason || s.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600" disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading || willApply.length === 0}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Apply Backfill ({willApply.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConversionRow({ row, mode }) {
  return (
    <div className="bg-gray-800/60 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white font-medium truncate max-w-[200px]">
          {row.part_name}
        </span>
        <div className="flex items-center gap-2">
          {row.project_name && (
            <span className="text-[10px] text-blue-400/70 truncate max-w-[120px]">{row.project_name}</span>
          )}
          <span className="text-xs text-purple-400 font-mono">
            qty: {row.convertible_qty}
          </span>
          {mode === 'applied' && row.applied && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
          {mode === 'applied' && !row.applied && <XCircle className="w-3.5 h-3.5 text-red-400" />}
        </div>
      </div>

      {/* Before → After quantities */}
      {row.before && row.after && (
        <>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="bg-gray-900/50 rounded p-1.5">
              <span className="text-gray-500">Before</span>
              <div className="text-gray-300 mt-0.5">
                PO: {row.before.covered_from_po} · Stock: {row.before.reserved_from_stock}
              </div>
            </div>
            <div className="bg-gray-900/50 rounded p-1.5">
              <span className="text-gray-500">After</span>
              <div className="text-green-300 mt-0.5">
                PO: {row.after.covered_from_po} · Stock: {row.after.reserved_from_stock}
              </div>
            </div>
          </div>

          {/* Lifecycle transition */}
          <div className="flex items-center gap-2 text-[10px]">
            <Badge className={cn("text-[10px] px-1.5 py-0", STATE_COLORS[row.before.lifecycle_state] || "bg-gray-700 text-gray-300")}>
              {row.before.lifecycle_state}
            </Badge>
            <ArrowRight className="w-3 h-3 text-gray-500" />
            <Badge className={cn("text-[10px] px-1.5 py-0", STATE_COLORS[row.after.projected_lifecycle_state] || "bg-gray-700 text-gray-300")}>
              {row.after.projected_lifecycle_state}
            </Badge>
          </div>
        </>
      )}

      {row.error && (
        <div className="text-[10px] text-red-400 bg-red-900/20 rounded px-2 py-1">
          Error: {row.error}
        </div>
      )}
    </div>
  );
}