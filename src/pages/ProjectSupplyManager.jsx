import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ShoppingCart, Package, Truck, AlertTriangle,
  ArrowLeft, Plus, MoreVertical, RefreshCw, Search,
  Wrench, X, FileText, Edit, Trash2, Download,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { getAllowedCommitmentActions } from "@/components/lifecycle/getAllowedCommitmentActions";
import DeltaOrderModal from "@/components/parts/DeltaOrderModal";
import InstallPartModal from "@/components/project/InstallPartModal";
import ReverseInstallationModal from "@/components/project/ReverseInstallationModal";
import ReceiveInventoryModal from "@/components/receiving/ReceiveInventoryModal";
import CancelCommitmentModal from "@/components/parts/CancelCommitmentModal";
import SupplyIntegrityBanner from "@/components/supply/SupplyIntegrityBanner";
import BlockedActionResolutionModal from "@/components/supply/BlockedActionResolutionModal";
import CommitmentQuantityDrawer from "@/components/parts/CommitmentQuantityDrawer";
import { InlineQtyStepper } from "@/components/parts/CommitmentQuantityManager";
import { CoverageBadgeInline } from "@/components/parts/CoverageBadge";
import CoverageDiagnosticsPanel from "@/components/parts/CoverageDiagnosticsPanel";
import CoverageControlsPopover from "@/components/parts/CoverageControlsPopover";
import { InventoryStateBadge, StockAvailableHelper, CoverageDriftBadge } from "@/components/supply/InventoryStateBadge";
import { useProjectSupplyView } from "@/components/supply/useProjectSupplyView";
import AddPartButton from "@/components/supply/AddPartButton";
import ForwardInvoiceDashboard from "@/components/financial/ForwardInvoiceDashboard";
import { useWiringAudit } from "@/components/dev/wiringAudit";
import { Receipt } from "lucide-react";
import EditPartDrawer from "@/components/parts/EditPartDrawer";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { getDisplayStatus, getDisplayStatusColor, filterActiveCommitments } from "@/components/supply/lifecycleDisplay";
import PricingIntegrityBadge from "@/components/supply/PricingIntegrityBadge";
import SupplyGroupingControls, { applyGrouping, applySorting } from "@/components/supply/SupplyGroupingControls";
import { MobileSupplyCard } from "@/components/supply/SupplyRowData";
import MutationButton from "@/components/supply/MutationButton";
import { cn } from "@/lib/utils";

/**
 * ProjectSupplyManager - Per-Project Execution (Screen 2)
 * Route: /supply/project/:projectId
 * 
 * Unified lifecycle-driven interface with tabs:
 * - Plan: Requirements management
 * - Fund: Pools + Allocation
 * - Buy: Procurement with gating
 * - Receive: Receiving + Put-away
 * - Install: Consumption
 * - Report: Consolidated summary
 */
