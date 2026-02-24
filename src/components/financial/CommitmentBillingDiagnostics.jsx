import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, RefreshCw, Wrench, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { toast } from "sonner";

/**
 * CommitmentBillingDiagnostics - Phase 7 Diagnostics Overlay
 * 
 * Displays for each commitment:
 * - required, installed, invoiced, paid, balance_due
 * - available_stock, billing_status, derived_status
 * - Highlights rows where billing_status !== derived_status
 */
export default function CommitmentBillingDiagnostics({ projectId }) {
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['commitmentBillingDiagnostics', projectId],
    queryFn: async () => {
      const response = await base44.functions.invoke('diagnoseCommitmentBillingDrift', {
        project_id: projectId,
        dry_run: true,
        include_diagnostics: true,
      });
      return response.data;
    },
    enabled: Boolean(projectId),
    staleTime: 30000,
  });

  const repairMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('diagnoseCommitmentBillingDrift', {
        project_id: projectId,
        dry_run: false,
        include_diagnostics: true,
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Repaired ${data.summary?.corrections_applied || 0} commitments`);
      queryClient.invalidateQueries({ queryKey: ['commitmentBillingDiagnostics', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectSupplyView', projectId] });
    },
    onError: (err) => {
      toast.error(`Repair failed: ${err.message}`);
    },
  });

  if (isLoading) {
    return (
      <Card className="bg-gray-900 border-gray-700">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-400">Loading diagnostics...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-red-900/20 border-red-700">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-5 h-5" />
            <span>Error loading diagnostics: {error.message}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const summary = data?.summary || {};
  const rows = data?.diagnostic_table || [];
  const corrections = data?.corrections || [];

  // Filter rows based on showAll toggle
  const displayRows = showAll ? rows : rows.filter(r => r.has_drift);

  return (
    <Card className="bg-gray-900 border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <Wrench className="w-5 h-5" />
              Billing Drift Diagnostics
            </CardTitle>
            <CardDescription>
              Compares commitment billing_status against derived values from invoices
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="text-gray-300"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Summary Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant={summary.billing_drift_detected ? "destructive" : "outline"} className="px-3 py-1">
            {summary.billing_drift_detected ? (
              <><AlertTriangle className="w-3 h-3 mr-1" /> Billing Drift</>
            ) : (
              <><CheckCircle2 className="w-3 h-3 mr-1" /> No Billing Drift</>
            )}
          </Badge>
          <Badge variant={summary.install_drift_detected ? "destructive" : "outline"} className="px-3 py-1">
            {summary.install_drift_detected ? (
              <><AlertTriangle className="w-3 h-3 mr-1" /> Install Gating Issue</>
            ) : (
              <><CheckCircle2 className="w-3 h-3 mr-1" /> Install OK</>
            )}
          </Badge>
          <Badge variant="secondary" className="px-3 py-1">
            {summary.total_commitments} Commitments
          </Badge>
          {summary.commitments_with_drift > 0 && (
            <Badge variant="destructive" className="px-3 py-1">
              {summary.commitments_with_drift} Need Repair
            </Badge>
          )}
        </div>

        {/* Credit Available */}
        {data?.credit_available > 0 && (
          <div className="text-sm text-gray-400">
            Credit Available: <span className="text-green-400 font-mono">{formatCurrencyUSD(data.credit_available)}</span>
          </div>
        )}

        {/* Repair Button */}
        {summary.commitments_with_drift > 0 && (
          <div className="flex items-center gap-3 p-3 bg-amber-900/20 rounded-lg border border-amber-700/50">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-amber-300 text-sm font-medium">
                {summary.commitments_with_drift} commitment(s) have billing status drift
              </p>
              <p className="text-amber-400/70 text-xs">
                This can cause parts to appear unbillable or incorrectly flagged as paid.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => repairMutation.mutate()}
              disabled={repairMutation.isPending}
              className="border-amber-600 text-amber-400 hover:bg-amber-900/30"
            >
              {repairMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Repairing...</>
              ) : (
                <><Wrench className="w-4 h-4 mr-1" /> Repair All</>
              )}
            </Button>
          </div>
        )}

        {/* Toggle to show all */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(!showAll)}
            className="text-gray-400"
          >
            {showAll ? 'Show Only Drift' : 'Show All Commitments'}
          </Button>
          <span className="text-xs text-gray-500">
            Showing {displayRows.length} of {rows.length}
          </span>
        </div>

        {/* Diagnostic Table */}
        {displayRows.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700">
                  <TableHead className="text-gray-400">Part</TableHead>
                  <TableHead className="text-gray-400 text-right">Req</TableHead>
                  <TableHead className="text-gray-400 text-right">Inst</TableHead>
                  <TableHead className="text-gray-400 text-right">Inv Qty</TableHead>
                  <TableHead className="text-gray-400 text-right">Inv Amt</TableHead>
                  <TableHead className="text-gray-400 text-right">Paid</TableHead>
                  <TableHead className="text-gray-400 text-right">Balance</TableHead>
                  <TableHead className="text-gray-400">Current Status</TableHead>
                  <TableHead className="text-gray-400">Derived Status</TableHead>
                  <TableHead className="text-gray-400">Drift</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((row) => (
                  <TableRow 
                    key={row.commitment_id}
                    className={cn(
                      "border-gray-800",
                      row.has_drift && "bg-red-900/10"
                    )}
                  >
                    <TableCell className="font-medium text-white max-w-[200px] truncate">
                      {row.part_name}
                    </TableCell>
                    <TableCell className="text-right font-mono text-gray-300">
                      {row.quantity_required}
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-400">
                      {row.quantity_installed}
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-mono",
                      row.invoiced_qty_match ? "text-gray-300" : "text-amber-400"
                    )}>
                      {row.invoiced_qty}
                      {!row.invoiced_qty_match && (
                        <span className="text-xs text-gray-500"> → {row.derived_invoiced_qty}</span>
                      )}
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-mono",
                      row.invoiced_amount_match ? "text-gray-300" : "text-amber-400"
                    )}>
                      {formatCurrencyUSD(row.invoiced_amount)}
                      {!row.invoiced_amount_match && (
                        <span className="text-xs text-gray-500 block">
                          → {formatCurrencyUSD(row.derived_invoiced_amount)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-400">
                      {formatCurrencyUSD(row.derived_paid_amount)}
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-mono",
                      row.derived_balance_due > 0 ? "text-amber-400" : "text-gray-400"
                    )}>
                      {formatCurrencyUSD(row.derived_balance_due)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        "text-xs",
                        row.billing_status === 'paid' && "border-green-600 text-green-400",
                        row.billing_status === 'invoiced' && "border-amber-600 text-amber-400",
                        row.billing_status === 'unbilled' && "border-gray-600 text-gray-400"
                      )}>
                        {row.billing_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        "text-xs",
                        row.derived_billing_status === 'paid' && "border-green-600 text-green-400",
                        row.derived_billing_status === 'invoiced' && "border-amber-600 text-amber-400",
                        row.derived_billing_status === 'unbilled' && "border-gray-600 text-gray-400"
                      )}>
                        {row.derived_billing_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.has_drift ? (
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            {showAll ? 'No commitments found' : 'No drift detected - all commitments in sync'}
          </div>
        )}

        {/* Sample Corrections Preview */}
        {corrections.length > 0 && (
          <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Pending Corrections Preview</h4>
            <div className="space-y-2 text-xs font-mono">
              {corrections.slice(0, 3).map((c) => (
                <div key={c.commitment_id} className="flex items-center gap-4">
                  <span className="text-white truncate max-w-[150px]">{c.part_name}</span>
                  <span className="text-red-400">{c.before.billing_status}</span>
                  <span className="text-gray-500">→</span>
                  <span className="text-green-400">{c.after.billing_status}</span>
                </div>
              ))}
              {corrections.length > 3 && (
                <div className="text-gray-500">...and {corrections.length - 3} more</div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}