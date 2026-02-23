import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Activity, AlertTriangle, CheckCircle2, RefreshCw, Wrench, 
  ExternalLink, AlertCircle, TrendingDown, TrendingUp 
} from "lucide-react";
import { toast } from "sonner";
import { CoverageBadge } from "./CoverageBadge";
import { cn } from "@/lib/utils";
import { normalizeProjectId } from "@/components/financial/queryKeyFactories";

/**
 * Phase 9.7c — Coverage Diagnostics Panel
 * 
 * Provides drift detection and safe repair functionality.
 * Opens as a drawer from ProjectSupplyManager header.
 */

/**
 * Query key factory for coverage diagnostics
 */
const diagnosticsKeys = {
  coverage: (projectId) => ['coverageDiagnostics', normalizeProjectId(projectId)],
};

export function CoverageDiagnosticsPanel({ projectId, onOpenCommitment }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [showRepairConfirm, setShowRepairConfirm] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);

  // DETERMINISTIC: Normalize projectId once
  const normalizedProjectId = normalizeProjectId(projectId);

  const { data: diagnostics, isLoading, refetch, isFetching } = useQuery({
    queryKey: diagnosticsKeys.coverage(normalizedProjectId),
    queryFn: async () => {
      const response = await base44.functions.invoke('runCommitmentQtyDriftCheck', {
        project_id: normalizedProjectId || undefined,
        limit: 200,
        repair_safe: false
      });
      return response.data;
    },
    enabled: isOpen,
    staleTime: 30000
  });

  const handleRunRepair = async () => {
    setIsRepairing(true);
    try {
      const response = await base44.functions.invoke('runCommitmentQtyDriftCheck', {
        project_id: normalizedProjectId || undefined,
        limit: 200,
        repair_safe: true
      });
      
      const result = response.data;
      const repairedCount = result.worst_offenders?.filter(o => o.repaired).length || 0;
      
      if (repairedCount > 0) {
        toast.success(`Repaired ${repairedCount} commitment(s)`);
        // Invalidate all related queries
        queryClient.invalidateQueries({ queryKey: ['projectCommitments'] });
        queryClient.invalidateQueries({ queryKey: ['lifecycleActionQueue'] });
      } else {
        toast.info('No safe repairs needed');
      }
      
      refetch();
    } catch (error) {
      toast.error(`Repair failed: ${error.message}`);
    } finally {
      setIsRepairing(false);
      setShowRepairConfirm(false);
    }
  };

  const getSeverityBadge = (violations) => {
    const hasBlocking = violations?.some(v => v.severity === 'BLOCKING');
    if (hasBlocking) {
      return <Badge className="bg-red-600 text-white">Blocking</Badge>;
    }
    return <Badge className="bg-amber-600 text-white">Warning</Badge>;
  };

  const getViolationCodeBadge = (code) => {
    const codeConfig = {
      'NEGATIVE_QTY': { color: 'bg-red-900 text-red-300', label: 'Negative' },
      'RESERVED_GT_NEEDED': { color: 'bg-purple-900 text-purple-300', label: 'Over-Reserved' },
      'COVERAGE_OVER_NEEDED': { color: 'bg-purple-900 text-purple-300', label: 'Over-Coverage' },
      'RECEIVED_GT_ORDERED': { color: 'bg-amber-900 text-amber-300', label: 'Over-Received' },
      'INSTALLED_GT_AVAILABLE': { color: 'bg-red-900 text-red-300', label: 'Over-Install' },
      'INSTALLED_GT_NEEDED': { color: 'bg-amber-900 text-amber-300', label: 'Extra Install' },
      'PO_ADJUSTMENT_REQUIRED': { color: 'bg-blue-900 text-blue-300', label: 'PO Adjust' },
      'QTY_TO_ORDER_DRIFT': { color: 'bg-gray-700 text-gray-300', label: 'Drift' }
    };
    const config = codeConfig[code] || { color: 'bg-gray-700 text-gray-300', label: code };
    return <Badge className={cn(config.color, "text-xs")}>{config.label}</Badge>;
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="border-gray-600 text-gray-300 gap-2">
            <Activity className="w-4 h-4" />
            Diagnostics
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full sm:max-w-2xl bg-gray-900 border-gray-700 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Coverage Diagnostics
            </SheetTitle>
            <SheetDescription className="text-gray-400">
              Scan commitments for quantity invariant violations and drift
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                onClick={() => refetch()}
                variant="outline"
                size="sm"
                disabled={isFetching}
                className="border-gray-600 text-gray-300 gap-2"
              >
                <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
                {isFetching ? 'Scanning...' : 'Rescan'}
              </Button>
              <Button
                onClick={() => setShowRepairConfirm(true)}
                variant="outline"
                size="sm"
                disabled={!diagnostics || diagnostics.violating === 0 || isRepairing}
                className="border-amber-600 text-amber-400 gap-2"
              >
                <Wrench className="w-4 h-4" />
                Run Safe Repair
              </Button>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                <span className="ml-3 text-gray-400">Scanning commitments...</span>
              </div>
            )}

            {/* Results */}
            {diagnostics && !isLoading && (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-4 gap-3">
                  <Card className="bg-gray-800 border-gray-700">
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-white">{diagnostics.scanned}</p>
                      <p className="text-xs text-gray-400">Scanned</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-800 border-gray-700">
                    <CardContent className="p-3 text-center">
                      <p className={cn("text-2xl font-bold", diagnostics.violating > 0 ? "text-amber-400" : "text-green-400")}>
                        {diagnostics.violating}
                      </p>
                      <p className="text-xs text-gray-400">Violating</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-800 border-gray-700">
                    <CardContent className="p-3 text-center">
                      <p className={cn("text-2xl font-bold", diagnostics.blocking > 0 ? "text-red-400" : "text-gray-400")}>
                        {diagnostics.blocking}
                      </p>
                      <p className="text-xs text-gray-400">Blocking</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-800 border-gray-700">
                    <CardContent className="p-3 text-center">
                      <p className={cn("text-2xl font-bold", diagnostics.warning > 0 ? "text-amber-400" : "text-gray-400")}>
                        {diagnostics.warning}
                      </p>
                      <p className="text-xs text-gray-400">Warnings</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Violation Code Histogram */}
                {Object.keys(diagnostics.by_code || {}).length > 0 && (
                  <Card className="bg-gray-800 border-gray-700">
                    <CardContent className="p-4">
                      <p className="text-sm font-medium text-gray-300 mb-2">By Violation Type</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(diagnostics.by_code).map(([code, count]) => (
                          <div key={code} className="flex items-center gap-1">
                            {getViolationCodeBadge(code)}
                            <span className="text-white text-sm font-medium">{count}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Empty State */}
                {diagnostics.violating === 0 && (
                  <Card className="bg-gray-800 border-gray-700">
                    <CardContent className="p-8 text-center">
                      <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                      <p className="text-white font-medium">No drift detected</p>
                      <p className="text-gray-400 text-sm">All commitments pass invariant validation</p>
                    </CardContent>
                  </Card>
                )}

                {/* Worst Offenders Table */}
                {diagnostics.worst_offenders?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-300">
                      Worst Offenders ({Math.min(diagnostics.worst_offenders.length, 20)} of {diagnostics.violating})
                    </p>
                    <div className="border border-gray-700 rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-800/50 border-gray-700">
                            <TableHead className="text-gray-400">Part</TableHead>
                            <TableHead className="text-gray-400">Project</TableHead>
                            <TableHead className="text-gray-400">Coverage</TableHead>
                            <TableHead className="text-gray-400">Gap/Over</TableHead>
                            <TableHead className="text-gray-400">Violations</TableHead>
                            <TableHead className="text-gray-400 w-20"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {diagnostics.worst_offenders.slice(0, 20).map((offender) => (
                            <TableRow key={offender.commitment_id} className="border-gray-700 hover:bg-gray-800/30">
                              <TableCell>
                                <p className="text-white text-sm font-medium truncate max-w-[150px]">
                                  {offender.part_name}
                                </p>
                              </TableCell>
                              <TableCell>
                                <p className="text-gray-400 text-sm truncate max-w-[120px]">
                                  {offender.project_name}
                                </p>
                              </TableCell>
                              <TableCell>
                                <CoverageBadge
                                  coverage_status={offender.coverage_status}
                                  gap_qty={offender.gap_qty}
                                  overage_qty={offender.overage_qty}
                                  breakdown={offender.qty_state}
                                  poAdjustmentRequired={offender.poAdjustmentRequired}
                                  compact
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2 text-sm">
                                  {offender.gap_qty > 0 && (
                                    <span className="text-red-400 flex items-center gap-1">
                                      <TrendingDown className="w-3 h-3" />
                                      {offender.gap_qty}
                                    </span>
                                  )}
                                  {offender.overage_qty > 0 && (
                                    <span className="text-purple-400 flex items-center gap-1">
                                      <TrendingUp className="w-3 h-3" />
                                      +{offender.overage_qty}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {offender.violations?.slice(0, 2).map((v, i) => (
                                    <span key={i}>{getViolationCodeBadge(v.code)}</span>
                                  ))}
                                  {offender.violations?.length > 2 && (
                                    <Badge className="bg-gray-700 text-gray-300 text-xs">
                                      +{offender.violations.length - 2}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setIsOpen(false);
                                    onOpenCommitment?.({
                                      id: offender.commitment_id,
                                      project_id: offender.project_id,
                                      part_id: offender.part_id
                                    });
                                  }}
                                  className="text-cyan-400 hover:text-cyan-300"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Last Run */}
                {diagnostics.last_run_at && (
                  <p className="text-xs text-gray-500 text-right">
                    Last scan: {new Date(diagnostics.last_run_at).toLocaleString()}
                  </p>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Repair Confirmation Dialog */}
      <AlertDialog open={showRepairConfirm} onOpenChange={setShowRepairConfirm}>
        <AlertDialogContent className="bg-gray-900 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-amber-400" />
              Run Safe Repair?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This will automatically fix safe issues:
              <ul className="list-disc ml-5 mt-2 space-y-1">
                <li>Clamp negative quantities to 0</li>
                <li>Recalculate qty_to_order from invariant</li>
                <li>Log all repairs to lifecycle events</li>
              </ul>
              <p className="mt-3 text-amber-400">
                This action modifies data and cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 border-gray-600 text-gray-300">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRunRepair}
              disabled={isRepairing}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              {isRepairing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Repairing...
                </>
              ) : (
                'Run Repair'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default CoverageDiagnosticsPanel;