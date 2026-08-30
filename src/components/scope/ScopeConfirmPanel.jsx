import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Shield, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBudgetRange } from "./scopeHelpers";

/**
 * Detect if the current approved item set differs from the last confirmation snapshot.
 */
function isConfirmationStale(lastConfirmation, items) {
  if (!lastConfirmation) return false;
  const currentApprovedIds = items
    .filter(i => i.decision_status === 'approved')
    .map(i => i.id)
    .sort();
  const snapshotIds = (lastConfirmation.approved_item_ids || []).slice().sort();
  if (currentApprovedIds.length !== snapshotIds.length) return true;
  return currentApprovedIds.some((id, idx) => id !== snapshotIds[idx]);
}

export default function ScopeConfirmPanel({
  stats,
  items = [],
  lastConfirmation,
  onConfirm,
  readOnly = false,
  isMobile = false,
  isClientView = false,
}) {
  const [confirming, setConfirming] = useState(false);
  const stale = useMemo(() => isConfirmationStale(lastConfirmation, items), [lastConfirmation, items]);

  if (!stats || stats.total === 0) return null;

  const approvedBudget = formatBudgetRange(stats.approved_budget_min, stats.approved_budget_max, false);
  const allReviewed = stats.needs_review === 0 && stats.reapproval_required === 0;

  const handleConfirm = async () => {
    setConfirming(true);
    await onConfirm?.();
    setConfirming(false);
  };

  return (
    <Card className="bg-gray-900/60 border-cyan-700/30">
      <CardContent className={cn("space-y-4", isMobile ? "p-3" : "p-5")}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/20 rounded-lg">
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className={cn("font-bold text-white", isMobile ? "text-base" : "text-lg")}>Scope Confirmation</h3>
            <p className="text-xs text-gray-400">Review your selections and confirm the selected project scope</p>
          </div>
        </div>

        {/* Stale confirmation warning */}
        {stale && lastConfirmation && (
          <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-950/30 border border-amber-700/30">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <p className="text-xs text-amber-300 font-medium">Scope changed since confirmation</p>
              <p className="text-[11px] text-amber-400/70 mt-0.5">
                Confirmed {lastConfirmation.confirmed_by_name ? `by ${lastConfirmation.confirmed_by_name}` : ''}
                {' '}on {new Date(lastConfirmation.confirmed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {lastConfirmation.revision > 1 && ` (v${lastConfirmation.revision})`}
                {' · '}Reconfirmation required
              </p>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-950/20 border border-green-700/30 rounded-lg p-3">
            <p className="text-xs text-green-400/70">Approved</p>
            <p className="text-lg font-bold text-green-300">{stats.approved} item{stats.approved !== 1 ? 's' : ''}</p>
            {approvedBudget && <p className="text-sm text-green-400 mt-0.5">{approvedBudget}</p>}
            {stats.approved_tbd_count > 0 && (
              <p className="text-[11px] text-green-400/60 mt-0.5">+ {stats.approved_tbd_count} TBD</p>
            )}
          </div>
          <div className="bg-gray-800/50 border border-gray-700/30 rounded-lg p-3">
            <p className="text-xs text-gray-400">Not Now</p>
            <p className="text-lg font-bold text-gray-300">{stats.not_now} item{stats.not_now !== 1 ? 's' : ''}</p>
            {(stats.not_now_budget_min > 0 || stats.not_now_budget_max > 0) && (
              <p className="text-sm text-gray-400 mt-0.5">{formatBudgetRange(stats.not_now_budget_min, stats.not_now_budget_max, false)}</p>
            )}
            {stats.not_now_tbd_count > 0 && (
              <p className="text-[11px] text-gray-500 mt-0.5">+ {stats.not_now_tbd_count} TBD</p>
            )}
          </div>
        </div>

        {stats.request_changes > 0 && (
          <p className="text-xs text-orange-400">{stats.request_changes} item{stats.request_changes !== 1 ? 's' : ''} with changes requested</p>
        )}
        {stats.approved_tbd_count > 0 && (
          <p className="text-xs text-gray-400">{stats.approved_tbd_count} approved item{stats.approved_tbd_count !== 1 ? 's' : ''} with TBD budget</p>
        )}

        {!allReviewed && (
          <p className="text-xs text-amber-400">
            {stats.needs_review + stats.reapproval_required} item{(stats.needs_review + stats.reapproval_required) !== 1 ? 's' : ''} still need review before confirmation
          </p>
        )}

        {lastConfirmation && !stale && (
          <p className="text-xs text-gray-500 italic">
            Last confirmed by {lastConfirmation.confirmed_by_name || 'Unknown'} on{' '}
            {new Date(lastConfirmation.confirmed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {lastConfirmation.revision > 1 && ` (v${lastConfirmation.revision})`}
          </p>
        )}

        {!readOnly && (
          <Button
            onClick={handleConfirm}
            disabled={!allReviewed || stats.approved === 0 || confirming}
            className={cn(
              "w-full gap-2",
              allReviewed && stats.approved > 0
                ? "bg-cyan-600 hover:bg-cyan-700 text-white"
                : "bg-gray-700 text-gray-400 cursor-not-allowed"
            )}
          >
            {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {stale ? 'Reconfirm Scope' : 'Confirm Selected Scope'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}