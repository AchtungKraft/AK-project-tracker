import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Settings2, 
  RefreshCw, 
  Loader2, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileWarning,
  Link2Off,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Phase 9.5 — Coverage Diagnostics Drawer
 * 
 * Displays:
 * - Missing classification reasons
 * - Commitments excluded from action queue
 * - Missing part_type
 * - Missing pricing
 * - Broken resolver chain
 */

const REASON_ICONS = {
  missing_project_id: Link2Off,
  project_not_found: Link2Off,
  missing_part_id: Link2Off,
  part_not_found: Link2Off,
  commitment_cancelled: XCircle,
  part_archived: XCircle,
  non_billable_excluded: DollarSign,
  lifecycle_complete_excluded: CheckCircle2,
};

const REASON_COLORS = {
  missing_project_id: 'text-red-400 bg-red-600/20',
  project_not_found: 'text-red-400 bg-red-600/20',
  missing_part_id: 'text-red-400 bg-red-600/20',
  part_not_found: 'text-red-400 bg-red-600/20',
  commitment_cancelled: 'text-gray-400 bg-gray-600/20',
  part_archived: 'text-gray-400 bg-gray-600/20',
  non_billable_excluded: 'text-yellow-400 bg-yellow-600/20',
  lifecycle_complete_excluded: 'text-green-400 bg-green-600/20',
};

function CoverageKPI({ label, value, color, icon: Icon }) {
  return (
    <Card className="bg-gray-800/50 border-gray-700">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          {Icon && <Icon className={cn("w-4 h-4", color)} />}
          <p className="text-xs text-gray-400">{label}</p>
        </div>
        <p className={cn("text-xl font-bold", color)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ReasonBadge({ reason, count }) {
  const Icon = REASON_ICONS[reason] || AlertTriangle;
  const colorClass = REASON_COLORS[reason] || 'text-orange-400 bg-orange-600/20';
  
  return (
    <div className={cn(
      "flex items-center justify-between p-2 rounded",
      colorClass.split(' ')[1]
    )}>
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4", colorClass.split(' ')[0])} />
        <span className={cn("text-sm", colorClass.split(' ')[0])}>
          {reason.replace(/_/g, ' ')}
        </span>
      </div>
      <Badge variant="outline" className="text-xs">{count}</Badge>
    </div>
  );
}

function MissingItemCard({ item }) {
  return (
    <div className="p-3 bg-gray-800/50 rounded-lg text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-white font-medium truncate">{item.part_name}</p>
          <p className="text-gray-500 text-xs truncate">{item.project_name}</p>
        </div>
        <Badge className={cn(
          "text-xs shrink-0",
          REASON_COLORS[item.reason]?.split(' ')[1] || 'bg-orange-600/30'
        )}>
          {item.reason?.replace(/_/g, ' ')}
        </Badge>
      </div>
      
      {/* Additional context */}
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {item.part_type && (
          <span className="text-gray-400">Type: {item.part_type}</span>
        )}
        {item.billing_status && (
          <span className="text-gray-400">Billing: {item.billing_status}</span>
        )}
        {item.financial_role && (
          <span className="text-gray-400">Role: {item.financial_role}</span>
        )}
      </div>
    </div>
  );
}

export default function CoverageDiagnosticsDrawer({ isOpen, onClose }) {
  const { data: diagnostics, isLoading, refetch } = useQuery({
    queryKey: ['coverageDiagnostics'],
    queryFn: async () => {
      const response = await base44.functions.invoke('diagnoseActionWorkbenchCoverage', {
        options: { limit: 50 }
      });
      return response.data;
    },
    enabled: isOpen,
    staleTime: 60000,
  });

  const kpis = diagnostics?.kpis || {};
  const reasonCounts = diagnostics?.reason_counts || {};
  const missingCommitments = diagnostics?.missing_commitments || [];
  const actionBreakdown = diagnostics?.action_breakdown || {};

  // Derive coverage health color
  const coveragePct = kpis.coverage_percentage || 0;
  const coverageColor = coveragePct >= 100 ? 'text-green-400' : 
                        coveragePct >= 95 ? 'text-yellow-400' : 'text-red-400';

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl bg-gray-900 border-gray-700 overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-white flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Coverage Diagnostics
          </SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="flex-1 mt-4">
          <div className="space-y-6 pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
              </div>
            ) : diagnostics ? (
              <>
                {/* Coverage Health KPIs */}
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wide">
                    Coverage Health
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <CoverageKPI 
                      label="Coverage %" 
                      value={`${coveragePct}%`}
                      color={coverageColor}
                      icon={coveragePct >= 95 ? CheckCircle2 : AlertTriangle}
                    />
                    <CoverageKPI 
                      label="Total Commitments" 
                      value={kpis.total_commitments || 0}
                      color="text-white"
                    />
                    <CoverageKPI 
                      label="Eligible" 
                      value={kpis.total_eligible || 0}
                      color="text-green-400"
                      icon={CheckCircle2}
                    />
                    <CoverageKPI 
                      label="Excluded" 
                      value={kpis.total_missing || 0}
                      color={kpis.total_missing > 0 ? "text-yellow-400" : "text-gray-400"}
                      icon={kpis.total_missing > 0 ? FileWarning : null}
                    />
                  </div>
                </div>

                <Separator className="bg-gray-700" />

                {/* Exclusion Reasons Breakdown */}
                {Object.keys(reasonCounts).length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wide">
                      Exclusion Reasons
                    </h3>
                    <div className="space-y-2">
                      {Object.entries(reasonCounts)
                        .sort(([,a], [,b]) => b - a)
                        .map(([reason, count]) => (
                          <ReasonBadge key={reason} reason={reason} count={count} />
                        ))}
                    </div>
                  </div>
                )}

                {/* Action Distribution */}
                {Object.keys(actionBreakdown).length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wide">
                      Action Distribution
                    </h3>
                    <div className="space-y-1">
                      {Object.entries(actionBreakdown)
                        .sort(([,a], [,b]) => b - a)
                        .map(([action, count]) => (
                          <div key={action} className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
                            <span className="text-sm text-gray-300">{action}</span>
                            <Badge className="bg-blue-600 text-xs">{count}</Badge>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <Separator className="bg-gray-700" />

                {/* Missing Items Detail */}
                {missingCommitments.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wide">
                      Excluded Commitments ({missingCommitments.length})
                    </h3>
                    <div className="space-y-2">
                      {missingCommitments.map((item, idx) => (
                        <MissingItemCard key={idx} item={item} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Eligibility Rules Reference */}
                {diagnostics.eligibility_rules && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wide">
                      Eligibility Rules
                    </h3>
                    <div className="p-3 bg-gray-800/30 rounded-lg">
                      <ul className="text-xs text-gray-400 space-y-1">
                        {diagnostics.eligibility_rules.map((rule, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-green-400">•</span>
                            {rule}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-500 text-center py-8">No diagnostic data available</p>
            )}
          </div>
        </ScrollArea>
        
        <div className="pt-4 border-t border-gray-700 mt-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()} 
            disabled={isLoading}
            className="w-full border-gray-700"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Re-run Diagnostics
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}