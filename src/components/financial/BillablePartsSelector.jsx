import React, { useState, useMemo, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Building2,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { useBillingAndProcurementStates } from "./useFinancialProjectsView";

/**
 * PHASE 3 — Billable Parts Selector with Vendor → Category Hierarchy
 * 
 * CANONICAL data source: getBillingAndProcurementStates(projectId)
 * 
 * GROUPING HIERARCHY:
 *   Vendor
 *     └── Category
 *           └── Parts
 * 
 * FILTER: net_exposure > 0 AND is_archived !== true
 * 
 * CANONICAL FIELDS from backend:
 * - invoice_status ('unbilled'|'invoiced'|'paid')
 * - OR client_billing_status ('NOT_INVOICED'|'INVOICED'|'PAID')
 * - net_exposure, gross_exposure, credit_applied
 * - required_total, unit_retail_snapshot
 * - vendor_name, category_name
 */

/**
 * Group commitments by Vendor → Category hierarchy
 */
function groupByVendorThenCategory(items) {
  const vendorMap = {};
  
  for (const item of items) {
    const vendorKey = item.vendor_name || 'Unassigned Vendor';
    const categoryKey = item.category_name || 'Uncategorized';
    
    if (!vendorMap[vendorKey]) {
      vendorMap[vendorKey] = {
        vendor_name: vendorKey,
        vendor_total: 0,
        categories: {},
      };
    }
    
    if (!vendorMap[vendorKey].categories[categoryKey]) {
      vendorMap[vendorKey].categories[categoryKey] = {
        category_name: categoryKey,
        category_total: 0,
        items: [],
      };
    }
    
    const netExposure = item.net_exposure ?? item.net_line_total ?? 0;
    const grossExposure = item.gross_exposure ?? item.gross_line_total ?? 0;
    const creditApplied = item.credit_applied ?? item.credit_applied_line ?? 0;
    const qty = item.required_total ?? item.assigned_qty ?? 1;
    const unitPrice = item.unit_retail_snapshot ?? item.unit_retail ?? 0;
    
    const formattedItem = {
      part_commitment_id: item.id,
      part_name: item.part_name || 'Unknown Part',
      part_id: item.part_id,
      qty_remaining_to_bill: qty,
      unit_price: unitPrice,
      remaining_to_bill: netExposure,
      gross_exposure: grossExposure,
      credit_applied: creditApplied,
      net_exposure: netExposure,
      vendor_name: vendorKey,
      category_name: categoryKey,
    };
    
    vendorMap[vendorKey].categories[categoryKey].items.push(formattedItem);
    vendorMap[vendorKey].categories[categoryKey].category_total += netExposure;
    vendorMap[vendorKey].vendor_total += netExposure;
  }
  
  // Convert to sorted arrays
  return Object.values(vendorMap)
    .sort((a, b) => a.vendor_name.localeCompare(b.vendor_name))
    .map(vendor => ({
      ...vendor,
      categories: Object.values(vendor.categories)
        .sort((a, b) => a.category_name.localeCompare(b.category_name))
        .map(cat => ({
          ...cat,
          items: cat.items.sort((a, b) => (a.part_name || '').localeCompare(b.part_name || '')),
        })),
    }));
}

export default function BillablePartsSelector({
  projectId,
  selectedItems,
  onSelectionChange,
  className,
}) {
  const [expandedVendors, setExpandedVendors] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});

  // CANONICAL: Use getBillingAndProcurementStates as single source
  const { data: billingData, isLoading, error } = useBillingAndProcurementStates(projectId);
  
  // Transform and filter canonical commitments
  const { vendorGroups, summary, contractWarning } = useMemo(() => {
    if (!billingData) return { vendorGroups: [], summary: null, contractWarning: null };
    
    const commitments = billingData.commitments || [];
    
    // DEV: Contract drift detection
    let warning = null;
    if (process.env.NODE_ENV === 'development' && commitments.length > 0) {
      const sample = commitments[0];
      console.log('[BillablePartsSelector] Sample fields:', Object.keys(sample));
    }
    
    // CANONICAL FILTER: net_exposure > 0 AND not archived
    const unbilledItems = commitments.filter(c => {
      // Skip archived
      if (c.is_archived === true) return false;
      
      // Must have positive exposure
      const netExposure = c.net_exposure ?? c.net_line_total ?? 0;
      const grossExposure = c.gross_exposure ?? c.gross_line_total ?? 0;
      if (netExposure <= 0 && grossExposure <= 0) return false;
      
      // Check invoice_status OR client_billing_status for unbilled
      const invoiceStatus = c.invoice_status;
      const billingStatus = c.billing_status || c.client_billing_status;
      
      const isUnbilled = 
        invoiceStatus === 'unbilled' || 
        billingStatus === 'NOT_INVOICED' ||
        billingStatus === 'not_invoiced' ||
        (!invoiceStatus && !billingStatus);
      
      return isUnbilled;
    });
    
    // DEV: Contract guard - warn if filter results are empty but data exists
    if (process.env.NODE_ENV === 'development' && commitments.length > 0 && unbilledItems.length === 0) {
      console.warn('[BillablePartsSelector] CONTRACT MISMATCH: Commitments exist but none pass filter');
      console.warn('First commitment:', JSON.stringify(commitments[0], null, 2));
      warning = 'Contract mismatch detected - see console';
    }
    
    // Group by Vendor → Category
    const grouped = groupByVendorThenCategory(unbilledItems);
    
    return {
      vendorGroups: grouped,
      summary: {
        total_items: unbilledItems.length,
        total_remaining_to_bill: unbilledItems.reduce((sum, i) => sum + (i.net_exposure ?? i.net_line_total ?? 0), 0),
      },
      contractWarning: warning,
    };
  }, [billingData]);
  
  // Auto-expand first vendor on load
  useEffect(() => {
    if (vendorGroups.length > 0 && Object.keys(expandedVendors).length === 0) {
      setExpandedVendors({ [vendorGroups[0].vendor_name]: true });
    }
  }, [vendorGroups]);

  const toggleVendor = (vendorName) => {
    setExpandedVendors(prev => ({ ...prev, [vendorName]: !prev[vendorName] }));
  };

  const toggleCategory = (vendorName, categoryName) => {
    const key = `${vendorName}::${categoryName}`;
    setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Selection handlers with canonical fields
  const handleToggleItem = (item, checked) => {
    if (checked) {
      onSelectionChange([
        ...selectedItems,
        {
          part_commitment_id: item.part_commitment_id,
          part_name: item.part_name,
          qty: item.qty_remaining_to_bill,
          unit_price: item.unit_price,
          line_total: item.net_exposure,
          gross_exposure: item.gross_exposure,
          credit_applied: item.credit_applied,
          net_exposure: item.net_exposure,
        },
      ]);
    } else {
      onSelectionChange(
        selectedItems.filter((s) => s.part_commitment_id !== item.part_commitment_id)
      );
    }
  };

  const handleUpdateQty = (commitmentId, qty) => {
    const numQty = parseFloat(qty) || 0;
    onSelectionChange(
      selectedItems.map((s) =>
        s.part_commitment_id === commitmentId
          ? { ...s, qty: numQty, line_total: numQty * s.unit_price }
          : s
      )
    );
  };

  // Bulk selection for all items in a category
  const handleSelectCategory = (categoryItems) => {
    const currentIds = new Set(selectedItems.map((s) => s.part_commitment_id));
    const newItems = categoryItems
      .filter((item) => !currentIds.has(item.part_commitment_id))
      .map((item) => ({
        part_commitment_id: item.part_commitment_id,
        part_name: item.part_name,
        qty: item.qty_remaining_to_bill,
        unit_price: item.unit_price,
        line_total: item.net_exposure,
        gross_exposure: item.gross_exposure,
        credit_applied: item.credit_applied,
        net_exposure: item.net_exposure,
      }));
    onSelectionChange([...selectedItems, ...newItems]);
  };

  const handleDeselectCategory = (categoryItems) => {
    const catIds = new Set(categoryItems.map((item) => item.part_commitment_id));
    onSelectionChange(selectedItems.filter((s) => !catIds.has(s.part_commitment_id)));
  };

  // Bulk selection for all items in a vendor
  const handleSelectVendor = (vendor) => {
    const allItems = vendor.categories.flatMap(c => c.items);
    handleSelectCategory(allItems);
  };

  const handleDeselectVendor = (vendor) => {
    const allItems = vendor.categories.flatMap(c => c.items);
    handleDeselectCategory(allItems);
  };

  // Check if item is selected
  const isItemSelected = (commitmentId) => {
    return selectedItems.some(s => s.part_commitment_id === commitmentId);
  };

  // Check if all items in a category are selected
  const isCategoryFullySelected = (categoryItems) => {
    return categoryItems.every(item => isItemSelected(item.part_commitment_id));
  };

  // Check if some items in a category are selected
  const isCategoryPartiallySelected = (categoryItems) => {
    const selected = categoryItems.filter(item => isItemSelected(item.part_commitment_id));
    return selected.length > 0 && selected.length < categoryItems.length;
  };

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500">
        Select a project to view billable parts
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-40 text-red-400">
        Failed to load billable parts
      </div>
    );
  }

  if (vendorGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-gray-500">
        <Package className="w-8 h-8 mb-2 opacity-50" />
        <p>No parts remaining to bill</p>
        {contractWarning && (
          <div className="mt-2 flex items-center gap-1 text-amber-400 text-xs">
            <AlertTriangle className="w-3 h-3" />
            {contractWarning}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Contract Warning (dev only) */}
      {contractWarning && (
        <div className="flex items-center gap-2 p-2 bg-amber-900/30 border border-amber-700 rounded-lg text-amber-300 text-xs">
          <AlertTriangle className="w-4 h-4" />
          {contractWarning}
        </div>
      )}

      {/* Summary Header */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">
          {summary?.total_items || 0} items • {formatCurrencyUSD(summary?.total_remaining_to_bill || 0)} total
        </span>
        <Badge variant="outline" className="text-xs">
          Vendor → Category
        </Badge>
      </div>

      {/* Vendor → Category → Parts Hierarchy */}
      <ScrollArea className="h-[400px] pr-2">
        <div className="space-y-2">
          {vendorGroups.map((vendor) => {
            const vendorExpanded = expandedVendors[vendor.vendor_name] ?? false;
            const allVendorItems = vendor.categories.flatMap(c => c.items);
            const vendorFullySelected = allVendorItems.every(i => isItemSelected(i.part_commitment_id));
            const vendorPartiallySelected = !vendorFullySelected && allVendorItems.some(i => isItemSelected(i.part_commitment_id));

            return (
              <div key={vendor.vendor_name} className="border border-gray-700 rounded-lg overflow-hidden">
                {/* Vendor Header */}
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 bg-gray-800/50 cursor-pointer hover:bg-gray-800",
                    vendorExpanded && "border-b border-gray-700"
                  )}
                  onClick={() => toggleVendor(vendor.vendor_name)}
                >
                  {vendorExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                  <Checkbox
                    checked={vendorFullySelected}
                    ref={el => { if (el && vendorPartiallySelected) el.dataset.state = 'indeterminate'; }}
                    onCheckedChange={(checked) => {
                      if (checked) handleSelectVendor(vendor);
                      else handleDeselectVendor(vendor);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="data-[state=indeterminate]:bg-blue-600/50"
                  />
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <span className="font-medium text-white flex-1">{vendor.vendor_name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {vendor.categories.reduce((sum, c) => sum + c.items.length, 0)} parts
                  </Badge>
                  <span className="text-sm font-medium text-emerald-400">
                    {formatCurrencyUSD(vendor.vendor_total)}
                  </span>
                </div>

                {/* Categories within Vendor */}
                {vendorExpanded && (
                  <div className="bg-gray-900/30">
                    {vendor.categories.map((category) => {
                      const catKey = `${vendor.vendor_name}::${category.category_name}`;
                      const catExpanded = expandedCategories[catKey] ?? true;
                      const catFullySelected = isCategoryFullySelected(category.items);
                      const catPartiallySelected = isCategoryPartiallySelected(category.items);

                      return (
                        <div key={catKey} className="border-t border-gray-800 first:border-t-0">
                          {/* Category Header */}
                          <div
                            className="flex items-center gap-2 px-6 py-1.5 bg-gray-800/30 cursor-pointer hover:bg-gray-800/50"
                            onClick={() => toggleCategory(vendor.vendor_name, category.category_name)}
                          >
                            {catExpanded ? (
                              <ChevronDown className="w-3 h-3 text-gray-500" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-gray-500" />
                            )}
                            <Checkbox
                              checked={catFullySelected}
                              ref={el => { if (el && catPartiallySelected) el.dataset.state = 'indeterminate'; }}
                              onCheckedChange={(checked) => {
                                if (checked) handleSelectCategory(category.items);
                                else handleDeselectCategory(category.items);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-3.5 w-3.5"
                            />
                            <Layers className="w-3 h-3 text-purple-400" />
                            <span className="text-sm text-gray-300 flex-1">{category.category_name}</span>
                            <span className="text-xs text-gray-500">{category.items.length}</span>
                            <span className="text-xs text-emerald-400/70">
                              {formatCurrencyUSD(category.category_total)}
                            </span>
                          </div>

                          {/* Parts within Category */}
                          {catExpanded && (
                            <div className="divide-y divide-gray-800/50">
                              {category.items.map((item) => {
                                const selected = isItemSelected(item.part_commitment_id);
                                const selectedItem = selectedItems.find(
                                  (s) => s.part_commitment_id === item.part_commitment_id
                                );

                                return (
                                  <div
                                    key={item.part_commitment_id}
                                    className={cn(
                                      "flex items-center gap-3 px-8 py-2 transition-colors",
                                      selected ? "bg-blue-900/20" : "hover:bg-gray-800/30"
                                    )}
                                  >
                                    <Checkbox
                                      checked={selected}
                                      onCheckedChange={(checked) => handleToggleItem(item, checked)}
                                    />
                                    <Package className="w-4 h-4 text-gray-500" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-white truncate">{item.part_name}</p>
                                      <p className="text-xs text-gray-500">
                                        {item.qty_remaining_to_bill} × {formatCurrencyUSD(item.unit_price)}
                                      </p>
                                    </div>
                                    {selected && (
                                      <Input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={selectedItem?.qty || item.qty_remaining_to_bill}
                                        onChange={(e) =>
                                          handleUpdateQty(item.part_commitment_id, e.target.value)
                                        }
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-20 h-7 text-sm text-center bg-gray-800 border-gray-700"
                                      />
                                    )}
                                    <span
                                      className={cn(
                                        "text-sm font-medium",
                                        selected ? "text-emerald-400" : "text-gray-400"
                                      )}
                                    >
                                      {formatCurrencyUSD(item.net_exposure)}
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
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm truncate">{item.part_name}</p>
                              <p className="text-xs text-gray-500">
                                {item.qty_remaining_to_bill} × {formatCurrencyUSD(item.unit_price)}
                                {/* PHASE 2: Show credit applied inline */}
                                {item.credit_applied > 0 && (
                                  <span className="ml-2 text-green-400">
                                    (−{formatCurrencyUSD(item.credit_applied)} credit)
                                  </span>
                                )}
                              </p>
                            </div>
                            {isSelected && (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={0.01}
                                  max={item.qty_remaining_to_bill}
                                  step="any"
                                  value={selectedData?.qty ?? item.qty_remaining_to_bill}
                                  onChange={(e) =>
                                    handleUpdateQty(item.part_commitment_id, e.target.value)
                                  }
                                  className="w-20 h-8 text-right text-sm"
                                />
                                <span className="text-sm font-mono text-gray-400 w-24 text-right">
                                  {formatCurrencyUSD(selectedData?.net_exposure || selectedData?.line_total || 0)}
                                </span>
                              </div>
                            )}
                            {!isSelected && (
                              <span className="text-sm font-mono text-gray-500 w-24 text-right">
                                {formatCurrencyUSD(item.net_exposure)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}