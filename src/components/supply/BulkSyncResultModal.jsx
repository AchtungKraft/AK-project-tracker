import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * BulkSyncResultModal - Shows detailed results after batch cost sync
 * 
 * Categories:
 * - updated: cost was synced from PO
 * - skipped: no change needed, override, or billing locked
 * - missing: PO has $0 cost (nothing to sync)
 * - failed: error during sync
 */
export default function BulkSyncResultModal({ open, onClose, result }) {
  if (!result) return null;

  const synced = result.synced || [];
  const skipped = result.skipped || [];
  const errors = result.errors || [];
  const total = result.total || 0;

  const missing = skipped.filter(s => s.reason === 'ZERO_COST' || s.reason === 'NO_PO_LINES' || s.reason === 'ALL_LINES_CANCELLED');
  const overrideSkipped = skipped.filter(s => s.reason === 'COST_OVERRIDE' || s.reason === 'COST_OVERRIDE_ACTIVE');
  const billingLocked = skipped.filter(s => s.reason === 'BILLING_LOCKED');
  const statusExcluded = skipped.filter(s => s.reason === 'STATUS_EXCLUDED');
  const noChange = skipped.filter(s => s.reason === 'NO_CHANGE');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-400" />
            Cost Sync Results
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-3">
          {/* Summary Grid */}
          <div className="grid grid-cols-2 gap-2">
            <SummaryCell
              count={synced.length}
              label="Updated"
              icon={CheckCircle2}
              color="text-emerald-400"
              bg="bg-emerald-900/20"
            />
            <SummaryCell
              count={noChange.length}
              label="No Change"
              icon={CheckCircle2}
              color="text-gray-400"
              bg="bg-gray-800/50"
            />
            <SummaryCell
              count={missing.length}
              label="Missing Cost"
              icon={AlertTriangle}
              color="text-amber-400"
              bg="bg-amber-900/20"
            />
            <SummaryCell
              count={errors.length}
              label="Failed"
              icon={XCircle}
              color="text-red-400"
              bg="bg-red-900/20"
            />
          </div>

          {/* Updated Details */}
          {synced.length > 0 && (
            <DetailSection title="Updated" color="text-emerald-400">
              {synced.slice(0, 8).map((s, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-0.5">
                  <span className="text-gray-300 truncate flex-1">{s.commitment_id?.slice(-6)}</span>
                  <span className="text-emerald-400 font-mono ml-2">
                    {s.old_cost != null ? `${formatCurrencyUSD(s.old_cost)} → ` : ''}
                    {formatCurrencyUSD(s.new_cost)}
                  </span>
                </div>
              ))}
              {synced.length > 8 && (
                <span className="text-xs text-gray-500">+{synced.length - 8} more</span>
              )}
            </DetailSection>
          )}

          {/* Override Skipped */}
          {overrideSkipped.length > 0 && (
            <DetailSection title={`${overrideSkipped.length} Manual Override (skipped)`} color="text-amber-400/70">
              <p className="text-xs text-gray-500">
                These commitments have manual cost override enabled — PO sync will not overwrite them.
              </p>
            </DetailSection>
          )}

          {/* Billing Locked */}
          {billingLocked.length > 0 && (
            <DetailSection title={`${billingLocked.length} Billing Locked (skipped)`} color="text-red-400/70">
              <p className="text-xs text-gray-500">
                These commitments are invoiced or paid — cost cannot be changed.
              </p>
            </DetailSection>
          )}

          {/* Status Excluded (cancelled/closed) */}
          {statusExcluded.length > 0 && (
            <DetailSection title={`${statusExcluded.length} Cancelled/Closed (skipped)`} color="text-gray-500">
              <p className="text-xs text-gray-500">
                These commitments are cancelled or closed.
              </p>
            </DetailSection>
          )}

          {/* Missing */}
          {missing.length > 0 && (
            <DetailSection title={`${missing.length} Missing PO Cost`} color="text-amber-400">
              <p className="text-xs text-gray-500">
                PO lines have $0 cost or no PO lines exist. Edit PO line costs first, then re-sync.
              </p>
            </DetailSection>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <DetailSection title={`${errors.length} Failed`} color="text-red-400">
              {errors.slice(0, 5).map((e, i) => (
                <div key={i} className="text-xs text-red-400/80 py-0.5">
                  {e.commitment_id?.slice(-6)}: {e.error}
                </div>
              ))}
            </DetailSection>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="bg-gray-700 hover:bg-gray-600">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCell({ count, label, icon: Icon, color, bg }) {
  return (
    <div className={cn("p-2.5 rounded-lg flex items-center gap-2", bg)}>
      <Icon className={cn("w-4 h-4", color)} />
      <div>
        <p className={cn("text-lg font-bold font-mono", color)}>{count}</p>
        <p className="text-[10px] text-gray-500 uppercase">{label}</p>
      </div>
    </div>
  );
}

function DetailSection({ title, color, children }) {
  return (
    <div className="space-y-1">
      <p className={cn("text-xs font-medium", color)}>{title}</p>
      <div className="pl-2 border-l border-gray-700/50">
        {children}
      </div>
    </div>
  );
}