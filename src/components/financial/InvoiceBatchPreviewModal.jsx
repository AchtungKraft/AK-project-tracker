import React, { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  DollarSign, 
  FileText,
  Loader2,
  Wrench,
  Package,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Users,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import InvoiceConfidencePanel from "./InvoiceConfidencePanel";

// ============================================
// RISK LEVEL BADGE
// ============================================

function RiskLevelBadge({ level }) {
  const config = {
    LOW: { icon: ShieldCheck, color: 'bg-green-600/20 text-green-400 border-green-600/30', label: 'Low Risk' },
    MEDIUM: { icon: ShieldAlert, color: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30', label: 'Medium Risk' },
    HIGH: { icon: AlertTriangle, color: 'bg-red-600/20 text-red-400 border-red-600/30', label: 'High Risk' },
  }[level] || { icon: AlertCircle, color: 'bg-gray-600/20 text-gray-400', label: 'Unknown' };
  
  const Icon = config.icon;
  
  return (
    <Badge className={cn("gap-1 border", config.color)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

// ============================================
// RISK INDICATORS
// ============================================

function RiskIndicators({ items }) {
  const risks = useMemo(() => {
    const result = [];
    
    const hasEstimatedCost = items.some(i => i.pricing_integrity_status === 'estimated_cost');
    const hasMissingVendorCost = items.some(i => !i.actual_unit_cost && i.unit_cost_snapshot);
    const hasMixedTypes = new Set(items.map(i => i.part_type)).size > 1;
    const hasNegativeMargin = items.some(i => (i.margin_pct || 0) < 0);
    const hasArchivedParts = items.some(i => i.is_archived);
    
    if (hasEstimatedCost) result.push({ icon: AlertCircle, label: 'Estimated Cost Used', color: 'text-yellow-400' });
    if (hasMissingVendorCost) result.push({ icon: DollarSign, label: 'Missing Vendor Cost', color: 'text-orange-400' });
    if (hasMixedTypes) result.push({ icon: Package, label: 'Mixed Part Types', color: 'text-blue-400' });
    if (hasNegativeMargin) result.push({ icon: TrendingDown, label: 'Negative Margin', color: 'text-red-400' });
    if (hasArchivedParts) result.push({ icon: AlertTriangle, label: 'Archived Parts', color: 'text-red-400' });
    
    return result;
  }, [items]);
  
  if (risks.length === 0) {
    return (
      <div className="flex items-center gap-2 text-green-400 text-sm">
        <CheckCircle2 className="w-4 h-4" />
        No risk indicators detected
      </div>
    );
  }
  
  return (
    <div className="flex flex-wrap gap-2">
      {risks.map((risk, idx) => {
        const Icon = risk.icon;
        return (
          <Badge key={idx} variant="outline" className={cn("gap-1 border-gray-700", risk.color)}>
            <Icon className="w-3 h-3" />
            {risk.label}
          </Badge>
        );
      })}
    </div>
  );
}

// ============================================
// BLOCKED ITEMS TABLE
// ============================================

function BlockedItemsTable({ items, onFixItem }) {
  if (!items || items.length === 0) return null;
  
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-red-400 flex items-center gap-2">
        <XCircle className="w-4 h-4" />
        Blocked Items ({items.length})
      </h4>
      <div className="bg-red-950/20 border border-red-900/30 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-red-900/30 hover:bg-transparent">
              <TableHead className="text-red-300 text-xs">Part</TableHead>
              <TableHead className="text-red-300 text-xs">Reason</TableHead>
              <TableHead className="text-red-300 text-xs">Stage</TableHead>
              <TableHead className="text-red-300 text-xs w-24">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, idx) => (
              <TableRow key={idx} className="border-b border-red-900/20 hover:bg-red-950/30">
                <TableCell className="text-white text-sm">
                  <div>
                    <p>{item.part_name}</p>
                    <p className="text-xs text-gray-500">{item.project_name}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {(item.reasons || []).map((reason, ridx) => (
                      <Badge key={ridx} className="bg-red-600/30 text-red-300 text-xs">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-gray-400 text-xs">
                  {item.lifecycle_stage || 'Unknown'}
                </TableCell>
                <TableCell>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-7 text-xs border-red-700 text-red-300 hover:bg-red-950"
                    onClick={() => onFixItem(item)}
                  >
                    <Wrench className="w-3 h-3 mr-1" />
                    Fix
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ============================================
// INCLUDED ITEMS TABLE
// ============================================

function IncludedItemsTable({ items }) {
  if (!items || items.length === 0) return null;
  
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-green-400 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4" />
        Items to Invoice ({items.length})
      </h4>
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
        <ScrollArea className="max-h-[250px]">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-700 hover:bg-transparent">
                <TableHead className="text-gray-400 text-xs">Project</TableHead>
                <TableHead className="text-gray-400 text-xs">Part</TableHead>
                <TableHead className="text-gray-400 text-xs text-right">Qty</TableHead>
                <TableHead className="text-gray-400 text-xs text-right">Unit</TableHead>
                <TableHead className="text-gray-400 text-xs text-right">Total</TableHead>
                <TableHead className="text-gray-400 text-xs text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => {
                const qty = item.assigned_qty || item.qty || 1;
                const unitPrice = item.unit_retail || item.unit_price || 0;
                const lineTotal = qty * unitPrice;
                const margin = item.margin_pct || 0;
                
                return (
                  <TableRow key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <TableCell className="text-blue-400 text-sm">
                      {item.project_name}
                    </TableCell>
                    <TableCell className="text-white text-sm">
                      {item.part_name}
                    </TableCell>
                    <TableCell className="text-right text-gray-300 text-sm">
                      {qty}
                    </TableCell>
                    <TableCell className="text-right text-gray-300 text-sm">
                      ${unitPrice.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-green-400 font-medium text-sm">
                      ${lineTotal.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn(
                        "text-sm",
                        margin < 0 ? "text-red-400" : margin > 30 ? "text-green-400" : "text-yellow-400"
                      )}>
                        {margin > 0 ? '+' : ''}{margin.toFixed(0)}%
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  );
}

// ============================================
// CLIENT GROUPING PREVIEW
// ============================================

function ClientGroupingPreview({ items, batchMode }) {
  const groups = useMemo(() => {
    const result = {};
    
    items.forEach(item => {
      let key;
      switch (batchMode) {
        case 'BY_CLIENT':
          key = item.client_name || 'Unknown Client';
          break;
        case 'BY_PROJECT':
          key = item.project_name || 'Unknown Project';
          break;
        default:
          key = 'Single Batch';
      }
      
      if (!result[key]) {
        result[key] = { items: [], total: 0 };
      }
      result[key].items.push(item);
      result[key].total += (item.assigned_qty || 1) * (item.unit_retail || 0);
    });
    
    return result;
  }, [items, batchMode]);
  
  const Icon = batchMode === 'BY_CLIENT' ? Users : batchMode === 'BY_PROJECT' ? FolderOpen : FileText;
  
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
        <Icon className="w-4 h-4" />
        Batch Grouping ({Object.keys(groups).length} batch{Object.keys(groups).length !== 1 ? 'es' : ''})
      </h4>
      <div className="grid gap-2">
        {Object.entries(groups).map(([name, data]) => (
          <div 
            key={name}
            className="flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg border border-gray-700"
          >
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-gray-500" />
              <span className="text-white text-sm">{name}</span>
              <Badge variant="outline" className="text-xs">{data.items.length} items</Badge>
            </div>
            <span className="text-green-400 font-medium">${data.total.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// FINANCIAL SUMMARY
// ============================================

function FinancialSummary({ items }) {
  const summary = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;
    let pricingComplete = 0;
    let pricingIncomplete = 0;
    
    items.forEach(item => {
      const qty = item.assigned_qty || item.qty || 1;
      const retail = item.unit_retail || item.unit_price || 0;
      const cost = item.actual_unit_cost || item.unit_cost_snapshot || 0;
      
      totalRevenue += qty * retail;
      totalCost += qty * cost;
      
      if (retail > 0) pricingComplete++;
      else pricingIncomplete++;
    });
    
    const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
    const integrityScore = items.length > 0 ? Math.round((pricingComplete / items.length) * 100) : 0;
    
    return { totalRevenue, totalCost, margin, integrityScore, pricingComplete, pricingIncomplete };
  }, [items]);
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="bg-green-950/30 border border-green-900/30 rounded-lg p-3">
        <p className="text-xs text-green-400 mb-1">Total Invoice Value</p>
        <p className="text-xl font-bold text-green-400">${summary.totalRevenue.toFixed(2)}</p>
      </div>
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
        <p className="text-xs text-gray-400 mb-1">Estimated Cost</p>
        <p className="text-xl font-bold text-gray-300">${summary.totalCost.toFixed(2)}</p>
      </div>
      <div className={cn(
        "border rounded-lg p-3",
        summary.margin < 0 ? "bg-red-950/30 border-red-900/30" : 
        summary.margin < 20 ? "bg-yellow-950/30 border-yellow-900/30" : 
        "bg-green-950/30 border-green-900/30"
      )}>
        <p className="text-xs text-gray-400 mb-1">Est. Margin</p>
        <p className={cn(
          "text-xl font-bold flex items-center gap-1",
          summary.margin < 0 ? "text-red-400" : summary.margin < 20 ? "text-yellow-400" : "text-green-400"
        )}>
          {summary.margin < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
          {summary.margin.toFixed(1)}%
        </p>
      </div>
      <div className={cn(
        "border rounded-lg p-3",
        summary.integrityScore === 100 ? "bg-green-950/30 border-green-900/30" : 
        summary.integrityScore >= 80 ? "bg-yellow-950/30 border-yellow-900/30" : 
        "bg-red-950/30 border-red-900/30"
      )}>
        <p className="text-xs text-gray-400 mb-1">Pricing Integrity</p>
        <p className={cn(
          "text-xl font-bold",
          summary.integrityScore === 100 ? "text-green-400" : 
          summary.integrityScore >= 80 ? "text-yellow-400" : "text-red-400"
        )}>
          {summary.integrityScore}%
        </p>
      </div>
    </div>
  );
}

// ============================================
// MAIN MODAL
// ============================================

export default function InvoiceBatchPreviewModal({
  isOpen,
  onClose,
  selectedItems,
  blockedItems = [],
  batchMode,
  onConfirm,
  onFixItem,
  isCreating,
}) {
  // Calculate overall risk level
  const riskLevel = useMemo(() => {
    if (!selectedItems || selectedItems.length === 0) return 'HIGH';
    
    const hasNegativeMargin = selectedItems.some(i => (i.margin_pct || 0) < 0);
    const hasMissingPricing = selectedItems.some(i => !(i.unit_retail || i.unit_price));
    const hasArchived = selectedItems.some(i => i.is_archived);
    
    if (hasMissingPricing || hasNegativeMargin || hasArchived || blockedItems.length > selectedItems.length) {
      return 'HIGH';
    }
    
    const hasEstimatedCost = selectedItems.some(i => i.pricing_integrity_status === 'estimated_cost');
    const hasMissingVendorCost = selectedItems.some(i => !i.actual_unit_cost);
    
    if (hasEstimatedCost || hasMissingVendorCost || blockedItems.length > 0) {
      return 'MEDIUM';
    }
    
    return 'LOW';
  }, [selectedItems, blockedItems]);

  // Ready items (excluding blocked)
  const readyItems = useMemo(() => {
    return selectedItems.filter(item => (item.unit_retail || item.unit_price || 0) > 0);
  }, [selectedItems]);

  // Can confirm?
  const canConfirm = readyItems.length > 0 && !isCreating;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-gray-900 border-gray-700 overflow-hidden flex flex-col">
        <DialogHeader className="border-b border-gray-800 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
                <FileText className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <DialogTitle className="text-xl text-white">Invoice Batch Preview</DialogTitle>
                <p className="text-sm text-gray-400 mt-0.5">
                  Review items before creating invoice batch
                </p>
              </div>
            </div>
            <RiskLevelBadge level={riskLevel} />
          </div>
        </DialogHeader>
        
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            {/* Risk Indicators */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-300">Risk Assessment</h4>
              <RiskIndicators items={readyItems} />
            </div>
            
            <Separator className="bg-gray-800" />
            
            {/* Financial Summary */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-300">Financial Summary</h4>
              <FinancialSummary items={readyItems} />
            </div>
            
            <Separator className="bg-gray-800" />
            
            {/* Blocked Items */}
            {blockedItems.length > 0 && (
              <>
                <BlockedItemsTable items={blockedItems} onFixItem={onFixItem} />
                <Separator className="bg-gray-800" />
              </>
            )}
            
            {/* Included Items */}
            <IncludedItemsTable items={readyItems} />
            
            <Separator className="bg-gray-800" />
            
            {/* Client Grouping */}
            <ClientGroupingPreview items={readyItems} batchMode={batchMode} />
            
            <Separator className="bg-gray-800" />
            
            {/* Confidence Panel */}
            <InvoiceConfidencePanel items={readyItems} />
          </div>
        </ScrollArea>
        
        <DialogFooter className="border-t border-gray-800 pt-4 gap-2">
          <div className="flex-1 text-sm text-gray-400">
            {readyItems.length} of {selectedItems.length} items ready
            {blockedItems.length > 0 && (
              <span className="text-red-400 ml-2">• {blockedItems.length} blocked</span>
            )}
          </div>
          <Button variant="outline" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          {blockedItems.length > 0 && (
            <Button 
              variant="outline" 
              className="border-yellow-700 text-yellow-400 hover:bg-yellow-950"
              onClick={() => onFixItem(blockedItems[0])}
              disabled={isCreating}
            >
              <Wrench className="w-4 h-4 mr-2" />
              Fix Issues ({blockedItems.length})
            </Button>
          )}
          <Button 
            onClick={onConfirm}
            disabled={!canConfirm}
            className="bg-green-600 hover:bg-green-700"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Confirm Invoice Batch ({readyItems.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}