import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, RefreshCw, Bug, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * CommitmentBillingDiagnostics - Phase 6 UI Diagnostics Panel
 * 
 * Admin-only panel showing per-commitment:
 * - part_name
 * - required / installed
 * - available_to_allocate / installable_qty
 * - invoiced_qty (stored) vs derived_invoiced_qty
 * - billing_status (stored) vs derived status
 * - derived_balance_due
 * 
 * Highlights drift rows and allows normalization.
 */

export default function CommitmentBillingDiagnostics({ projectId }) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['commitment-billing-diagnostics', projectId],
    queryFn: async () => {
      const response = await base44.functions.invoke('normalizeProjectCommitmentBilling', {
        project_id: projectId,
        dry_run: true,
      });
      return response.data;
    },
    enabled: isOpen && Boolean(projectId),
    staleTime: 30000,
  });

  const normalizeMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('normalizeProjectCommitmentBilling', {
        project_id: projectId,
        dry_run: false,
      });
      return response.data;
    },
    onSuccess: () => {
      refetch();
      // Invalidate supply view to reflect changes
      queryClient.invalidateQueries({ queryKey: ['supply'] });
    },
  });

  const facts = data?.commitment_facts || [];
  const driftCount = data?.counts?.drifted || 0;
  const summary = data?.summary || {};

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-xs text-gray-400 hover:text-white gap-1"
        >
          <Bug className="w-3 h-3" />
          Billing Diagnostics
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[800px] max-w-full bg-gray-900 border-gray-700 p-0">
        <SheetHeader className="p-4 border-b border-gray-700">
          <SheetTitle className="text-white flex items-center justify-between">
            <span>Commitment Billing Diagnostics</span>
            <div className="flex items-center gap-2">
              {driftCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {driftCount} Drift{driftCount !== 1 ? 's' : ''}
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                className="text-xs"
              >
                <RefreshCw className={cn("w-3 h-3 mr-1", isLoading && "animate-spin")} />
                Refresh
              </Button>
              {driftCount > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => normalizeMutation.mutate()}
                  disabled={normalizeMutation.isPending}
                  className="text-xs"
                >
                  <Wrench className="w-3 h-3 mr-1" />
                  Fix {driftCount} Drift{driftCount !== 1 ? 's' : ''}
                </Button>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>

        {/* Summary Strip */}
        <div className="p-4 border-b border-gray-700 bg-gray-800/50">
          <div className="grid grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-gray-400 block">Total Commitments</span>
              <span className="text-white font-mono">{data?.counts?.total || 0}</span>
            </div>
            <div>
              <span className="text-gray-400 block">Total Invoiced</span>
              <span className="text-white font-mono">{formatCurrencyUSD(summary.total_derived_invoiced || 0)}</span>
            </div>
            <div>
              <span className="text-gray-400 block">Total Paid</span>
              <span className="text-emerald-400 font-mono">{formatCurrencyUSD(summary.total_derived_paid || 0)}</span>
            </div>
            <div>
              <span className="text-gray-400 block">Total Installable</span>
              <span className="text-cyan-400 font-mono">{summary.total_installable || 0}</span>
            </div>
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-180px)]">
          <Table>
            <TableHeader className="sticky top-0 bg-gray-900 z-10">
              <TableRow className="border-gray-700 hover:bg-gray-800/50">
                <TableHead className="text-gray-400 text-[10px]">Part</TableHead>
                <TableHead className="text-gray-400 text-[10px] text-center">REQ/INST</TableHead>
                <TableHead className="text-gray-400 text-[10px] text-center">AVAIL/INSTALLABLE</TableHead>
                <TableHead className="text-gray-400 text-[10px] text-center">INV QTY (stored→derived)</TableHead>
                <TableHead className="text-gray-400 text-[10px] text-center">INV AMT (stored→derived)</TableHead>
                <TableHead className="text-gray-400 text-[10px] text-center">STATUS (stored→derived)</TableHead>
                <TableHead className="text-gray-400 text-[10px] text-right">BALANCE DUE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facts.map((fact) => (
                <TableRow 
                  key={fact.commitment_id}
                  className={cn(
                    "border-gray-800 hover:bg-gray-800/30",
                    fact.has_drift && "bg-red-950/20 border-l-2 border-l-red-500"
                  )}
                >
                  <TableCell className="text-white text-xs font-medium max-w-[200px] truncate">
                    {fact.part_name}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-mono text-[10px]">
                      <span className="text-white">{fact.required_qty}</span>
                      <span className="text-gray-500">/</span>
                      <span className="text-emerald-400">{fact.installed_qty}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-mono text-[10px]">
                      <span className="text-cyan-400">{fact.available_to_allocate}</span>
                      <span className="text-gray-500">/</span>
                      <span className={cn(
                        fact.installable_qty > 0 ? "text-green-400" : "text-gray-500"
                      )}>
                        {fact.installable_qty}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <DriftCell 
                      stored={fact.stored_invoiced_qty}
                      derived={fact.derived_invoiced_qty}
                      hasDrift={fact.qty_drift}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <DriftCell 
                      stored={formatCurrencyUSD(fact.stored_invoiced_amount)}
                      derived={formatCurrencyUSD(fact.derived_invoiced_amount)}
                      hasDrift={fact.amount_drift}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <DriftCell 
                      stored={fact.stored_billing_status}
                      derived={fact.derived_billing_status}
                      hasDrift={fact.status_drift}
                      isStatus
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={cn(
                      "font-mono text-[10px]",
                      fact.derived_balance_due > 0 ? "text-amber-400" : "text-emerald-400"
                    )}>
                      {formatCurrencyUSD(fact.derived_balance_due)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {facts.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                    No commitments found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function DriftCell({ stored, derived, hasDrift, isStatus = false }) {
  if (!hasDrift) {
    return (
      <span className={cn(
        "font-mono text-[10px]",
        isStatus ? getStatusColor(derived) : "text-gray-400"
      )}>
        {derived}
      </span>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <span className={cn(
        "font-mono text-[10px] line-through",
        isStatus ? getStatusColor(stored) : "text-red-400"
      )}>
        {stored}
      </span>
      <span className="text-gray-500 text-[10px]">→</span>
      <span className={cn(
        "font-mono text-[10px] font-semibold",
        isStatus ? getStatusColor(derived) : "text-green-400"
      )}>
        {derived}
      </span>
    </div>
  );
}

function getStatusColor(status) {
  switch (status) {
    case 'paid': return 'text-emerald-400';
    case 'invoiced': return 'text-amber-400';
    default: return 'text-gray-400';
  }
}