export default function ProjectSupplyManager() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const audit = useWiringAudit('ProjectSupplyManager');
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('project_id');
  
  // =====================================================================
  // CANONICAL TAB ROUTING - Financial model determines allowed tabs
  // Forward: ['plan','buy','receive','install','invoice','report']
  // Legacy:  ['plan','fund','buy','receive','install','report']
  // =====================================================================
  const { 
    items: supplyItems, 
    summary: supplySummary, 
    categories,
    project,
    isLoading: supplyLoading, 
    refetch: refetchSupply,
    invalidate: invalidateSupply
  } = useProjectSupplyView(projectId);

  // FORWARD MODEL ONLY - No legacy support
  const ALLOWED_TABS = ['plan', 'buy', 'receive', 'install', 'invoice', 'report'];
  
  const rawTab = urlParams.get('tab');
  // Remap legacy fund tab to invoice
  const remappedTab = rawTab === 'fund' ? 'invoice' : rawTab;
  const initialTab = ALLOWED_TABS.includes(remappedTab) ? remappedTab : 'plan';

  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupConfig, setGroupConfig] = useState({ primary: 'category', sub: 'none' });
  const [sortBy, setSortBy] = useState('recent');
  const [showClosedCancelled, setShowClosedCancelled] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Edit Part Drawer state
  const [selectedPartId, setSelectedPartId] = useState(null);
  
  // Modal states (FORWARD MODEL - no pool modals)
  const [orderModalPart, setOrderModalPart] = useState(null);
  const [deltaOrderCommitment, setDeltaOrderCommitment] = useState(null);
  const [installModal, setInstallModal] = useState(null);
  const [reverseInstallModal, setReverseInstallModal] = useState(null);
  const [receiveModal, setReceiveModal] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [actionsEnabled, setActionsEnabled] = useState(true);
  const [qtyManagerDrawer, setQtyManagerDrawer] = useState(null);
  
  // Unified PO creation states
  const [showBulkPOPreview, setShowBulkPOPreview] = useState(false);
  const [bulkPOPreviewData, setBulkPOPreviewData] = useState(null);
  const [isBulkPOLoading, setIsBulkPOLoading] = useState(false);
  const [singlePOCommitment, setSinglePOCommitment] = useState(null);
  const [vendorPickerCommitment, setVendorPickerCommitment] = useState(null);
  
  // Blocked items resolution state
  const [blockedItems, setBlockedItems] = useState(null);

  // =====================================================================
  // CANONICAL READ MODEL - Already loaded above for tab routing
  // UI MUST NOT compute coverage, to_order, or next_action locally.
  // =====================================================================

  // Build O(1) category lookup map from read model
  const categoriesMap = useMemo(() => {
    const map = new Map();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  // Get category display name with parent hierarchy
  const getCategoryDisplayName = (categoryObj) => {
    if (!categoryObj) return 'Uncategorized';
    
    if (categoryObj.parent_id) {
      const parent = categoriesMap.get(categoryObj.parent_id);
      if (parent) {
        return `${parent.name} → ${categoryObj.name}`;
      }
    }
    return categoryObj.name;
  };

  // Detect orphan items (missing part_name indicates part not found)
  const orphanCommitments = useMemo(() => {
    return supplyItems.filter(item => item.part_name === 'Unknown Part');
  }, [supplyItems]);

  // Metrics from read model summary (FORWARD MODEL - invoice-based)
  const metrics = useMemo(() => {
    const s = supplySummary;
    return {
      byStatus: s.by_status || {
        planned: 0, ordered: 0, partiallyReceived: 0,
        received: 0, allocated: 0, installed: 0
      },
      totalPlannedRetail: s.total_planned_retail || 0,
      totalPlannedCost: s.total_planned_cost || 0,
      totalInvoiced: s.total_invoiced || 0,
      totalPaid: s.total_paid || 0,
      invoiceOutstanding: s.invoice_outstanding || 0,
      unbilledRetail: s.unbilled_retail || 0,
      installPct: s.install_percent || 0,
      totalCommitments: supplyItems.length,
      supplyCoverage: s.supply_coverage_summary || { full: 0, partial: 0, none: 0, over: 0 },
    };
  }, [supplySummary, supplyItems.length]);

  // =====================================================================
  // CANONICAL VIEW MODEL ROWS - Directly from read model, NO local math
  // Each item is a SupplyCommitmentViewModel with all computed fields
  // =====================================================================
  const enrichedCommitments = useMemo(() => {
    return supplyItems.map(item => {
      // FAIL HARD if canonical fields are missing
      if (item.required_total === undefined) {
        console.error(`[CANONICAL VIOLATION] Missing required_total for commitment ${item.commitment_id}`);
      }
      if (item.reserved_from_stock === undefined) {
        console.error(`[CANONICAL VIOLATION] Missing reserved_from_stock for commitment ${item.commitment_id}`);
      }
      if (item.to_order === undefined) {
        console.error(`[CANONICAL VIOLATION] Missing to_order for commitment ${item.commitment_id}`);
      }
      if (item.coverage_status === undefined) {
        console.error(`[CANONICAL VIOLATION] Missing coverage_status for commitment ${item.commitment_id}`);
      }
      
      // CANONICAL VERIFICATION LOG
      console.log('[ProjectSupplyManager CANONICAL]', {
        part_id: item.part_id,
        commitment_id: item.commitment_id,
        physical_stock: item.physical_stock,
        reserved_total: item.reserved_from_stock,
        available: item.available_qty,
        to_order: item.to_order,
        on_order: item.covered_from_po
      });

      // Build category object from read model data
      const categoryObj = item.category_id ? categoriesMap.get(item.category_id) : null;
      
      // Derive allowed actions from CANONICAL fields (read model) ONLY
      // NO _raw fallback - read model is the single source of truth
      const allowed = getAllowedCommitmentActions({
        required_total: item.required_total,
        reserved_from_stock: item.reserved_from_stock,
        covered_from_po: item.covered_from_po,
        qty_installed: item.qty_installed,
        to_order: item.to_order,
        commitment_status: item._raw?.commitment_status || 'planned',
        billing_status: item.billing_status || 'billable',
        received_qty: item.received_qty || 0,
        unit_retail_snapshot: item.unit_retail,
      });

      // Build coverage block from canonical fields - NO local computation
      const coverage = {
        // Canonical fields from read model
        required_total: item.required_total,
        reserved_from_stock: item.reserved_from_stock,
        covered_from_po: item.covered_from_po,
        qty_installed: item.qty_installed,
        to_order: item.to_order,
        // Derived from read model
        coverage_total: item.reserved_from_stock + item.covered_from_po,
        gap_qty: item.to_order,
        coverage_status: item.coverage_status,
        coverage_percent: item.coverage_percent,
        // Availability for install
        available_to_install: item.available_to_install,
        on_order_qty: item.on_order_qty,
        received_qty: item.received_qty,
      };

      return {
        // Identity
        id: item.commitment_id,
        commitment_id: item.commitment_id,
        part_id: item.part_id,
        project_id: item.project_id,
        
        // Part info from read model
        part: {
          id: item.part_id,
          part_name: item.part_name,
          vendor_part_number: item.vendor_part_number,
          featured_photo: item.featured_photo,
        },
        
        // Category
        categoryObj,
        categoryId: item.category_id || 'uncategorized',
        categoryName: categoryObj?.name || item.category_name || 'Uncategorized',
        categoryColor: item.category_color || '#6B7280',
        categoryParentId: categoryObj?.parent_id || null,
        
        // Vendor
        vendor: item.vendor_id ? { 
          id: item.vendor_id, 
          vendor_name: item.vendor_name 
        } : null,
        
        // Lifecycle
        allowed,
        commitment_status: item._raw?.commitment_status || 'planned',
        
        // Canonical quantities - directly from read model
        required_total: item.required_total,
        reserved_from_stock: item.reserved_from_stock,
        covered_from_po: item.covered_from_po,
        qty_installed: item.qty_installed,
        to_order: item.to_order,
        on_order_qty: item.on_order_qty,
        received_qty: item.received_qty,
        available_to_install: item.available_to_install,
        
        // Coverage state
        coverage_status: item.coverage_status,
        coverage_percent: item.coverage_percent,
        coverage, // Precomputed coverage block
        
        // Next action from read model
        next_action: item.next_action,
        block_reason_code: item.block_reason_code,
        block_reason_message: item.block_reason_message,
        
        // Source type
        source_type: item.source_type,
        
        // Financial from read model
        unit_cost: item.unit_cost,
        unit_retail: item.unit_retail,
        planned_cost_total: item.planned_cost_total,
        planned_retail_total: item.planned_retail_total,
        covered_retail_total: item.covered_retail_total,
        exposure_gap: item.exposure_gap,
        billing_status: item.billing_status,
        
        // Inventory snapshot from read model
        inventory_snapshot: item.inventory_snapshot,
      };
    });
  }, [supplyItems, categoriesMap]);

  // Filter commitments for each tab - using CANONICAL fields from read model
  const getFilteredCommitments = (tabFilter) => {
    let filtered = enrichedCommitments;

    // Apply status filter for tab using CANONICAL coverage fields
    switch (tabFilter) {
      case 'plan':
        // All active commitments for planning
        filtered = filtered.filter(c => c.commitment_status !== 'cancelled' && c.commitment_status !== 'closed');
        break;
      case 'buy':
        // Items with to_order > 0 OR coverage_status indicates gap
        filtered = filtered.filter(c => {
          return c.to_order > 0 || c.coverage_status === 'NONE' || c.coverage_status === 'PARTIAL';
        });
        break;
      case 'receive':
        // Items with on_order_qty > 0 (expecting delivery)
        filtered = filtered.filter(c => 
          c.on_order_qty > 0 || ['ordered', 'partially_received'].includes(c.commitment_status)
        );
        break;
      case 'install':
        // Items with available_to_install > 0
        filtered = filtered.filter(c => {
          return c.available_to_install > 0;
        });
        break;
    }

    // Apply search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c => 
        c.part?.part_name?.toLowerCase().includes(term) ||
        c.part?.vendor_part_number?.toLowerCase().includes(term)
      );
    }

    // Apply status dropdown filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => c.commitment_status === statusFilter);
    }

    return filtered;
  };

  // Group commitments by category with hierarchy support
  const groupCommitments = (filtered) => {
    if (groupBy === 'none') {
      return [{ key: 'all', name: 'All', color: null, items: filtered, isChild: false }];
    }

    if (groupBy === 'category') {
      // Group by category ID
      const byCategory = {};
      for (const c of filtered) {
        const key = c.categoryId || 'uncategorized';
        if (!byCategory[key]) {
          byCategory[key] = {
            key,
            categoryObj: c.categoryObj,
            name: c.categoryName,
            color: c.categoryColor,
            parentId: c.categoryParentId,
            items: []
          };
        }
        byCategory[key].items.push(c);
      }

      // Sort: parents first, then children grouped under parents
      const groups = Object.values(byCategory);
      
      // Separate parents and children
      const parents = groups.filter(g => !g.parentId);
      const children = groups.filter(g => g.parentId);
      
      // Sort parents by name
      parents.sort((a, b) => a.name.localeCompare(b.name));
      
      // Build final ordered list with children after their parents
      const ordered = [];
      for (const parent of parents) {
        ordered.push({ ...parent, isChild: false });
        const childGroups = children.filter(c => c.parentId === parent.key);
        childGroups.sort((a, b) => a.name.localeCompare(b.name));
        for (const child of childGroups) {
          ordered.push({ ...child, isChild: true });
        }
      }
      
      // Add orphan children (parent not in current view)
      const usedChildIds = new Set(ordered.filter(g => g.isChild).map(g => g.key));
      for (const child of children) {
        if (!usedChildIds.has(child.key)) {
          ordered.push({ ...child, isChild: true });
        }
      }
      
      // Add uncategorized at the end if present
      const uncategorized = groups.find(g => g.key === 'uncategorized');
      if (uncategorized && !ordered.find(g => g.key === 'uncategorized')) {
        ordered.push({ ...uncategorized, isChild: false });
      }
      
      return ordered;
    }

    return [{ key: 'all', name: 'All', color: null, items: filtered, isChild: false }];
  };

  // Render grouped commitment rows - DESKTOP
  const renderGroupedCommitments = (tabFilter, showActions = true) => {
    let filtered = getFilteredCommitments(tabFilter);
    
    // Apply show/hide closed/cancelled filter
    filtered = filterActiveCommitments(filtered, showClosedCancelled);
    
    // Apply sorting
    filtered = applySorting(filtered, sortBy);
    
    // Build lookups for grouping
    const lookups = {
      categories: categoriesMap,
      vendors: {},
      projects: {},
    };
    
    // Apply grouping
    const groups = applyGrouping(filtered, groupConfig.primary, groupConfig.sub, lookups);

    return groups.map((group) => (
      <React.Fragment key={group.key}>
        {groupConfig.primary !== 'none' && (
          <TableRow className="bg-gray-900/70 border-l-4" style={{ borderLeftColor: '#6B7280' }}>
            <TableCell colSpan={14} className="py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-300">
                    {group.name}
                  </span>
                  <span className="text-xs text-gray-500">({group.items?.length || 0})</span>
                </div>
                <span className="text-xs text-gray-500 font-mono">
                  {formatCurrencyUSD((group.items || []).reduce((sum, c) => sum + (c.planned_retail_total || 0), 0))}
                </span>
              </div>
            </TableCell>
          </TableRow>
        )}

        {/* Render sub-groups or items */}
        {group.subGroups ? (
          group.subGroups.map(subGroup => (
            <React.Fragment key={`${group.key}-${subGroup.key}`}>
              <TableRow className="bg-gray-900/50">
                <TableCell colSpan={14} className="py-1 pl-8">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-400">
                      ↳ {subGroup.name} ({subGroup.items?.length || 0})
                    </span>
                    <span className="text-xs text-gray-500 font-mono">
                      {formatCurrencyUSD((subGroup.items || []).reduce((sum, c) => sum + (c.planned_retail_total || 0), 0))}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
              {(subGroup.items || []).map(c => renderCommitmentRow(c, showActions))}
            </React.Fragment>
          ))
        ) : (
          (group.items || []).map(c => renderCommitmentRow(c, showActions))
        )}
      </React.Fragment>
    ));
  };
  
  // Render mobile cards grouped
  const renderMobileGroupedCommitments = (tabFilter) => {
    let filtered = getFilteredCommitments(tabFilter);
    filtered = filterActiveCommitments(filtered, showClosedCancelled);
    filtered = applySorting(filtered, sortBy);
    
    const lookups = { categories: categoriesMap, vendors: {}, projects: {} };
    const groups = applyGrouping(filtered, groupConfig.primary, groupConfig.sub, lookups);
    
    return (
      <div className="space-y-3">
        {groups.map(group => (
          <div key={group.key} className="space-y-2">
            {groupConfig.primary !== 'none' && (
              <div className="flex items-center justify-between px-2 py-1 bg-gray-900/50 rounded">
                <span className="text-sm font-medium text-gray-300">{group.name}</span>
                <span className="text-xs text-gray-500">
                  {group.items?.length || 0} • {formatCurrencyUSD((group.items || []).reduce((sum, c) => sum + (c.planned_retail_total || 0), 0))}
                </span>
              </div>
            )}
            {group.subGroups ? (
              group.subGroups.map(subGroup => (
                <div key={`${group.key}-${subGroup.key}`} className="pl-3 space-y-2">
                  <div className="text-xs text-gray-400 pl-2">↳ {subGroup.name}</div>
                  {(subGroup.items || []).map(c => renderMobileCard(c))}
                </div>
              ))
            ) : (
              (group.items || []).map(c => renderMobileCard(c))
            )}
          </div>
        ))}
      </div>
    );
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchSupply();
    setIsRefreshing(false);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedItems(new Set());
    setStatusFilter('all');
    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
  };

  // === UNIFIED SUPPLY EXECUTION ENGINE - PO CREATION ===
  
  // Bulk PO creation - preview first
  const handleBulkPOPreview = async () => {
    audit.trackClick('bulk_po_preview', { selected_count: selectedItems.size });
    
    if (selectedItems.size === 0) {
      toast.error('No items selected');
      return;
    }
    
    // PHASE 9G: GUARD - Check if any selected items have to_order <= 0 OR have available stock
    const selectedWithZeroOrder = enrichedCommitments.filter(
      c => selectedItems.has(c.id) && (c.to_order <= 0 || (c.inventory_snapshot?.available ?? 0) > 0)
    );
    if (selectedWithZeroOrder.length > 0) {
      const withStock = selectedWithZeroOrder.filter(c => (c.inventory_snapshot?.available ?? 0) > 0);
      if (withStock.length > 0) {
        toast.error(`${withStock.length} item(s) have available stock - cannot create PO. System should auto-reserve first.`);
      } else {
        toast.error(`${selectedWithZeroOrder.length} selected items have nothing to order`);
      }
      return;
    }
    
    setIsBulkPOLoading(true);
    try {
      const result = await base44.functions.invoke('createPurchaseOrdersFromCommitments', {
        project_id: projectId,
        commitment_ids: Array.from(selectedItems),
        mode: 'BULK',
        allow_multi_vendor: true,
        dry_run: true
      });

      // DEBUG: Log result for diagnostics (remove after confirming)
      console.log('[PO Preview Bulk] Result:', JSON.stringify(result.data, null, 2));

      if (result.data?.error) {
        toast.error(result.data.error);
        return;
      }

      setBulkPOPreviewData(result.data);
      setShowBulkPOPreview(true);
      audit.trackSuccess('bulk_po_preview');
    } catch (error) {
      audit.trackError('bulk_po_preview', error);
      toast.error('Failed to preview PO: ' + error.message);
    } finally {
      setIsBulkPOLoading(false);
    }
  };

  // Execute bulk PO creation
  const handleBulkPOExecute = async () => {
    audit.trackClick('bulk_po_execute', { selected_count: selectedItems.size });
    setIsBulkPOLoading(true);
    try {
      const result = await base44.functions.invoke('createPurchaseOrdersFromCommitments', {
        project_id: projectId,
        commitment_ids: Array.from(selectedItems),
        mode: 'BULK',
        allow_multi_vendor: true,
        dry_run: false
      });

      // DEBUG: Log result for diagnostics (remove after confirming)
      console.log('[PO Execute Bulk] Result:', JSON.stringify(result.data, null, 2));

      if (result.data?.error) {
        toast.error(result.data.error);
        return;
      }

      const { created_orders = [], blocked = [], summary = {} } = result.data;
      
      // Success feedback
      if (created_orders.length > 0) {
        const poNumbers = created_orders.map(o => o.po_number).join(', ');
        toast.success(`Created ${created_orders.length} PO(s): ${poNumbers}`, {
          description: `${summary.eligible_count} line items ordered`
        });
      }
      
      // Show guided resolution modal for blocked items
      if (blocked.length > 0) {
        setBlockedItems(blocked);
      }
      
      // Silent failure fallback
      if (created_orders.length === 0 && blocked.length === 0) {
        toast.error('No orders created - check commitment eligibility');
      }

      // Invalidate via read model
      invalidateSupply();
      
      // Clear selection - stay on Buy tab (no navigation)
      setSelectedItems(new Set());
      setShowBulkPOPreview(false);
      setBulkPOPreviewData(null);
      
      audit.trackSuccess('bulk_po_execute', { created_count: created_orders.length });
    } catch (error) {
      audit.trackError('bulk_po_execute', error);
      toast.error('Failed to create PO: ' + error.message);
    } finally {
      setIsBulkPOLoading(false);
    }
  };

  // Single row PO creation
  const handleSinglePOCreate = async (commitment, overrideVendorId = null) => {
    audit.trackClick('single_po_create', { commitment_id: commitment.id });
    
    const vendorId = overrideVendorId || commitment.vendor?.id;
    
    // If no vendor, show vendor picker
    if (!vendorId) {
      setVendorPickerCommitment(commitment);
      return;
    }

    setActionsEnabled(false);
    try {
      const result = await base44.functions.invoke('createPurchaseOrdersFromCommitments', {
        project_id: projectId,
        commitment_ids: [commitment.id],
        mode: 'SINGLE',
        allow_multi_vendor: false,
        override_vendor_id: overrideVendorId,
        dry_run: false
      });

      // DEBUG: Log result for diagnostics (remove after confirming)
      console.log('[PO Create Single] Result:', JSON.stringify(result.data, null, 2));

      if (result.data?.error) {
        toast.error(result.data.error);
        return;
      }

      const { created_orders = [], blocked = [] } = result.data;
      
      if (created_orders.length > 0) {
        toast.success(`PO ${created_orders[0].po_number} created`);
      } else if (blocked.length > 0) {
        // Show guided resolution modal instead of toast
        setBlockedItems(blocked);
      } else {
        // Silent failure fallback - neither created nor blocked
        toast.error('No orders created - check commitment eligibility');
      }

      // Invalidate and refresh via read model - stay on current tab
      invalidateSupply();
      audit.trackSuccess('single_po_create');
    } catch (error) {
      audit.trackError('single_po_create', error);
      toast.error('Failed to create PO: ' + error.message);
    } finally {
      setActionsEnabled(true);
      setVendorPickerCommitment(null);
    }
  };

  // Compute next step label from CANONICAL read model next_action
  const getNextStepLabel = (commitment) => {
    const action = commitment.next_action;
    
    switch (action) {
      case 'CREATE_PO':
        return { label: 'Create PO', color: 'purple' };
      case 'RECEIVE':
        return { label: 'Receive', color: 'blue' };
      case 'INSTALL':
        return { label: 'Ready to Install', color: 'cyan' };
      case 'COMPLETE':
        return { label: 'Complete', color: 'green' };
      case 'BLOCKED_NO_VENDOR':
        return { label: 'No Vendor', color: 'red' };
      case 'BLOCKED_NO_FUNDING':
        return { label: 'No Funding', color: 'yellow' };
      case 'BLOCKED_PREPAY':
        return { label: 'Awaiting Prepay', color: 'yellow' };
      default:
        return { label: action || '-', color: 'gray' };
    }
  };

  // === BLOCKED ITEM RESOLUTION HANDLERS ===
  const resolveVendor = (commitmentId) => {
    const commitment = enrichedCommitments.find(c => c.id === commitmentId);
    if (commitment) setVendorPickerCommitment(commitment);
  };

  const resolveBilling = (commitmentId) => {
    // FORWARD MODEL: Navigate to invoice tab
    handleTabChange('invoice');
    toast.info('Create invoice to cover this commitment');
  };

  const resolveQty = (commitmentId) => {
    const commitment = enrichedCommitments.find(c => c.id === commitmentId);
    if (commitment) setQtyManagerDrawer(commitment);
  };

  const resolveInvariant = (commitmentId) => {
    // Switch to plan tab for coverage review
    setActiveTab('plan');
    toast.info('Review commitment coverage in the Plan tab');
  };

  // Handle part click - opens Edit Part Drawer
  const handlePartClick = useCallback((part, commitment) => {
    if (part?.id) {
      setSelectedPartId(part.id);
    } else if (commitment?.part_id) {
      setSelectedPartId(commitment.part_id);
    }
  }, []);

  // Inventory Coverage Indicator
  const InventoryCoverageIndicator = ({ available, needed }) => {
    if (available >= needed && needed > 0) {
      return (
        <span className="text-[10px] font-mono uppercase text-gray-500 bg-gray-800/50 px-1.5 py-0.5 rounded">
          COVERED BY STOCK
        </span>
      );
    }
    if (available === 0) {
      return (
        <span className="text-[10px] font-mono uppercase text-gray-400 border-l-2 border-l-amber-700 bg-gray-900/60 px-1.5 py-0.5">
          OUT OF STOCK
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono uppercase text-gray-400 border-l-2 border-l-amber-600 bg-gray-900/60 px-1.5 py-0.5">
        INSUFFICIENT STOCK
      </span>
    );
  };

  // Render commitment row - CANONICAL fields only with MANDATORY data contract
  // Column order: Part | Category | In Stock | Reserved | Needed | Cost | Retail | Status | Vendor | Payment | Coverage | Warning
  const renderCommitmentRow = (commitment, showActions = true) => {
    const { part, vendor, allowed, categoryName } = commitment;
    const displayStatus = getDisplayStatus(commitment.commitment_status);
    const statusColor = getDisplayStatusColor(displayStatus);
    
    // Extract mandatory values
    const inStock = commitment.inventory_snapshot?.physical ?? 0;
    const reserved = commitment.reserved_from_stock ?? 0;
    const needed = commitment.required_total ?? 0;
    const cost = commitment.unit_cost ?? 0;
    const retail = commitment.unit_retail ?? 0;
    const paymentStatus = commitment.billing_status ?? 'billable';
    const available = commitment.inventory_snapshot?.available ?? (inStock - reserved);
    
    // RESOLVE NAMES - Never display IDs
    const vendorDisplay = vendor?.vendor_name || commitment.vendor_name || 'Unknown Vendor';
    const categoryDisplay = categoryName || 'Uncategorized';

    return (
      <TableRow key={commitment.id} className="hover:bg-gray-800/30">
        {showActions && (
          <TableCell className="w-10">
            <Checkbox
              checked={selectedItems.has(commitment.id)}
              onCheckedChange={() => {
                setSelectedItems(prev => {
                  const next = new Set(prev);
                  if (next.has(commitment.id)) next.delete(commitment.id);
                  else next.add(commitment.id);
                  return next;
                });
              }}
            />
          </TableCell>
        )}
        {/* Part Name - CLICKABLE, opens drawer */}
        <TableCell>
          <div className="flex items-center gap-2">
            {part?.featured_photo && (
              <div className="w-8 h-8 bg-gray-800 rounded overflow-hidden flex-shrink-0">
                <img src={part.featured_photo} alt="" className="w-full h-full object-contain" />
              </div>
            )}
            <button
              onClick={() => handlePartClick(part, commitment)}
              className="text-left hover:text-gray-300 transition-colors"
            >
              <p className="text-white text-sm font-medium">{part?.part_name || 'Unknown Part'}</p>
              <p className="text-xs text-gray-500">{part?.vendor_part_number}</p>
            </button>
          </div>
        </TableCell>
        {/* Category - MANDATORY, resolved name only */}
        <TableCell>
          <span className="text-xs text-gray-400 truncate max-w-[100px] block">
            {categoryDisplay}
          </span>
        </TableCell>
        {/* In Stock - MANDATORY */}
        <TableCell className="text-center">
          <span className="text-sm font-mono text-gray-300">{inStock}</span>
        </TableCell>
        {/* Reserved - MANDATORY */}
        <TableCell className="text-center">
          <span className={cn(
            "text-sm font-mono",
            reserved > 0 ? "text-cyan-400" : "text-gray-500"
          )}>
            {reserved}
          </span>
        </TableCell>
        {/* Needed - MANDATORY, STATIC (no inline editing) */}
        <TableCell className="text-center">
          <span className="text-sm font-mono text-white">{needed}</span>
        </TableCell>
        {/* Cost - MANDATORY, USD formatted */}
        <TableCell className="text-right">
          <span className="text-sm font-mono text-gray-300">
            {formatCurrencyUSD(cost)}
          </span>
        </TableCell>
        {/* Retail - MANDATORY, USD formatted */}
        <TableCell className="text-right">
          <span className="text-sm font-mono text-gray-300">
            {formatCurrencyUSD(retail)}
          </span>
        </TableCell>
        {/* Display Lifecycle - MANDATORY */}
        <TableCell>
          <span className={cn(
            "text-[10px] font-mono uppercase px-1.5 py-0.5 border-l-2 bg-gray-900/50 whitespace-nowrap",
            statusColor
          )}>
            {displayStatus}
          </span>
        </TableCell>
        {/* Vendor - MANDATORY, resolved name only */}
        <TableCell>
          <span className="text-xs text-gray-400 truncate max-w-[100px] block">
            {vendorDisplay}
          </span>
        </TableCell>
        {/* Payment Status - MANDATORY */}
        <TableCell>
          <span className={cn(
            "text-[10px] font-mono uppercase",
            paymentStatus === 'invoiced' || paymentStatus === 'paid' ? 'text-gray-500' : 'text-amber-500'
          )}>
            {paymentStatus}
          </span>
        </TableCell>
        {/* Coverage Indicator - MANDATORY */}
        <TableCell>
          <InventoryCoverageIndicator available={available} needed={needed} />
        </TableCell>
        {/* Pricing Warning Badge - only if not OK */}
        <TableCell>
          <PricingIntegrityBadge commitment={commitment} />
        </TableCell>
        {showActions && (
          <TableCell>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!actionsEnabled}>
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
                {/* PHASE 9F: Only show Create PO if to_order > 0 AND no available stock */}
                {allowed.canCreatePO && commitment.to_order > 0 && (commitment.inventory_snapshot?.available ?? 0) === 0 && (
                  <DropdownMenuItem onClick={() => handleSinglePOCreate(commitment)} className="text-green-400">
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Create PO
                  </DropdownMenuItem>
                )}
                {allowed.canCreateDeltaOrder && (
                  <DropdownMenuItem onClick={() => setDeltaOrderCommitment(commitment)} className="text-purple-400">
                    <Plus className="w-4 h-4 mr-2" />
                    Additional Order
                  </DropdownMenuItem>
                )}
                {allowed.canReceive && (
                  <DropdownMenuItem onClick={() => setReceiveModal(commitment)} className="text-blue-400">
                    <Package className="w-4 h-4 mr-2" />
                    Receive
                  </DropdownMenuItem>
                )}
                {allowed.canInstall && (
                  <DropdownMenuItem onClick={() => setInstallModal(commitment)} className="text-emerald-400">
                    <Wrench className="w-4 h-4 mr-2" />
                    Install
                  </DropdownMenuItem>
                )}
                {allowed.canReverseInstall && (
                  <DropdownMenuItem onClick={() => setReverseInstallModal(commitment)} className="text-orange-400">
                    <X className="w-4 h-4 mr-2" />
                    Reverse Install
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={() => setQtyManagerDrawer(commitment)}
                  className="text-cyan-400"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Manage Qty / Move
                </DropdownMenuItem>
                {allowed.canCancel && (
                  <>
                    <DropdownMenuSeparator className="bg-gray-700" />
                    <DropdownMenuItem 
                      onClick={() => setCancelModal(commitment)}
                      className="text-red-400"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        )}
      </TableRow>
    );
  };
  
  // Render mobile card - uses MobileSupplyCard component
  const renderMobileCard = (commitment) => {
    const { part, vendor, allowed, categoryObj } = commitment;
    
    return (
      <MobileSupplyCard
        key={commitment.id}
        commitment={commitment}
        part={part}
        vendor={vendor}
        category={categoryObj}
        categoryLookup={categoriesMap}
        onPartClick={handlePartClick}
      >
        {/* Actions inside expanded view */}
        <div className="flex flex-wrap gap-2">
          {allowed.canCreatePO && commitment.to_order > 0 && (
            <MutationButton
              variant="outline"
              size="sm"
              onClick={() => handleSinglePOCreate(commitment)}
              loadingText="Creating..."
              className="text-xs"
            >
              <ShoppingCart className="w-3 h-3 mr-1" />
              Create PO
            </MutationButton>
          )}
          {allowed.canReceive && (
            <Button variant="outline" size="sm" onClick={() => setReceiveModal(commitment)} className="text-xs">
              <Package className="w-3 h-3 mr-1" />
              Receive
            </Button>
          )}
          {allowed.canInstall && (
            <Button variant="outline" size="sm" onClick={() => setInstallModal(commitment)} className="text-xs">
              <Wrench className="w-3 h-3 mr-1" />
              Install
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setQtyManagerDrawer(commitment)} className="text-xs">
            <Edit className="w-3 h-3 mr-1" />
            Manage
          </Button>
        </div>
      </MobileSupplyCard>
    );
  };

  if (!projectId) {
    return (
      <MobileSafeAreaContainer>
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 flex items-center justify-center">
          <Card className="bg-black/40 border-gray-800 p-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
            <p className="text-white mb-4">No project specified</p>
            <Button onClick={() => navigate(createPageUrl('SupplyLanding'))}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Card>
        </div>
      </MobileSafeAreaContainer>
    );
  }

  return (
    <MobileSafeAreaContainer>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(createPageUrl('SupplyLanding'))}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white">
                  {project?.name || 'Loading...'}
                </h1>
                <p className="text-sm text-gray-400">{project?.client_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleRefresh}
                variant="outline"
                size="sm"
                className="border-gray-700 text-white gap-2"
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
              <CoverageDiagnosticsPanel 
                projectId={projectId}
                onOpenCommitment={(c) => setQtyManagerDrawer(c)}
              />
            </div>
          </div>

          {/* Integrity Banner */}
          <SupplyIntegrityBanner 
            onGateStatusChange={setActionsEnabled}
            showFixControls={true}
            compact={false}
          />

          {/* Orphan Commitments Warning */}
          {orphanCommitments.length > 0 && (
            <div className="bg-red-900/30 border border-red-600 text-red-400 p-3 rounded flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{orphanCommitments.length} commitment(s) reference missing Parts. Data integrity issue detected.</span>
            </div>
          )}

          {/* Uncategorized Parts Warning */}
          {enrichedCommitments.some(c => c.categoryId === 'uncategorized') && (
            <div className="bg-yellow-900/30 border border-yellow-600 text-yellow-400 p-3 rounded flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>Some parts are Uncategorized. Update Part.category for proper grouping.</span>
            </div>
          )}

          {/* Summary Row - FORWARD MODEL: Invoice-based metrics */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Commitments</p>
                <p className="text-xl font-bold text-white">{metrics.totalCommitments}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Planned Retail</p>
                <p className="text-xl font-bold text-white font-mono">{formatCurrencyUSD(metrics.totalPlannedRetail)}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Invoiced</p>
                <p className="text-xl font-bold text-gray-300 font-mono">{formatCurrencyUSD(metrics.totalInvoiced)}</p>
              </CardContent>
            </Card>
            <Card className={`bg-black/40 ${metrics.invoiceOutstanding > 0 ? 'border-amber-700' : 'border-gray-800'}`}>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Outstanding</p>
                <p className={`text-xl font-bold font-mono ${metrics.invoiceOutstanding > 0 ? 'text-amber-500' : 'text-gray-400'}`}>
                  {formatCurrencyUSD(metrics.invoiceOutstanding)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Installed</p>
                <p className="text-xl font-bold text-gray-300">{metrics.installPct}%</p>
              </CardContent>
            </Card>
          </div>

          {/* Lifecycle Progress Bar */}
          <Card className="bg-black/40 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Lifecycle Progress</span>
                <span className="text-sm text-gray-500">{metrics.byStatus.installed} / {metrics.totalCommitments} installed</span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-gray-800">
                <div className="bg-gray-600" style={{ width: `${(metrics.byStatus.planned / metrics.totalCommitments) * 100}%` }} title="Planned" />
                <div className="bg-purple-600" style={{ width: `${((metrics.byStatus.ordered + metrics.byStatus.partiallyReceived) / metrics.totalCommitments) * 100}%` }} title="Ordered" />
                <div className="bg-blue-600" style={{ width: `${(metrics.byStatus.received / metrics.totalCommitments) * 100}%` }} title="Received" />
                <div className="bg-cyan-600" style={{ width: `${(metrics.byStatus.allocated / metrics.totalCommitments) * 100}%` }} title="Allocated" />
                <div className="bg-green-600" style={{ width: `${(metrics.byStatus.installed / metrics.totalCommitments) * 100}%` }} title="Installed" />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Plan: {metrics.byStatus.planned}</span>
                <span>Order: {metrics.byStatus.ordered}</span>
                <span>Recv: {metrics.byStatus.received}</span>
                <span>Alloc: {metrics.byStatus.allocated}</span>
                <span>Inst: {metrics.byStatus.installed}</span>
              </div>
            </CardContent>
          </Card>

          {/* Tabs - FORWARD MODEL ONLY */}
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="bg-black/40 border border-gray-800 w-full justify-start overflow-x-auto">
              <TabsTrigger value="plan" className="data-[state=active]:bg-gray-700 gap-1.5">
                <Package className="w-4 h-4" />
                Plan
              </TabsTrigger>
              <TabsTrigger value="buy" className="data-[state=active]:bg-purple-900/30 gap-1.5">
                <ShoppingCart className="w-4 h-4" />
                Buy
              </TabsTrigger>
              <TabsTrigger value="receive" className="data-[state=active]:bg-blue-900/30 gap-1.5">
                <Truck className="w-4 h-4" />
                Receive
              </TabsTrigger>
              <TabsTrigger value="install" className="data-[state=active]:bg-emerald-900/30 gap-1.5">
                <Wrench className="w-4 h-4" />
                Install
              </TabsTrigger>
              <TabsTrigger value="invoice" className="data-[state=active]:bg-green-900/30 gap-1.5">
                <Receipt className="w-4 h-4" />
                Invoice
              </TabsTrigger>
              <TabsTrigger value="report" className="data-[state=active]:bg-red-900/30 gap-1.5">
                <FileText className="w-4 h-4" />
                Report
              </TabsTrigger>
            </TabsList>

            {/* Tab Contents */}
            <TabsContent value="plan" className="mt-4">
              <Card className="bg-black/40 border-gray-800">
                <CardHeader className="p-4 pb-2">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white">Planned Requirements</CardTitle>
                      <AddPartButton projectId={projectId} onSuccess={() => invalidateSupply()} />
                    </div>
                    {/* Unified Grouping Controls */}
                    <div className="flex flex-col md:flex-row gap-3">
                      <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <Input
                          placeholder="Search parts..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10 bg-gray-900/50 border-gray-700 text-white h-8 text-sm"
                        />
                      </div>
                      <SupplyGroupingControls
                        onGroupChange={setGroupConfig}
                        onSortChange={setSortBy}
                        onShowClosedChange={setShowClosedCancelled}
                        showProjectOption={false}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <p className="text-xs text-gray-500 px-4 py-2 border-b border-gray-800">
                    Auto: reserves stock first, remainder goes to order queue.
                  </p>
                  
                  {/* Mobile View */}
                  {isMobile ? (
                    <div className="p-3">
                      {getFilteredCommitments('plan').length === 0 ? (
                        <p className="text-center py-8 text-gray-500">No planned items.</p>
                      ) : (
                        renderMobileGroupedCommitments('plan')
                      )}
                    </div>
                  ) : (
                    /* Desktop Table - Column Order: Part | Category | In Stock | Reserved | Needed | Cost | Retail | Status | Vendor | Payment | Coverage | Warning */
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-800 hover:bg-transparent">
                          <TableHead className="w-10"></TableHead>
                          <TableHead className="text-gray-400">Part</TableHead>
                          <TableHead className="text-gray-400">Category</TableHead>
                          <TableHead className="text-gray-400 text-center">In Stock</TableHead>
                          <TableHead className="text-gray-400 text-center">Reserved</TableHead>
                          <TableHead className="text-gray-400 text-center">Needed</TableHead>
                          <TableHead className="text-gray-400 text-right">Cost</TableHead>
                          <TableHead className="text-gray-400 text-right">Retail</TableHead>
                          <TableHead className="text-gray-400">Status</TableHead>
                          <TableHead className="text-gray-400">Vendor</TableHead>
                          <TableHead className="text-gray-400">Payment</TableHead>
                          <TableHead className="text-gray-400">Coverage</TableHead>
                          <TableHead className="text-gray-400">Pricing</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getFilteredCommitments('plan').length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={14} className="text-center py-8 text-gray-500">
                              No planned items. All requirements are in progress or completed.
                            </TableCell>
                          </TableRow>
                        ) : (
                          renderGroupedCommitments('plan')
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Invoice tab content - FORWARD MODEL */}
            <TabsContent value="invoice" className="mt-4">
              <ForwardInvoiceDashboard projectId={projectId} />
            </TabsContent>

            <TabsContent value="buy" className="mt-4">
              <Card className="bg-black/40 border-gray-800">
                <CardHeader className="p-4 pb-2">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-white">Ready to Order</CardTitle>
                        <CardDescription>Items gated by coverage and prepay requirements</CardDescription>
                      </div>
                      {selectedItems.size > 0 && (
                        <MutationButton 
                          className="bg-green-600 hover:bg-green-700 gap-1"
                          onClick={handleBulkPOPreview}
                          loadingText="Loading..."
                        >
                          <ShoppingCart className="w-4 h-4" />
                          Create PO ({selectedItems.size})
                        </MutationButton>
                      )}
                    </div>
                    <div className="flex flex-col md:flex-row gap-3">
                      <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <Input
                          placeholder="Search parts..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10 bg-gray-900/50 border-gray-700 text-white h-8 text-sm"
                        />
                      </div>
                      <SupplyGroupingControls
                        onGroupChange={setGroupConfig}
                        onSortChange={setSortBy}
                        onShowClosedChange={setShowClosedCancelled}
                        showProjectOption={false}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {isMobile ? (
                    <div className="p-3">
                      {getFilteredCommitments('buy').length === 0 ? (
                        <p className="text-center py-8 text-gray-500">No items need ordering</p>
                      ) : (
                        renderMobileGroupedCommitments('buy')
                      )}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-800 hover:bg-transparent">
                          <TableHead className="w-10"></TableHead>
                          <TableHead className="text-gray-400">Part</TableHead>
                          <TableHead className="text-gray-400">Category</TableHead>
                          <TableHead className="text-gray-400 text-center">In Stock</TableHead>
                          <TableHead className="text-gray-400 text-center">Reserved</TableHead>
                          <TableHead className="text-gray-400 text-center">Needed</TableHead>
                          <TableHead className="text-gray-400 text-right">Cost</TableHead>
                          <TableHead className="text-gray-400 text-right">Retail</TableHead>
                          <TableHead className="text-gray-400">Status</TableHead>
                          <TableHead className="text-gray-400">Vendor</TableHead>
                          <TableHead className="text-gray-400">Payment</TableHead>
                          <TableHead className="text-gray-400">Coverage</TableHead>
                          <TableHead className="text-gray-400">Pricing</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getFilteredCommitments('buy').length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={14} className="text-center py-8 text-gray-500">
                              No items need ordering
                            </TableCell>
                          </TableRow>
                        ) : (
                          renderGroupedCommitments('buy')
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="receive" className="mt-4">
              <Card className="bg-black/40 border-gray-800">
                <CardHeader className="p-4 pb-2">
                  <div className="flex flex-col gap-3">
                    <CardTitle className="text-white">Receiving Queue</CardTitle>
                    <div className="flex flex-col md:flex-row gap-3">
                      <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <Input
                          placeholder="Search parts..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10 bg-gray-900/50 border-gray-700 text-white h-8 text-sm"
                        />
                      </div>
                      <SupplyGroupingControls
                        onGroupChange={setGroupConfig}
                        onSortChange={setSortBy}
                        onShowClosedChange={setShowClosedCancelled}
                        showProjectOption={false}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {isMobile ? (
                    <div className="p-3">
                      {getFilteredCommitments('receive').length === 0 ? (
                        <p className="text-center py-8 text-gray-500">No items on order</p>
                      ) : (
                        renderMobileGroupedCommitments('receive')
                      )}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-800 hover:bg-transparent">
                          <TableHead className="w-10"></TableHead>
                          <TableHead className="text-gray-400">Part</TableHead>
                          <TableHead className="text-gray-400 text-center">In Stock</TableHead>
                          <TableHead className="text-gray-400 text-center">Reserved</TableHead>
                          <TableHead className="text-gray-400 text-center">Needed</TableHead>
                          <TableHead className="text-gray-400 text-right">Cost</TableHead>
                          <TableHead className="text-gray-400 text-right">Retail</TableHead>
                          <TableHead className="text-gray-400">Status</TableHead>
                          <TableHead className="text-gray-400">Vendor</TableHead>
                          <TableHead className="text-gray-400">Payment</TableHead>
                          <TableHead className="text-gray-400">Coverage</TableHead>
                          <TableHead className="text-gray-400">Pricing</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getFilteredCommitments('receive').length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={13} className="text-center py-8 text-gray-500">
                              No items on order
                            </TableCell>
                          </TableRow>
                        ) : (
                          renderGroupedCommitments('receive')
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="install" className="mt-4">
              <Card className="bg-black/40 border-gray-800">
                <CardHeader className="p-4 pb-2">
                  <div className="flex flex-col gap-3">
                    <CardTitle className="text-white">Installation Queue</CardTitle>
                    <div className="flex flex-col md:flex-row gap-3">
                      <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <Input
                          placeholder="Search parts..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10 bg-gray-900/50 border-gray-700 text-white h-8 text-sm"
                        />
                      </div>
                      <SupplyGroupingControls
                        onGroupChange={setGroupConfig}
                        onSortChange={setSortBy}
                        onShowClosedChange={setShowClosedCancelled}
                        showProjectOption={false}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {isMobile ? (
                    <div className="p-3">
                      {getFilteredCommitments('install').length === 0 ? (
                        <p className="text-center py-8 text-gray-500">No items ready to install</p>
                      ) : (
                        renderMobileGroupedCommitments('install')
                      )}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-800 hover:bg-transparent">
                          <TableHead className="w-10"></TableHead>
                          <TableHead className="text-gray-400">Part</TableHead>
                          <TableHead className="text-gray-400 text-center">In Stock</TableHead>
                          <TableHead className="text-gray-400 text-center">Reserved</TableHead>
                          <TableHead className="text-gray-400 text-center">Needed</TableHead>
                          <TableHead className="text-gray-400 text-right">Cost</TableHead>
                          <TableHead className="text-gray-400 text-right">Retail</TableHead>
                          <TableHead className="text-gray-400">Status</TableHead>
                          <TableHead className="text-gray-400">Vendor</TableHead>
                          <TableHead className="text-gray-400">Payment</TableHead>
                          <TableHead className="text-gray-400">Coverage</TableHead>
                          <TableHead className="text-gray-400">Pricing</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getFilteredCommitments('install').length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={13} className="text-center py-8 text-gray-500">
                              No items ready to install
                            </TableCell>
                          </TableRow>
                        ) : (
                          renderGroupedCommitments('install')
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="report" className="mt-4 space-y-4">
              {/* Report Summary - FORWARD MODEL */}
              <Card className="bg-black/40 border-gray-800">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white">Supply Chain Report</CardTitle>
                    <Button variant="outline" className="border-gray-700 text-white gap-2">
                      <Download className="w-4 h-4" />
                      Export CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {/* Requirements Summary */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Requirements Summary</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-gray-800/50 p-3 rounded">
                        <p className="text-xs text-gray-500">Total Commitments</p>
                        <p className="text-xl font-bold text-white">{metrics.totalCommitments}</p>
                      </div>
                      <div className="bg-gray-800/50 p-3 rounded">
                        <p className="text-xs text-gray-500">Planned Retail</p>
                        <p className="text-xl font-bold text-white font-mono">{formatCurrencyUSD(metrics.totalPlannedRetail)}</p>
                      </div>
                      <div className="bg-gray-800/50 p-3 rounded">
                        <p className="text-xs text-gray-500">Invoiced</p>
                        <p className="text-xl font-bold text-blue-400 font-mono">{formatCurrencyUSD(metrics.totalInvoiced)}</p>
                      </div>
                      <div className="bg-gray-800/50 p-3 rounded">
                        <p className="text-xs text-gray-500">Unbilled</p>
                        <p className={`text-xl font-bold font-mono ${metrics.unbilledRetail > 0 ? 'text-amber-500' : 'text-gray-400'}`}>
                          {formatCurrencyUSD(metrics.unbilledRetail)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Invoice Summary */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Invoice Summary</h4>
                    <div className="bg-gray-800/50 p-3 rounded">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <p className="text-xs text-gray-500">Total Invoiced</p>
                          <p className="text-lg font-bold text-white font-mono">{formatCurrencyUSD(metrics.totalInvoiced)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Total Paid</p>
                          <p className="text-lg font-bold text-gray-300 font-mono">{formatCurrencyUSD(metrics.totalPaid)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Outstanding</p>
                          <p className={`text-lg font-bold font-mono ${metrics.invoiceOutstanding > 0 ? 'text-amber-500' : 'text-gray-400'}`}>
                            {formatCurrencyUSD(metrics.invoiceOutstanding)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Install Progress */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Installation Progress</h4>
                    <div className="bg-gray-800/50 p-3 rounded">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-400">
                          {metrics.byStatus.installed} of {metrics.totalCommitments} items installed
                        </span>
                        <span className="text-sm text-white font-bold">{metrics.installPct}%</span>
                      </div>
                      <Progress value={metrics.installPct} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Modals - FORWARD MODEL (no pool modals) */}
      {deltaOrderCommitment && (
        <DeltaOrderModal
          commitment={{
            id: deltaOrderCommitment.id,
            commitment_status: deltaOrderCommitment.commitment_status,
            required_total: deltaOrderCommitment.required_total,
            reserved_from_stock: deltaOrderCommitment.reserved_from_stock,
            covered_from_po: deltaOrderCommitment.covered_from_po,
            qty_installed: deltaOrderCommitment.qty_installed,
            unit_cost_snapshot: deltaOrderCommitment.unit_cost,
          }}
          part={deltaOrderCommitment.part}
          onClose={() => setDeltaOrderCommitment(null)}
          onSuccess={() => invalidateSupply()}
        />
      )}

      {installModal && (
        <InstallPartModal
          requirement={{ 
            part_id: installModal.part_id, 
            project_id: projectId,
            commitment_id: installModal.id
          }}
          part={installModal.part}
          onClose={() => setInstallModal(null)}
          onSuccess={() => {
            invalidateSupply();
            setInstallModal(null);
          }}
        />
      )}

      {reverseInstallModal && (
        <ReverseInstallationModal
          installedParts={[]}
          commitment={{
            id: reverseInstallModal.id,
            commitment_status: reverseInstallModal.commitment_status,
            qty_installed: reverseInstallModal.qty_installed,
            part_id: reverseInstallModal.part_id,
            project_id: reverseInstallModal.project_id,
          }}
          onClose={() => setReverseInstallModal(null)}
          onSuccess={() => {
            invalidateSupply();
            setReverseInstallModal(null);
          }}
        />
      )}

      {receiveModal && (
        <ReceiveInventoryModal
          commitment={{
            id: receiveModal.id,
            commitment_status: receiveModal.commitment_status,
            required_total: receiveModal.required_total,
            reserved_from_stock: receiveModal.reserved_from_stock,
            covered_from_po: receiveModal.covered_from_po,
            on_order_qty: receiveModal.on_order_qty,
            part_id: receiveModal.part_id,
            project_id: receiveModal.project_id,
          }}
          part={receiveModal.part}
          onClose={() => setReceiveModal(null)}
          onSuccess={() => {
            invalidateSupply();
            setReceiveModal(null);
          }}
        />
      )}

      {cancelModal && (
        <CancelCommitmentModal
          commitment={{
            id: cancelModal.id,
            commitment_status: cancelModal.commitment_status,
            required_total: cancelModal.required_total,
            reserved_from_stock: cancelModal.reserved_from_stock,
            covered_from_po: cancelModal.covered_from_po,
            qty_installed: cancelModal.qty_installed,
            part_id: cancelModal.part_id,
            project_id: cancelModal.project_id,
          }}
          part={cancelModal.part}
          project={project}
          onClose={() => setCancelModal(null)}
          onSuccess={() => {
            invalidateSupply();
            setCancelModal(null);
            toast.success('Commitment removed');
          }}
        />
      )}

      {qtyManagerDrawer && (
        <CommitmentQuantityDrawer
          open={!!qtyManagerDrawer}
          onClose={() => setQtyManagerDrawer(null)}
          commitment={{
            id: qtyManagerDrawer.id,
            commitment_status: qtyManagerDrawer.commitment_status,
            required_total: qtyManagerDrawer.required_total,
            reserved_from_stock: qtyManagerDrawer.reserved_from_stock,
            covered_from_po: qtyManagerDrawer.covered_from_po,
            qty_installed: qtyManagerDrawer.qty_installed,
            part_id: qtyManagerDrawer.part_id,
            project_id: qtyManagerDrawer.project_id,
          }}
          part={qtyManagerDrawer.part}
          onSuccess={() => {
            invalidateSupply();
          }}
        />
      )}

      {/* Bulk PO Preview Modal */}
      {showBulkPOPreview && bulkPOPreviewData && (
        <BulkPOPreviewModal
          preview={bulkPOPreviewData}
          onClose={() => {
            setShowBulkPOPreview(false);
            setBulkPOPreviewData(null);
          }}
          onConfirm={handleBulkPOExecute}
          isLoading={isBulkPOLoading}
        />
      )}

      {/* Vendor Picker for single PO when part has no default vendor */}
      {vendorPickerCommitment && (
        <VendorPickerModal
          commitment={vendorPickerCommitment}
          onClose={() => setVendorPickerCommitment(null)}
          onSelect={(vendorId) => handleSinglePOCreate(vendorPickerCommitment, vendorId)}
        />
      )}

      {/* Blocked Action Resolution Modal */}
      {blockedItems && (
        <BlockedActionResolutionModal
          blocked={blockedItems}
          projectId={projectId}
          onClose={() => setBlockedItems(null)}
          onResolved={() => {
            setBlockedItems(null);
            invalidateSupply();
          }}
          onResolveVendor={resolveVendor}
          onResolveBilling={resolveBilling}
          onResolveQty={resolveQty}
          onResolveInvariant={resolveInvariant}
        />
      )}
      
      {/* Edit Part Drawer - Opens when part name clicked */}
      {selectedPartId && (
        <EditPartDrawer
          partId={selectedPartId}
          open={!!selectedPartId}
          onClose={() => setSelectedPartId(null)}
        />
      )}
    </MobileSafeAreaContainer>
  );
}

// === BULK PO PREVIEW MODAL ===
function BulkPOPreviewModal({ preview, onClose, onConfirm, isLoading }) {
  const vendorGroups = preview.preview?.vendor_groups || [];
  const blocked = preview.blocked || [];
  const summary = preview.summary || {};

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-green-400" />
            Create Purchase Orders
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-green-900/30 rounded-lg">
              <p className="text-2xl font-bold text-green-400">{summary.order_count || vendorGroups.length}</p>
              <p className="text-xs text-gray-400">Orders to Create</p>
            </div>
            <div className="p-3 bg-blue-900/30 rounded-lg">
              <p className="text-2xl font-bold text-blue-400">{summary.eligible_count}</p>
              <p className="text-xs text-gray-400">Line Items</p>
            </div>
            <div className="p-3 bg-yellow-900/30 rounded-lg">
              <p className="text-2xl font-bold text-yellow-400">{blocked.length}</p>
              <p className="text-xs text-gray-400">Blocked</p>
            </div>
          </div>

          {/* Vendor Groups */}
          {vendorGroups.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-300">Orders by Vendor:</p>
              {vendorGroups.map((group, idx) => (
                <div key={idx} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium">{group.vendor_name}</span>
                    <Badge variant="outline" className="border-green-600 text-green-400">
                      {group.commitment_count} items
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-sm text-gray-400">
                    <span>Total Qty: {group.total_qty}</span>
                    <span>Est. Cost: ${group.estimated_cost?.toFixed(2)}</span>
                  </div>
                </div>
              ))}
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
                    <span className="text-yellow-400 ml-2">- {item.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading || vendorGroups.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 mr-2" />
                Create {vendorGroups.length} PO(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// === VENDOR PICKER MODAL ===
function VendorPickerModal({ commitment, onClose, onSelect }) {
  const [selectedVendor, setSelectedVendor] = useState('');
  
  // Fetch vendors from read model
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.filter({ active: true }),
  });

  // Access part from canonical commitment structure
  const part = commitment.part;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Select Vendor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5" />
              <div>
                <p className="text-sm text-yellow-200">No default vendor for this part</p>
                <p className="text-xs text-yellow-400/70">
                  Please select a vendor to create the purchase order.
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-gray-800/50 rounded-lg">
            <p className="text-white font-medium">{part?.part_name}</p>
            {part?.vendor_part_number && (
              <p className="text-xs text-gray-400 font-mono">{part.vendor_part_number}</p>
            )}
            <p className="text-sm text-gray-400 mt-1">
              Qty to Order: <span className="text-purple-400">{commitment.to_order}</span>
            </p>
          </div>

          <div>
            <Label className="text-gray-300">Vendor</Label>
            <Select value={selectedVendor} onValueChange={setSelectedVendor}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                <SelectValue placeholder="Select vendor..." />
              </SelectTrigger>
              <SelectContent>
                {vendors.map(v => (
                  <SelectItem key={v.id} value={v.id}>
                    <span style={{ color: v.color }}>{v.vendor_name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button
            onClick={() => onSelect(selectedVendor)}
            disabled={!selectedVendor}
            className="bg-green-600 hover:bg-green-700"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Create PO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}