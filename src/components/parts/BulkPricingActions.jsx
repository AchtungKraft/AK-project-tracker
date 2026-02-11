import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Wrench, 
  Calculator, 
  RefreshCw, 
  DollarSign,
  Loader2,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { getMarkupFromMatrix, calculateUnitRetail } from "../inventory/pricingUtils";

/**
 * BulkPricingActions - Bulk pricing tools for Project Parts
 */
export default function BulkPricingActions({ 
  projectId,
  assignments = [],
  commitments = [],
  parts = [],
  matrixTiers = [],
}) {
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [currentAction, setCurrentAction] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [result, setResult] = useState(null);
  
  const projectAssignments = assignments.filter(a => a.project_id === projectId);
  const projectCommitments = commitments.filter(c => c.project_id === projectId && c.commitment_status !== 'cancelled');
  
  const actions = [
    {
      id: 'recalculate_matrix',
      label: 'Recalculate Pricing From Matrix',
      description: 'Recalculate retail pricing for all unlocked parts using the markup matrix',
      icon: Calculator,
      color: 'text-blue-400',
    },
    {
      id: 'backfill_commitments',
      label: 'Backfill Commitment Pricing',
      description: 'Copy pricing from parts/assignments to commitments that are missing pricing snapshots',
      icon: RefreshCw,
      color: 'text-purple-400',
    },
    {
      id: 'apply_invoice_costs',
      label: 'Apply Vendor Invoice Costs',
      description: 'Update commitment costs from linked vendor invoice line items',
      icon: DollarSign,
      color: 'text-green-400',
    },
  ];
  
  const handleActionClick = (action) => {
    setCurrentAction(action);
    setShowConfirmDialog(true);
    setResult(null);
  };
  
  const executeAction = async () => {
    if (!currentAction) return;
    
    setIsProcessing(true);
    setResult(null);
    
    try {
      switch (currentAction.id) {
        case 'recalculate_matrix':
          await recalculateFromMatrix();
          break;
        case 'backfill_commitments':
          await backfillCommitmentPricing();
          break;
        case 'apply_invoice_costs':
          await applyInvoiceCosts();
          break;
      }
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['partBuildAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['partCommitments'] });
      
    } catch (error) {
      setResult({ success: false, message: error.message, updated: 0 });
      toast.error('Action failed: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const recalculateFromMatrix = async () => {
    const unlockedAssignments = projectAssignments.filter(a => !a.pricing_locked);
    setProgress({ current: 0, total: unlockedAssignments.length, message: 'Recalculating pricing...' });
    
    let updated = 0;
    let skipped = 0;
    
    for (let i = 0; i < unlockedAssignments.length; i++) {
      const assignment = unlockedAssignments[i];
      const part = parts.find(p => p.id === assignment.part_id);
      const cost = assignment.default_cost || part?.default_cost || 0;
      
      if (cost <= 0) {
        skipped++;
        continue;
      }
      
      const tier = getMarkupFromMatrix(cost, matrixTiers);
      if (!tier) {
        skipped++;
        continue;
      }
      
      const unitRetail = calculateUnitRetail(cost, tier);
      
      await base44.entities.PartBuildAssignment.update(assignment.id, {
        default_cost: cost,
        unit_retail: unitRetail,
        applied_markup_pct: tier.markup_pct,
        pricing_source: 'matrix',
      });
      
      updated++;
      setProgress({ current: i + 1, total: unlockedAssignments.length, message: `Updated ${updated} of ${unlockedAssignments.length}...` });
    }
    
    setResult({ success: true, updated, skipped, message: `Updated ${updated} assignments, skipped ${skipped}` });
    toast.success(`Recalculated pricing for ${updated} parts`);
  };
  
  const backfillCommitmentPricing = async () => {
    const commitmentsNeedingPricing = projectCommitments.filter(c => 
      !c.unit_retail_snapshot || c.unit_retail_snapshot <= 0
    );
    
    setProgress({ current: 0, total: commitmentsNeedingPricing.length, message: 'Backfilling commitment pricing...' });
    
    let updated = 0;
    let skipped = 0;
    
    for (let i = 0; i < commitmentsNeedingPricing.length; i++) {
      const commitment = commitmentsNeedingPricing[i];
      const assignment = projectAssignments.find(a => a.part_id === commitment.part_id);
      const part = parts.find(p => p.id === commitment.part_id);
      
      let unitRetail = 0;
      let unitCost = 0;
      
      // Try assignment pricing first
      if (assignment) {
        unitRetail = assignment.pricing_locked && assignment.unit_retail_override 
          ? assignment.unit_retail_override 
          : assignment.unit_retail || 0;
        unitCost = assignment.default_cost || 0;
      }
      
      // Fallback to part defaults
      if (unitRetail <= 0 && part?.default_retail) {
        unitRetail = part.default_retail;
      }
      if (unitCost <= 0 && part?.default_cost) {
        unitCost = part.default_cost;
      }
      
      if (unitRetail <= 0) {
        skipped++;
        continue;
      }
      
      // Calculate margin
      let marginPct = null;
      if (unitRetail > 0 && unitCost > 0) {
        marginPct = ((unitRetail - unitCost) / unitRetail) * 100;
      }
      
      await base44.entities.PartCommitment.update(commitment.id, {
        unit_retail_snapshot: unitRetail,
        unit_cost_snapshot: unitCost || commitment.unit_cost_snapshot,
        margin_pct: marginPct,
        pricing_integrity_status: unitCost > 0 ? 'estimated_cost' : 'missing_cost',
      });
      
      updated++;
      setProgress({ current: i + 1, total: commitmentsNeedingPricing.length, message: `Updated ${updated} commitments...` });
    }
    
    setResult({ success: true, updated, skipped, message: `Backfilled ${updated} commitments, skipped ${skipped}` });
    toast.success(`Backfilled pricing for ${updated} commitments`);
  };
  
  const applyInvoiceCosts = async () => {
    // This would typically call the backend function
    // For now, show a placeholder
    toast.info('Invoice cost sync runs automatically via automation');
    setResult({ success: true, updated: 0, message: 'Invoice costs are synced automatically when invoices are created/updated' });
  };
  
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="border-gray-700 gap-2">
            <Wrench className="w-4 h-4" />
            Bulk Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700 w-64">
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.id}
              onClick={() => handleActionClick(action)}
              className="cursor-pointer"
            >
              <action.icon className={`w-4 h-4 mr-2 ${action.color}`} />
              <div className="flex-1">
                <div className="text-sm text-white">{action.label}</div>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="bg-gray-700" />
          <div className="px-2 py-1.5 text-xs text-gray-500">
            {projectAssignments.length} parts · {projectCommitments.length} commitments
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      
      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {currentAction && <currentAction.icon className={`w-5 h-5 ${currentAction.color}`} />}
              {currentAction?.label}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {currentAction?.description}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {isProcessing ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {progress.message}
                </div>
                <Progress value={(progress.current / Math.max(progress.total, 1)) * 100} className="h-2" />
                <div className="text-xs text-gray-500 text-center">
                  {progress.current} / {progress.total}
                </div>
              </div>
            ) : result ? (
              <Card className={result.success ? "bg-green-900/20 border-green-500/50" : "bg-red-900/20 border-red-500/50"}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {result.success ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
                    )}
                    <div>
                      <h3 className={`font-semibold ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                        {result.success ? 'Completed' : 'Failed'}
                      </h3>
                      <p className="text-sm text-gray-300 mt-1">{result.message}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="text-sm text-gray-400">
                <p>This action will process:</p>
                <ul className="mt-2 space-y-1 text-gray-300">
                  {currentAction?.id === 'recalculate_matrix' && (
                    <li>• {projectAssignments.filter(a => !a.pricing_locked).length} unlocked assignments</li>
                  )}
                  {currentAction?.id === 'backfill_commitments' && (
                    <li>• {projectCommitments.filter(c => !c.unit_retail_snapshot || c.unit_retail_snapshot <= 0).length} commitments missing pricing</li>
                  )}
                  {currentAction?.id === 'apply_invoice_costs' && (
                    <li>• Automatic sync via automation</li>
                  )}
                </ul>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowConfirmDialog(false)} 
              className="border-gray-700"
              disabled={isProcessing}
            >
              {result ? 'Close' : 'Cancel'}
            </Button>
            {!result && (
              <Button
                onClick={executeAction}
                disabled={isProcessing}
                className="bg-red-600 hover:bg-red-700"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Wrench className="w-4 h-4 mr-2" />
                )}
                Execute
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}