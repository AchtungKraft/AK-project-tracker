import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, AlertTriangle, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * BulkPOPreviewModal - Enhanced PO preview with:
 * - Expand/collapse vendor groups
 * - Per-line detail (part name, qty, unit_cost, commitment ref)
 * - Zero-cost line highlighting
 * - Blocked items section
 */
export default function BulkPOPreviewModal({ preview, onClose, onConfirm, isLoading }) {
  const vendorGroups = preview?.preview?.vendor_groups || [];
  const blocked = preview?.blocked || [];
  const summary = preview?.summary || {};

  // Track expanded groups
  const [expandedGroups, setExpandedGroups] = useState(
    () => new Set(vendorGroups.map((_, i) => i)) // all expanded by default
  );

  const toggleGroup = (idx) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // Count zero-cost items across all groups
  const zeroCostCount = vendorGroups.reduce((sum, g) => {
    return sum + (g.items || []).filter(i => (i.unit_cost ?? 0) <= 0).length;
  }, 0);

  const totalLineItems = vendorGroups.reduce((sum, g) => sum + (g.items?.length || g.commitment_count || 0), 0);
  const totalEstCost = vendorGroups.reduce((sum, g) => sum + (g.estimated_cost || 0), 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-green-400" />
            Create Purchase Orders
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-3 overflow-y-auto flex-1">
          {/* Zero-cost warning */}
          {zeroCostCount > 0 && (
            <div className="p-3 bg-amber-900/20 border border-amber-700/30 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-300">
                  {zeroCostCount} item(s) have no cost
                </p>
                <p className="text-xs text-amber-400/70">
                  PO lines with $0 cost will not update project pricing.
                </p>
              </div>
            </div>
          )}

          {/* Summary Grid */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-green-900/30 rounded-lg">
              <p className="text-2xl font-bold text-green-400">{summary.order_count || vendorGroups.length}</p>
              <p className="text-xs text-gray-400">POs to Create</p>
            </div>
            <div className="p-3 bg-blue-900/30 rounded-lg">
              <p className="text-2xl font-bold text-blue-400">{totalLineItems}</p>
              <p className="text-xs text-gray-400">Line Items</p>
            </div>
            <div className="p-3 bg-indigo-900/30 rounded-lg">
              <p className="text-lg font-bold text-indigo-400 font-mono">{formatCurrencyUSD(totalEstCost)}</p>
              <p className="text-xs text-gray-400">Est. Total</p>
            </div>
          </div>

          {/* Vendor Groups — Collapsible */}
          {vendorGroups.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-300">Orders by Vendor</p>
                <button
                  className="text-xs text-gray-500 hover:text-gray-300"
                  onClick={() => {
                    const allExpanded = expandedGroups.size === vendorGroups.length;
                    setExpandedGroups(allExpanded ? new Set() : new Set(vendorGroups.map((_, i) => i)));
                  }}
                >
                  {expandedGroups.size === vendorGroups.length ? 'Collapse All' : 'Expand All'}
                </button>
              </div>

              {vendorGroups.map((group, idx) => {
                const isExpanded = expandedGroups.has(idx);
                const items = group.items || [];
                const groupZeroCost = items.filter(i => (i.unit_cost ?? 0) <= 0).length;

                return (
                  <div key={idx} className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                    {/* Group Header — Clickable */}
                    <button
                      onClick={() => toggleGroup(idx)}
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-800/70 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        }
                        <span className="text-white font-medium truncate">{group.vendor_name}</span>
                        {groupZeroCost > 0 && (
                          <Badge className="bg-red-900/40 text-red-400 border-red-700 text-[9px] px-1 py-0">
                            {groupZeroCost} NO COST
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant="outline" className="border-green-600 text-green-400 text-[10px]">
                          {group.commitment_count || items.length} items
                        </Badge>
                        <span className="text-sm font-mono text-gray-300">
                          {formatCurrencyUSD(group.estimated_cost || 0)}
                        </span>
                      </div>
                    </button>

                    {/* Expanded Line Items */}
                    {isExpanded && items.length > 0 && (
                      <div className="border-t border-gray-700/50 px-3 pb-2 pt-1 space-y-0.5">
                        {/* Header row */}
                        <div className="flex items-center text-[9px] uppercase tracking-wider text-gray-500 py-1">
                          <span className="flex-1">Part</span>
                          <span className="w-12 text-right">Qty</span>
                          <span className="w-24 text-right">Unit Cost</span>
                          <span className="w-24 text-right">Ext. Cost</span>
                        </div>
                        {items.map((item, i) => {
                          const isZeroCost = (item.unit_cost ?? 0) <= 0;
                          return (
                            <div
                              key={i}
                              className={cn(
                                "flex items-center text-xs py-1 rounded px-1",
                                isZeroCost ? "bg-red-900/20" : "hover:bg-gray-700/30"
                              )}
                            >
                              <span className={cn(
                                "flex-1 truncate",
                                isZeroCost ? "text-red-400" : "text-gray-300"
                              )}>
                                {item.part_name || 'Unknown'}
                              </span>
                              <span className="w-12 text-right font-mono text-gray-400">
                                {item.qty || 0}
                              </span>
                              <span className={cn(
                                "w-24 text-right font-mono",
                                isZeroCost ? "text-red-400 font-bold" : "text-emerald-400"
                              )}>
                                {isZeroCost ? 'COST MISSING' : formatCurrencyUSD(item.unit_cost)}
                              </span>
                              <span className={cn(
                                "w-24 text-right font-mono",
                                isZeroCost ? "text-red-400/60" : "text-gray-400"
                              )}>
                                {isZeroCost ? '-' : formatCurrencyUSD((item.unit_cost || 0) * (item.qty || 0))}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Blocked Items */}
          {blocked.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-yellow-400 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                Blocked Items ({blocked.length}):
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {blocked.map((item, idx) => (
                  <div key={idx} className="p-2 bg-yellow-900/20 rounded text-sm">
                    <span className="text-white">{item.part_name || 'Unknown Part'}</span>
                    <span className="text-yellow-400 ml-2">— {item.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t border-gray-800">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading || vendorGroups.length === 0}
            className={zeroCostCount > 0 ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700"}
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 mr-2" />
                {zeroCostCount > 0 
                  ? `Create Anyway (${zeroCostCount} $0)` 
                  : `Create ${vendorGroups.length} PO(s)`
                }
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}