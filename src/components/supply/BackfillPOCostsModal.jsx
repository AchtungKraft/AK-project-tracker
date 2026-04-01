import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, CheckCircle2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export default function BackfillPOCostsModal({ open, onClose, projectId }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState('idle'); // idle | previewing | previewed | applying | done
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  const handlePreview = async () => {
    setPhase('previewing');
    try {
      const res = await base44.functions.invoke('backfillPOLineCosts', {
        dry_run: true,
        project_id: projectId || null,
      });
      setPreview(res.data || res);
      setPhase('previewed');
    } catch (err) {
      toast.error("Preview failed: " + err.message);
      setPhase('idle');
    }
  };

  const handleApply = async () => {
    setPhase('applying');
    try {
      const res = await base44.functions.invoke('backfillPOLineCosts', {
        dry_run: false,
        project_id: projectId || null,
      });
      const data = res.data || res;
      setResult(data);
      setPhase('done');
      toast.success(`Backfill complete: ${data.summary?.total_updated || 0} PO lines updated`);
      await forceAppRefresh(queryClient, { invalidateAll: true });
    } catch (err) {
      toast.error("Backfill failed: " + err.message);
      setPhase('previewed');
    }
  };

  const handleClose = () => {
    setPhase('idle');
    setPreview(null);
    setResult(null);
    onClose();
  };

  const activeData = result || preview;
  const summary = activeData?.summary;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-400" />
            Backfill PO Costs
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Fix PO lines created with $0 cost due to the old fallback bug.
            {projectId && " Scoped to current project."}
          </DialogDescription>
        </DialogHeader>

        {phase === 'idle' && (
          <div className="py-4 text-center">
            <p className="text-sm text-gray-300 mb-4">
              This will scan for PO lines with zero cost, update them from Part.cost,
              and re-sync affected commitment pricing.
            </p>
            <Button onClick={handlePreview} className="bg-amber-600 hover:bg-amber-700">
              Preview Affected Records
            </Button>
          </div>
        )}

        {phase === 'previewing' && (
          <div className="py-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Scanning PO lines...</p>
          </div>
        )}

        {phase === 'applying' && (
          <div className="py-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Applying backfill and syncing commitments...</p>
          </div>
        )}

        {(phase === 'previewed' || phase === 'done') && summary && (
          <div className="space-y-4 py-2">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-2">
              <StatBox label="Zero-Cost Lines Found" value={summary.total_zero_cost_found} color="text-amber-400" />
              <StatBox label="Will Update / Updated" value={summary.total_updated} color="text-emerald-400" />
              <StatBox label="Skipped (No Part Cost)" value={summary.total_skipped_no_part_cost} color="text-gray-400" />
              <StatBox label="Skipped (Override)" value={summary.total_skipped_override} color="text-amber-400" />
              <StatBox label="Skipped (Billing Lock)" value={summary.total_skipped_billing_locked} color="text-red-400" />
              <StatBox label="Commitments Synced" value={summary.total_commitments_synced} color="text-blue-400" />
              {summary.total_failures > 0 && (
                <StatBox label="Failures" value={summary.total_failures} color="text-red-500" />
              )}
            </div>

            {/* Affected PO Lines */}
            {activeData.po_lines_updated?.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 uppercase mb-2">PO Lines to Fix</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {activeData.po_lines_updated.map(li => (
                    <div key={li.po_line_id} className="flex items-center justify-between text-xs bg-gray-800/50 rounded px-2 py-1.5">
                      <span className="text-gray-300 truncate flex-1">{li.part_name}</span>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-red-400 font-mono">{formatCurrencyUSD(li.old_unit_cost)}</span>
                        <span className="text-gray-500">→</span>
                        <span className="text-emerald-400 font-mono">{formatCurrencyUSD(li.new_unit_cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skipped Lines */}
            {activeData.po_lines_skipped?.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 uppercase mb-2">Skipped ({activeData.po_lines_skipped.length})</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {activeData.po_lines_skipped.map(li => (
                    <div key={li.po_line_id} className="flex items-center justify-between text-xs bg-gray-800/30 rounded px-2 py-1">
                      <span className="text-gray-500 truncate flex-1">{li.po_line_id?.slice(-8)}</span>
                      <Badge variant="outline" className="text-[9px] text-gray-400">{li.reason}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Done indicator */}
            {phase === 'done' && (
              <div className="flex items-center gap-2 p-3 bg-emerald-900/20 border border-emerald-700/30 rounded text-emerald-300 text-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                Backfill complete. Commitments have been re-synced.
              </div>
            )}

            {summary.total_zero_cost_found === 0 && (
              <div className="flex items-center gap-2 p-3 bg-gray-800/50 border border-gray-700 rounded text-gray-300 text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                No zero-cost PO lines found. Nothing to backfill.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} className="border-gray-600">
            {phase === 'done' ? 'Close' : 'Cancel'}
          </Button>
          {phase === 'previewed' && summary?.total_updated > 0 && (
            <Button onClick={handleApply} className="bg-emerald-600 hover:bg-emerald-700">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Apply Backfill ({summary.total_updated} lines)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div className="bg-gray-800/50 rounded p-2 text-center">
      <p className={cn("text-lg font-mono font-bold", color)}>{value ?? 0}</p>
      <p className="text-[10px] text-gray-500 uppercase">{label}</p>
    </div>
  );
}