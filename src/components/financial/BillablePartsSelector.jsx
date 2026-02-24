import React, { useState, useMemo, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
 * PHASE 3 — Billable Parts Selector with Vendor → Category → Parts Hierarchy
 * 
 * CANONICAL data source: getBillingAndProcurementStates(projectId)
 * 
 * GROUPING HIERARCHY:
 *   Vendor (alphabetical, "Unknown Vendor" last)
 *     └── Category (alphabetical, "Uncategorized" last)
 *           └── Parts (by part_name, then commitment_id for stability)
 * 
 * SELECTION PAYLOAD CONTRACT:
 *   {
 *     part_commitment_id,
 *     part_id,
 *     part_name,
 *     vendor_id, vendor_name,
 *     category_id, category_name,
 *     qty: qty_remaining_to_bill,
 *     unit_price: unit_retail_snapshot,
 *     gross_exposure,
 *     credit_applied,
 *     net_exposure
 *   }
 */

// Contract drift detection - PHASE 3 CANONICAL
function validateItemContract(item, index) {
  const required = ['id', 'part_id', 'part_name'];
  const groupingFields = ['vendor_id', 'vendor_name', 'category_id', 'category_name'];
  const financialFields = ['gross_exposure', 'net_exposure', 'unit_retail'];
  const missing = [];
  
  for (const field of required) {
    if (!item[field]) missing.push(field);
  }
  
  // Warn about missing fields in dev
  if (process.env.NODE_ENV === 'development') {
    const missingGrouping = groupingFields.filter(f => !item[f]);
    const missingFinancial = financialFields.filter(f => item[f] === undefined);
    
    if (missingGrouping.length > 0) {
      console.error(
        `[BillablePartsSelector] GROUPING CONTRACT VIOLATION - Item ${item.id || index} missing:`,
        missingGrouping,
        'Item data:', { id: item.id, part_name: item.part_name, vendor_id: item.vendor_id, category_id: item.category_id }
      );
    }
    
    if (missingFinancial.length > 0) {
      console.warn(
        `[BillablePartsSelector] Item ${item.id || index} missing financial fields:`,
        missingFinancial
      );
    }
  }
  
  return missing.length === 0;
}

function groupByVendorThenCategory(items) {
  const vendorMap = {};
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Validate contract
    if (!validateItemContract(item, i)) continue;
    
    // Get vendor info with fallbacks
    const vendorId = item.vendor_id || item.default_vendor_id || 'unknown';
    const vendorName = item.vendor_name || 'Unknown Vendor';
    const vendorKey = `${vendorId}::${vendorName}`;
    
    // Get category info with fallbacks  
    const categoryId = item.category_id || item.part_category_id || 'uncategorized';
    const categoryName = item.category_name || 'Uncategorized';
    const categoryKey = `${categoryId}::${categoryName}`;
    
    if (!vendorMap[vendorKey]) {
      vendorMap[vendorKey] = {
        vendor_id: vendorId,
        vendor_name: vendorName,
        vendor_total: 0,
        categories: {},
      };
    }
    
    if (!vendorMap[vendorKey].categories[categoryKey]) {
      vendorMap[vendorKey].categories[categoryKey] = {
        category_id: categoryId,
        category_name: categoryName,
        category_total: 0,
        items: [],
      };
    }
    
    // Extract canonical financial values
    const netExposure = item.net_exposure ?? item.net_line_total ?? 0;
    const grossExposure = item.gross_exposure ?? item.gross_line_total ?? 0;
    const creditApplied = item.credit_applied ?? item.credit_applied_line ?? 0;
    const qty = item.qty_remaining_to_bill ?? item.required_total ?? item.assigned_qty ?? 1;
    const unitPrice = item.unit_retail_snapshot ?? item.unit_retail ?? 0;
    
    const formattedItem = {
      part_commitment_id: item.id,
      part_id: item.part_id,
      part_name: item.part_name || 'Unknown Part',
      vendor_id: vendorId,
      vendor_name: vendorName,
      category_id: categoryId,
      category_name: categoryName,
      qty_remaining_to_bill: qty,
      unit_price: unitPrice,
      gross_exposure: grossExposure,
      credit_applied: creditApplied,
      net_exposure: netExposure,
      // CANONICAL: Pass through eligibility contract from backend
      canInvoice: item.allowed?.canInvoice ?? true,
      invoice_block_reason_code: item.invoice_block_reason_code,
      invoice_block_reason_text: item.invoice_block_reason_text,
      invoice_warning_code: item.invoice_warning_code,
      invoice_warning_text: item.invoice_warning_text,
      billing_state: item.billing_state,
    };
    
    vendorMap[vendorKey].categories[categoryKey].items.push(formattedItem);
    vendorMap[vendorKey].categories[categoryKey].category_total += netExposure;
    vendorMap[vendorKey].vendor_total += netExposure;
  }
  
  // Sort vendors: alphabetical, "Unknown Vendor" last
  const sortVendors = (a, b) => {
    if (a.vendor_name === 'Unknown Vendor') return 1;
    if (b.vendor_name === 'Unknown Vendor') return -1;
    return a.vendor_name.localeCompare(b.vendor_name);
  };
  
  // Sort categories: alphabetical, "Uncategorized" last
  const sortCategories = (a, b) => {
    if (a.category_name === 'Uncategorized') return 1;
    if (b.category_name === 'Uncategorized') return -1;
    return a.category_name.localeCompare(b.category_name);
  };
  
  // Sort items: by part_name, then commitment_id for stability
  const sortItems = (a, b) => {
    const nameCompare = (a.part_name || '').localeCompare(b.part_name || '');
    if (nameCompare !== 0) return nameCompare;
    return (a.part_commitment_id || '').localeCompare(b.part_commitment_id || '');
  };
  
  return Object.values(vendorMap)
    .sort(sortVendors)
    .map(vendor => ({
      ...vendor,
      categories: Object.values(vendor.categories)
        .sort(sortCategories)
        .map(cat => ({
          ...cat,
          items: cat.items.sort(sortItems),
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
  const [searchTerm, setSearchTerm] = useState("");

  // DETERMINISTIC: Normalize project ID
  const normalizedProjectId = projectId ? String(projectId) : "";

  const { data: billingData, isLoading, error } = useBillingAndProcurementStates(normalizedProjectId);
  
  const { vendorGroups, summary, contractWarning, allItems } = useMemo(() => {
    if (!billingData) return { vendorGroups: [], summary: null, contractWarning: null, allItems: [] };
    
    const commitments = billingData.commitments || [];
    let warning = null;
    
    // CANONICAL: Filter by billing_state = NOT_INVOICED only (use backend canonical field)
    // We show all items but mark eligibility via allowed.canInvoice from backend
    const unbilledItems = commitments.filter(c => {
      // Only show items with billing_state = NOT_INVOICED
      const billingState = c.billing_state || 'NOT_INVOICED';
      return billingState === 'NOT_INVOICED';
    });
    
    if (commitments.length > 0 && unbilledItems.length === 0) {
      warning = 'No unbilled items found';
    }
    
    const grouped = groupByVendorThenCategory(unbilledItems);
    
    return {
      vendorGroups: grouped,
      summary: {
        total_items: unbilledItems.length,
        total_remaining_to_bill: unbilledItems.reduce((sum, i) => sum + (i.outstanding_retail_amount ?? i.net_exposure ?? i.net_line_total ?? 0), 0),
      },
      contractWarning: warning,
      allItems: unbilledItems,
    };
  }, [billingData]);
  
  // Auto-expand first vendor
  useEffect(() => {
    if (vendorGroups.length > 0 && Object.keys(expandedVendors).length === 0) {
      const firstVendorKey = `${vendorGroups[0].vendor_id}::${vendorGroups[0].vendor_name}`;
      setExpandedVendors({ [firstVendorKey]: true });
      
      // Also expand first category
      if (vendorGroups[0].categories.length > 0) {
        const firstCatKey = `${firstVendorKey}::${vendorGroups[0].categories[0].category_id}`;
        setExpandedCategories({ [firstCatKey]: true });
      }
    }
  }, [vendorGroups]);

  const toggleVendor = (vendorId, vendorName) => {
    const key = `${vendorId}::${vendorName}`;
    setExpandedVendors(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCategory = (vendorId, vendorName, categoryId) => {
    const key = `${vendorId}::${vendorName}::${categoryId}`;
    setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Selection handlers - emit canonical payload
  const handleToggleItem = (item, checked) => {
    const payload = {
      part_commitment_id: item.part_commitment_id,
      part_id: item.part_id,
      part_name: item.part_name,
      vendor_id: item.vendor_id,
      vendor_name: item.vendor_name,
      category_id: item.category_id,
      category_name: item.category_name,
      qty: item.qty_remaining_to_bill,
      unit_price: item.unit_price,
      line_total: item.net_exposure,
      gross_exposure: item.gross_exposure,
      credit_applied: item.credit_applied,
      net_exposure: item.net_exposure,
    };
    
    if (checked) {
      onSelectionChange([...selectedItems, payload]);
    } else {
      onSelectionChange(selectedItems.filter(s => s.part_commitment_id !== item.part_commitment_id));
    }
  };

  const handleSelectCategory = (categoryItems) => {
    const currentIds = new Set(selectedItems.map(s => s.part_commitment_id));
    // CANONICAL: Only select items that are eligible (canInvoice === true)
    const newItems = categoryItems
      .filter(item => !currentIds.has(item.part_commitment_id) && item.canInvoice !== false)
      .map(item => ({
        part_commitment_id: item.part_commitment_id,
        part_id: item.part_id,
        part_name: item.part_name,
        vendor_id: item.vendor_id,
        vendor_name: item.vendor_name,
        category_id: item.category_id,
        category_name: item.category_name,
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
    const catIds = new Set(categoryItems.map(item => item.part_commitment_id));
    onSelectionChange(selectedItems.filter(s => !catIds.has(s.part_commitment_id)));
  };

  const handleSelectVendor = (vendor) => {
    const allItems = vendor.categories.flatMap(c => c.items);
    handleSelectCategory(allItems);
  };

  const handleDeselectVendor = (vendor) => {
    const allItems = vendor.categories.flatMap(c => c.items);
    handleDeselectCategory(allItems);
  };

  const isItemSelected = (commitmentId) => {
    return selectedItems.some(s => s.part_commitment_id === commitmentId);
  };

  // CANONICAL: Only count eligible items for selection state
  const getEligibleItems = (items) => items.filter(item => item.canInvoice !== false);
  
  const isCategoryFullySelected = (categoryItems) => {
    const eligible = getEligibleItems(categoryItems);
    return eligible.length > 0 && eligible.every(item => isItemSelected(item.part_commitment_id));
  };

  const isCategoryPartiallySelected = (categoryItems) => {
    const eligible = getEligibleItems(categoryItems);
    const selected = eligible.filter(item => isItemSelected(item.part_commitment_id));
    return selected.length > 0 && selected.length < eligible.length;
  };

  const isVendorFullySelected = (vendor) => {
    const allItems = vendor.categories.flatMap(c => c.items);
    const eligible = getEligibleItems(allItems);
    return eligible.length > 0 && eligible.every(item => isItemSelected(item.part_commitment_id));
  };

  const isVendorPartiallySelected = (vendor) => {
    const allItems = vendor.categories.flatMap(c => c.items);
    const eligible = getEligibleItems(allItems);
    const selected = eligible.filter(item => isItemSelected(item.part_commitment_id));
    return selected.length > 0 && selected.length < eligible.length;
  };

  // Filter by search
  const filteredVendorGroups = useMemo(() => {
    if (!searchTerm) return vendorGroups;
    
    const search = searchTerm.toLowerCase();
    return vendorGroups
      .map(vendor => ({
        ...vendor,
        categories: vendor.categories
          .map(cat => ({
            ...cat,
            items: cat.items.filter(item => 
              item.part_name?.toLowerCase().includes(search)
            ),
          }))
          .filter(cat => cat.items.length > 0),
      }))
      .filter(vendor => vendor.categories.length > 0);
  }, [vendorGroups, searchTerm]);

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
        <AlertTriangle className="w-5 h-5 mr-2" />
        Failed to load billable parts
      </div>
    );
  }

  if (contractWarning) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-gray-500">
        <Package className="w-8 h-8 mb-2 text-gray-600" />
        <p>{contractWarning}</p>
      </div>
    );
  }

  if (filteredVendorGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-gray-500">
        <Package className="w-8 h-8 mb-2 text-gray-600" />
        <p>No billable parts available</p>
        {searchTerm && <p className="text-xs mt-1">Try adjusting your search</p>}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Summary */}
      {summary && (
        <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg text-sm">
          <span className="text-gray-400">
            {summary.total_items} items available
          </span>
          <span className="text-green-400 font-medium">
            {formatCurrencyUSD(summary.total_remaining_to_bill)}
          </span>
        </div>
      )}

      {/* Search */}
      <Input
        placeholder="Search parts..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="bg-gray-800 border-gray-700"
      />

      {/* Vendor > Category > Parts Tree - PART 2: No nested vertical scroll */}
      <div className="overflow-x-auto">
        <div className="space-y-2 pr-3 min-w-full">
          {filteredVendorGroups.map((vendor) => {
            const vendorKey = `${vendor.vendor_id}::${vendor.vendor_name}`;
            const isExpanded = expandedVendors[vendorKey];
            
            return (
              <div key={vendorKey} className="border border-gray-700 rounded-lg overflow-hidden">
                {/* Vendor Header */}
                <div 
                  className="flex items-center gap-2 p-3 bg-gray-800/80 cursor-pointer hover:bg-gray-800"
                  onClick={() => toggleVendor(vendor.vendor_id, vendor.vendor_name)}
                >
                  <Checkbox
                    checked={isVendorFullySelected(vendor)}
                    ref={el => {
                      if (el) el.indeterminate = isVendorPartiallySelected(vendor);
                    }}
                    onCheckedChange={(checked) => {
                      if (checked) handleSelectVendor(vendor);
                      else handleDeselectVendor(vendor);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <span className="font-medium text-white flex-1">{vendor.vendor_name}</span>
                  <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                    {vendor.categories.reduce((sum, c) => sum + c.items.length, 0)} items
                  </Badge>
                  <span className="text-green-400 text-sm font-medium">
                    {formatCurrencyUSD(vendor.vendor_total)}
                  </span>
                </div>

                {/* Categories */}
                {isExpanded && (
                  <div className="border-t border-gray-700">
                    {vendor.categories.map((category) => {
                      const categoryKey = `${vendorKey}::${category.category_id}`;
                      const isCatExpanded = expandedCategories[categoryKey];
                      
                      return (
                        <div key={categoryKey}>
                          {/* Category Header */}
                          <div 
                            className="flex items-center gap-2 px-3 py-2 pl-8 bg-gray-900/50 cursor-pointer hover:bg-gray-900/80"
                            onClick={() => toggleCategory(vendor.vendor_id, vendor.vendor_name, category.category_id)}
                          >
                            <Checkbox
                              checked={isCategoryFullySelected(category.items)}
                              ref={el => {
                                if (el) el.indeterminate = isCategoryPartiallySelected(category.items);
                              }}
                              onCheckedChange={(checked) => {
                                if (checked) handleSelectCategory(category.items);
                                else handleDeselectCategory(category.items);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            {isCatExpanded ? (
                              <ChevronDown className="w-3 h-3 text-gray-500" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-gray-500" />
                            )}
                            <Layers className="w-3 h-3 text-purple-400" />
                            <span className="text-gray-300 text-sm flex-1">{category.category_name}</span>
                            <Badge variant="outline" className="text-xs border-gray-700 text-gray-500">
                              {category.items.length}
                            </Badge>
                            <span className="text-green-400/80 text-xs">
                              {formatCurrencyUSD(category.category_total)}
                            </span>
                          </div>

                          {/* Parts */}
                          {isCatExpanded && (
                            <div className="border-t border-gray-800">
                              {category.items.map((item) => {
                                const isBlocked = item.canInvoice === false;
                                const hasWarning = item.invoice_warning_code;
                                
                                return (
                                  <div 
                                    key={item.part_commitment_id}
                                    className={cn(
                                      "flex items-center gap-2 px-3 py-2 pl-14 hover:bg-gray-800/50",
                                      isBlocked && "opacity-60"
                                    )}
                                  >
                                    <Checkbox
                                      checked={isItemSelected(item.part_commitment_id)}
                                      onCheckedChange={(checked) => handleToggleItem(item, checked)}
                                      disabled={isBlocked}
                                    />
                                    <Package className="w-3 h-3 text-gray-500" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-white truncate">{item.part_name}</p>
                                      <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <span>Qty: {item.qty_remaining_to_bill}</span>
                                        <span>×</span>
                                        <span>{formatCurrencyUSD(item.unit_price)}</span>
                                      </div>
                                      {/* CANONICAL: Show block reason if item is blocked */}
                                      {isBlocked && item.invoice_block_reason_text && (
                                        <p className="text-xs text-red-400 mt-0.5">
                                          {item.invoice_block_reason_text}
                                        </p>
                                      )}
                                      {/* CANONICAL: Show warning if present (non-blocking) */}
                                      {!isBlocked && hasWarning && (
                                        <div className="flex items-center gap-1 text-xs text-amber-400 mt-0.5">
                                          <AlertTriangle className="w-3 h-3" />
                                          <span>{item.invoice_warning_text}</span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      {item.credit_applied > 0 && (
                                        <p className="text-xs text-yellow-400 line-through">
                                          {formatCurrencyUSD(item.gross_exposure)}
                                        </p>
                                      )}
                                      <p className={cn(
                                        "text-sm font-medium",
                                        isBlocked ? "text-gray-500" : "text-green-400"
                                      )}>
                                        {formatCurrencyUSD(item.net_exposure)}
                                      </p>
                                    </div>
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

      {/* Selection Summary */}
      {selectedItems.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-green-900/20 border border-green-800/30 rounded-lg">
          <span className="text-green-400 text-sm">
            {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected
          </span>
          <span className="text-green-400 font-medium">
            {formatCurrencyUSD(selectedItems.reduce((sum, s) => sum + (s.net_exposure || s.line_total || 0), 0))}
          </span>
        </div>
      )}
    </div>
  );
}