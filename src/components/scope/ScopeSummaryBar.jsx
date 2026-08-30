import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock, MessageSquare, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBudgetRange } from "./scopeHelpers";

export default function ScopeSummaryBar({ stats, isMobile = false }) {
  if (!stats || stats.total === 0) return null;

  const approvedBudget = formatBudgetRange(stats.approved_budget_min, stats.approved_budget_max, false);
  const approvedTbdCount = stats.tbd_count; // simplified — could refine later

  return (
    <div className="space-y-3">
      {/* Approved Scope Total */}
      {stats.approved > 0 && (
        <Card className="bg-green-950/20 border-green-700/40">
          <CardContent className={cn("flex items-center justify-between", isMobile ? "p-3" : "p-4")}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className={cn("font-bold text-green-300", isMobile ? "text-base" : "text-lg")}>Approved Scope</p>
                <p className="text-xs text-green-400/70">{stats.approved} item{stats.approved !== 1 ? 's' : ''} approved</p>
              </div>
            </div>
            {approvedBudget && (
              <p className={cn("font-bold text-green-300", isMobile ? "text-lg" : "text-xl")}>{approvedBudget}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status breakdown */}
      <div className={cn("grid gap-2", isMobile ? "grid-cols-2" : "grid-cols-5")}>
        <StatusChip icon={Clock} label="Needs Review" count={stats.needs_review} color="amber" />
        <StatusChip icon={CheckCircle2} label="Approved" count={stats.approved} color="green" />
        <StatusChip icon={MessageSquare} label="Changes" count={stats.request_changes} color="orange" />
        <StatusChip icon={XCircle} label="Not Now" count={stats.not_now} color="gray" />
        <StatusChip icon={AlertTriangle} label="Reapproval" count={stats.reapproval_required} color="red" />
      </div>
    </div>
  );
}

function StatusChip({ icon: Icon, label, count, color }) {
  if (count === 0) return null;
  const colorMap = {
    amber: "bg-amber-950/30 border-amber-700/40 text-amber-400",
    green: "bg-green-950/30 border-green-700/40 text-green-400",
    orange: "bg-orange-950/30 border-orange-700/40 text-orange-400",
    gray: "bg-gray-800/50 border-gray-700/40 text-gray-400",
    red: "bg-red-950/30 border-red-700/40 text-red-400",
  };

  return (
    <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border", colorMap[color])}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-sm font-medium">{count}</span>
      <span className="text-xs opacity-70 truncate">{label}</span>
    </div>
  );
}