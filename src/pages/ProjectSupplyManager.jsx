import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ArrowLeft, RefreshCw, Search,
  Wrench, FileText, AlertCircle, DollarSign
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
import RemovePartCreditModal from "@/components/supply/RemovePartCreditModal";
import SupplyIntegrityBanner from "@/components/supply/SupplyIntegrityBanner";
import BlockedActionResolutionModal from "@/components/supply/BlockedActionResolutionModal";
import CommitmentQuantityDrawer from "@/components/parts/CommitmentQuantityDrawer";
import CoverageDiagnosticsPanel from "@/components/parts/CoverageDiagnosticsPanel";
import { useProjectSupplyView } from "@/components/supply/useProjectSupplyView";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import SafeRenderBoundary from "@/components/ui/SafeRenderBoundary";
import AddPartButton from "@/components/supply/AddPartButton";
import ForwardInvoiceDashboard from "@/components/financial/ForwardInvoiceDashboard";
import { useWiringAudit } from "@/components/dev/wiringAudit";
import PartModal from "@/components/parts/PartModal";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { filterActiveCommitments } from "@/components/supply/lifecycleDisplay";
import { validateInventoryConsistency } from "@/components/supply/inventoryResolver";
import { validateSupplyModelDrift } from "@/components/supply/ExecutionDataBlock";
// BillingSummaryStrip and ProjectFinancialBar removed — consolidated into PSMFinancialSummary
import PSMGroupedView, { PSMSummaryStrip } from "@/components/supply/PSMGroupedCards";
import ProjectSupplySummaryBar, { filterByActionCategory } from "@/components/supply/ProjectSupplySummaryBar";
import PSMFloatingActionBar from "@/components/supply/PSMFloatingActionBar";
import PSMFinancialSummary from "@/components/supply/PSMFinancialSummary";
import ReportTab from "@/components/supply/ReportTab";
import CommitmentPricingEditor from "@/components/supply/CommitmentPricingEditor";
import CommitmentBillingDiagnostics from "@/components/financial/CommitmentBillingDiagnostics";
import InvoiceReconciliationDiagnostics from "@/components/financial/InvoiceReconciliationDiagnostics";
import ResolveNeedModal from "@/components/supply/ResolveNeedModal";
import BackfillPOCostsModal from "@/components/supply/BackfillPOCostsModal";
import ProjectPurchaseOrders from "@/components/project/ProjectPurchaseOrders";
import ProjectServicesSection from "@/components/supply/ProjectServicesSection";
import { useServicesView } from "@/components/supply/useServicesView";
import { Progress } from "@/components/ui/progress";
import BulkPOPreviewModal from "@/components/supply/BulkPOPreviewModal";
import BulkSyncResultModal from "@/components/supply/BulkSyncResultModal";
import { cn } from "@/lib/utils";
import { Receipt, Download, ClipboardList, Truck as TruckIcon } from "lucide-react";
import ReceivingGapDiagnosticsPanel from "@/components/supply/ReceivingGapDiagnosticsPanel";
import IntegrityViolationSummary from "@/components/supply/IntegrityViolationSummary";
import { resolveCanonicalCommitment, normalizeCommitmentForModal, validateCommitmentForModal } from "@/components/supply/commitmentModalAdapter";

/**
 * ProjectSupplyManager - Per-Project Execution
 * Route: /supply/project/:projectId
 * 
 * Tabs: Plan, Buy, Receive, Install, Invoice, Report
 */
export default function ProjectSupplyManager() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const audit = useWiringAudit('ProjectSupplyManager');
  const urlParams = new URLSearchParams(window.location.search);
  const rawProjectId = urlParams.get('project_id');
  // DETERMINISTIC: Normalize projectId once - null if invalid
  const projectId = 
    rawProjectId !== undefined && rawProjectId !== null && rawProjectId !== ""
      ? String(rawProjectId)
      : null;
  
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
    invoices: projectInvoices,
    isLoading: supplyLoading, 
    isFetching: supplyFetching,
    refetch: refetchSupply,
    invalidate: invalidateSupply
  } = useProjectSupplyView(projectId);
  
  // Diagnostic logging — debug flag only
  if (localStorage.getItem('ak_debug_coverage') === 'true') {
    console.log("[PSM] Items:", supplyItems?.length ?? 0, "Loading:", supplyLoading);
  }

  // FORWARD MODEL ONLY - No legacy support
  const ALLOWED_TABS = ['plan', 'buy', 'receive', 'install', 'invoice', 'orders', 'services', 'report'];
  
  const rawTab = urlParams.get('tab');
  // Remap legacy fund tab to invoice
  const remappedTab = rawTab === 'fund' ? 'invoice' : rawTab;
  const initialTab = ALLOWED_TABS.includes(remappedTab) ? remappedTab : 'plan';

  // Canonical services read model — for financial summary integration
  const { summary: servicesSummary } = useServicesView(
    projectId ? { project_id: projectId } : {}
  );

  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupMode, setGroupMode] = useState('category'); // 'category' | 'vendor' | 'coverage'
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
  const [removeCreditModal, setRemoveCreditModal] = useState(null);
  // CANONICAL: Actions are ONLY disabled by true quantity violations (integrity.blocking)
  // Financial conditions (cost_at_risk, invoiced < planned) NEVER block actions
  const [actionsEnabled, setActionsEnabled] = useState(true);
  const [hasBlockingViolations, setHasBlockingViolations] = useState(false);
  const [qtyManagerDrawer, setQtyManagerDrawer] = useState(null);
  
  // Unified PO creation states
  const [showBulkPOPreview, setShowBulkPOPreview] = useState(false);
  const [bulkPOPreviewData, setBulkPOPreviewData] = useState(null);
  const [isBulkPOLoading, setIsBulkPOLoading] = useState(false);
  const [singlePOCommitment, setSinglePOCommitment] = useState(null);
  const [vendorPickerCommitment, setVendorPickerCommitment] = useState(null);
  
  // Blocked items resolution state
  const [blockedItems, setBlockedItems] = useState(null);
  
  // Pricing editor state
  const [pricingEditorCommitment, setPricingEditorCommitment] = useState(null);
  
  // Backfill modal state
  const [showBackfillModal, setShowBackfillModal] = useState(false);
  
  // Bulk sync result modal
  const [syncResultData, setSyncResultData] = useState(null);
  
  // Resolve Need modal
  const [resolveNeedTarget, setResolveNeedTarget] = useState(null);
  // Diagnostics overlay toggle (dev/admin)
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  // Phase 4: Action filter for summary bar
  const [actionFilter, setActionFilter] = useState(null);

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

  // Build vendor lookup from supply items (vendors embedded in read model)
  const vendorsMap = useMemo(() => {
    const map = new Map();
    for (const item of supplyItems) {
      if (item.vendor_id && item.vendor_name) {
        map.set(item.vendor_id, { id: item.vendor_id, vendor_name: item.vendor_name });
      }
    }
    return map;
  }, [supplyItems]);

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

  // Metrics from read model summary — CANONICAL totals from resolver
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
      // CANONICAL: Sub-breakdowns from resolver
      partsPlannedRetail: s.parts_planned_retail || 0,
      partsPlannedCost: s.parts_planned_cost || 0,
      servicesCost: s.services_planned_cost || 0,
      servicesRetail: s.services_planned_retail || 0,
      creditTotal: s.credit_total || 0,
      reconciliation: s.reconciliation || null,
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
      
      // Drift validation — debug flag only (per-item, perf-sensitive)
      if (localStorage.getItem('ak_debug_coverage') === 'true') {
        validateSupplyModelDrift([item], 'ProjectSupplyManager');
      }

      // Build category object from read model data
      const categoryObj = item.category_id ? categoriesMap.get(item.category_id) : null;
      
      // Derive allowed actions from CANONICAL fields (read model) ONLY
      // NO _raw fallback - read model is the single source of truth
      // Phase 7: invoiced_qty from read model for invoice eligibility
      const allowed = getAllowedCommitmentActions({
        required_total: item.required_total,
        qty_removed: item.qty_removed ?? 0,
        effective_required: item.effective_required,
        reserved_from_stock: item.reserved_from_stock,
        covered_from_po: item.covered_from_po,
        qty_installed: item.qty_installed,
        to_order: item.to_order_qty ?? item.to_order ?? 0,
        needs_order: item.needs_order,
        commitment_fulfilled: item.commitment_fulfilled,
        commitment_status: item._raw?.commitment_status || 'planned',
        billing_status: item.billing_status || 'billable',
        received_qty: item.received_qty || 0,
        invoiced_qty: item.invoiced_qty ?? 0,
        unit_retail_snapshot: item.unit_retail,
      });

      // Build coverage block from canonical fields - NO local computation
      const coverage = {
        required_total: item.required_total,
        effective_required: item.effective_required,
        reserved_from_stock: item.reserved_from_stock,
        covered_from_po: item.covered_from_po,
        qty_installed: item.qty_installed,
        coverage_qty: item.coverage_qty,
        to_order_qty: item.to_order_qty ?? item.to_order ?? 0,
        needs_order: item.needs_order,
        commitment_fulfilled: item.commitment_fulfilled,
        coverage_total: item.coverage_qty,
        gap_qty: item.to_order_qty ?? item.to_order ?? 0,
        coverage_status: item.coverage_status,
        coverage_percent: item.coverage_percent,
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
        qty_removed: item.qty_removed ?? 0,
        effective_required: item.effective_required,
        reserved_from_stock: item.reserved_from_stock,
        covered_from_po: item.covered_from_po,
        qty_installed: item.qty_installed,
        // FIX 5: Single canonical field — to_order_qty only, no dual alias
        coverage_qty: item.coverage_qty,
        to_order_qty: item.to_order_qty ?? item.to_order ?? 0,
        needs_order: item.needs_order,
        commitment_fulfilled: item.commitment_fulfilled,
        
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
        billing_status: item.billing_status,
        
        // CANONICAL: cost_at_risk from backend only — no local recomputation
        cost_at_risk: item.cost_at_risk ?? 0,
        // FIX 1: Margin from backend actual_margin (uses PO cost), NOT local planned computation
        resolved_margin: item.actual_margin ?? item.resolved_margin ?? 0,
        // Actual margin fields from backend for display
        actual_margin: item.actual_margin ?? 0,
        planned_margin: item.planned_margin ?? 0,
        margin_delta: item.margin_delta ?? 0,
        
        // CANONICAL: billing_state for 3-state filter (NOT_INVOICED, INVOICED, PAID)
        billing_state: item.billing_state || 'NOT_INVOICED',
        
        // CANONICAL: Per-commitment quantity integrity state from read model
        // Only quantity violations — financial/structural conditions excluded
        integrity: item.integrity || { quantity_valid: true, violations: [], quantity_violation: false, blocking: false, valid: true },
        
        // Phase 7: Invoice tracking fields from read model
        invoiced_qty: item.invoiced_qty ?? 0,
        invoiced_amount: item.invoiced_amount ?? 0,
        
        // Inventory snapshot from read model
        inventory_snapshot: item.inventory_snapshot,
        
        // PART 3: Inventory location for expanded detail view
        inventory_location: item.inventory_location || null,
        
        // PO fields for "View PO" navigation
        order_id: item.order_id ?? null,
        order_number: item.order_number ?? null,
        
        // CANONICAL: order_line_item_ids promoted to top-level — no _raw fallback
        order_line_item_ids: item.order_line_item_ids || [],
        
        // Override flags for pricing
        cost_override: item._raw?.cost_override || false,
        retail_override: item._raw?.retail_override || false,
        unit_cost_snapshot: item.unit_cost,
        unit_retail_snapshot: item.unit_retail,
        
        // Raw commitment reference for modal access
        _raw: item._raw || {},
      };
    });
  }, [supplyItems, categoriesMap]);

  // ═══════════════════════════════════════════════════════════════════
  // CANONICAL ACTION GATE — Single source of truth for actionsEnabled
  // ONLY quantity violations (integrity.quantity_violation) can disable actions
  // Financial conditions (cost_at_risk, invoiced < planned) NEVER block
  // Structural recommendations (supplyProductionGateV2) NEVER block
  // ═══════════════════════════════════════════════════════════════════
  const quantityViolationItems = useMemo(() => {
    return enrichedCommitments.filter(c => c.integrity?.quantity_violation === true || c.integrity?.blocking === true);
  }, [enrichedCommitments]);

  const hasQuantityViolations = quantityViolationItems.length > 0;
  const actionsDisabledByIntegrity = hasQuantityViolations;

  React.useEffect(() => {
    setHasBlockingViolations(hasQuantityViolations);
    setActionsEnabled(!actionsDisabledByIntegrity);

    // PHASE 5: Dev assertion — impossible state detector
    if (import.meta.env.DEV && !actionsEnabled && quantityViolationItems.length === 0) {
      console.error(
        '[INTEGRITY GUARDRAIL] Invalid state: actions disabled without quantity violation. ' +
        'This means a financial or structural condition is incorrectly blocking actions.'
      );
    }
  }, [hasQuantityViolations, actionsDisabledByIntegrity]);

  // ═══════════════════════════════════════════════════════════════════
  // CANONICAL DATA CONTRACT — Guarded modal setters
  // All modal open actions MUST go through these guards.
  // Diagnostic panels, floating action bars, and PSMGroupedCards
  // may pass partial/minimal commitment refs — these guards resolve
  // to the full enriched object or reject with a console warning.
  // ═══════════════════════════════════════════════════════════════════
  // CANONICAL MODAL OPENERS — resolve + normalize + validate before setting state
  const openModal = useCallback((modalName, setter, incoming) => {
    const resolved = resolveCanonicalCommitment(incoming, enrichedCommitments);
    if (!resolved) {
      console.warn(`[ModalGuard:${modalName}] Rejected — no canonical match:`, incoming?.id || incoming);
      toast.error(`Cannot open ${modalName}: commitment not found`);
      return;
    }
    const normalized = normalizeCommitmentForModal(resolved);
    const { valid, missing } = validateCommitmentForModal(normalized, modalName);
    if (!valid) {
      console.warn(`[ModalGuard:${modalName}] Invalid commitment — missing:`, missing);
      toast.error(`Cannot open ${modalName}: invalid data`);
      return;
    }
    setter(normalized);
  }, [enrichedCommitments]);

  const guardedSetQtyManagerDrawer = useCallback((incoming) => openModal('Quantity Manager', setQtyManagerDrawer, incoming), [openModal]);
  const guardedSetReceiveModal = useCallback((incoming) => openModal('Receive', setReceiveModal, incoming), [openModal]);
  const guardedSetInstallModal = useCallback((incoming) => openModal('Install', setInstallModal, incoming), [openModal]);
  const guardedSetReverseInstallModal = useCallback((incoming) => openModal('Reverse Install', setReverseInstallModal, incoming), [openModal]);
  const guardedSetDeltaOrderCommitment = useCallback((incoming) => openModal('Delta Order', setDeltaOrderCommitment, incoming), [openModal]);
  const guardedSetCancelModal = useCallback((incoming) => openModal('Cancel', setCancelModal, incoming), [openModal]);
  const guardedSetRemoveCreditModal = useCallback((incoming) => openModal('Remove Credit', setRemoveCreditModal, incoming), [openModal]);
  const guardedSetPricingEditor = useCallback((incoming) => openModal('Pricing Editor', setPricingEditorCommitment, incoming), [openModal]);
  const guardedSetResolveNeedTarget = useCallback((incoming) => openModal('Resolve Need', setResolveNeedTarget, incoming), [openModal]);

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
        // CANONICAL: Buy tab shows ONLY items where backend needs_order === true
        filtered = filtered.filter(c => c.needs_order === true);
        break;
      case 'receive':
        // CANONICAL: Uses backend needs_receive flag — commitment has PO but isn't fulfilled
        filtered = filtered.filter(c => {
          if (c.commitment_fulfilled === true) return false;
          return (c.covered_from_po ?? 0) > 0 && c.needs_order !== true;
        });
        break;
      case 'install':
        // PHASE 7: Items with in-stock parts that can be installed
        // Install eligibility depends ONLY on inventory: reserved_from_stock > qty_installed
        // Does NOT depend on billing_status, payment, or credit state
        filtered = filtered.filter(c => {
          const reservedProject = c.reserved_from_stock ?? 0;
          const installed = c.qty_installed ?? 0;
          return reservedProject > installed;
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

    // Phase 4: Apply action category filter from summary bar
    if (actionFilter) {
      filtered = filterByActionCategory(filtered, actionFilter);
    }

    return filtered;
  };

  // NOTE: Old table-based rendering functions removed.
  // Now using PSMGroupedView component for GNO-style card layout.

  // CANONICAL: Single refresh handler for ALL modal success callbacks.
  // Uses forceAppRefresh for comprehensive cross-domain invalidation + refetch.
  const handleModalSuccess = useCallback(async () => {
    await forceAppRefresh(queryClient, { projectIds: [projectId] });
  }, [queryClient, projectId]);

  // BULLETPROOF REFRESH: Detect when ANY modal closes and force refetch.
  // Child modals use their own internal useSupplyAction which calls forceAppRefresh,
  // but that may not reliably refetch the PSM's projectSupplyView due to staleTime.
  // This ensures the PSM always gets fresh data when a modal dismisses.
  const anyModalOpen = !!(
    orderModalPart || deltaOrderCommitment || installModal || reverseInstallModal ||
    receiveModal || cancelModal || removeCreditModal || qtyManagerDrawer ||
    pricingEditorCommitment || showBulkPOPreview || vendorPickerCommitment ||
    blockedItems || selectedPartId || showBackfillModal || resolveNeedTarget
  );
  const prevModalOpen = useRef(anyModalOpen);
  useEffect(() => {
    if (prevModalOpen.current && !anyModalOpen) {
      // A modal just closed — force refetch
      refetchSupply();
    }
    prevModalOpen.current = anyModalOpen;
  }, [anyModalOpen, refetchSupply]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await forceAppRefresh(queryClient, { projectIds: [projectId] });
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
    
    // PHASE 6: PROCUREMENT GUARD - Disable ordering when gap_qty === 0
    // Check if any selected items have to_order <= 0 OR coverage_status === 'FULL'
    const selectedWithZeroOrder = enrichedCommitments.filter(
      c => selectedItems.has(c.id) && ((c.to_order_qty ?? 0) <= 0 || c.coverage_status === 'FULL')
    );
    if (selectedWithZeroOrder.length > 0) {
      const fullyCovered = selectedWithZeroOrder.filter(c => c.coverage_status === 'FULL');
      if (fullyCovered.length > 0) {
        toast.error(`${fullyCovered.length} item(s) are fully covered - cannot create PO for covered items.`);
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

      // Clear selection - stay on Buy tab (no navigation)
      setSelectedItems(new Set());
      setShowBulkPOPreview(false);
      setBulkPOPreviewData(null);
      
      // Comprehensive refresh after PO creation
      await handleModalSuccess();
      
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

      // Comprehensive refresh after PO creation
      await handleModalSuccess();
      audit.trackSuccess('single_po_create');
    } catch (error) {
      audit.trackError('single_po_create', error);
      toast.error('Failed to create PO: ' + error.message);
    } finally {
      setActionsEnabled(!hasBlockingViolations);
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
    const c = enrichedCommitments.find(c => c.id === commitmentId);
    if (c) setVendorPickerCommitment(c);
  };

  const resolveBilling = (commitmentId) => {
    // FORWARD MODEL: Navigate to invoice tab
    handleTabChange('invoice');
    toast.info('Create invoice to cover this commitment');
  };

  const resolveQty = (commitmentId) => {
    const commitment = enrichedCommitments.find(c => c.id === commitmentId);
    if (commitment) guardedSetQtyManagerDrawer(commitment);
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

  // === PRICING ACTIONS ===
  const handleEditPricing = useCallback((commitment) => {
    guardedSetPricingEditor(commitment);
  }, [guardedSetPricingEditor]);

  const handleSyncCost = useCallback(async (commitment) => {
    try {
      await base44.functions.invoke('executeSupplyAction', {
        action_type: 'SYNC_PO_COST',
        commitment_ids: [commitment.id],
      });
      toast.success('Costs updated from PO');
      await handleModalSuccess();
    } catch (err) {
      toast.error('Sync failed: ' + err.message);
    }
  }, [handleModalSuccess]);

  const handleBatchSyncCost = useCallback(async (commitmentIds) => {
    // Accept explicit array (from monitor) or use selectedItems
    const ids = Array.isArray(commitmentIds) ? commitmentIds : Array.from(selectedItems);
    if (ids.length === 0) {
      toast.error('No items to sync');
      return;
    }
    try {
      const result = await base44.functions.invoke('syncPOCostToCommitment', {
        commitment_ids: ids,
      });
      const data = result.data || result;
      const updated = data.synced?.length || 0;
      const skipped = data.skipped?.length || 0;
      const errCount = data.errors?.length || 0;
      const missing = data.skipped?.filter(s => s.reason === 'ZERO_COST' || s.reason === 'NO_PO_LINES').length || 0;
      
      // Toast summary
      if (updated > 0) {
        toast.success(`${updated} commitment(s) updated`, {
          description: [skipped > 0 ? `${skipped} skipped` : null, missing > 0 ? `${missing} missing cost` : null, errCount > 0 ? `${errCount} failed` : null].filter(Boolean).join(' \u00b7 ') || undefined
        });
      } else {
        toast.info(`No changes needed. ${skipped} skipped.`);
      }
      
      // Show detailed modal if there were issues or large batch
      if (ids.length > 3 || errCount > 0 || missing > 0) {
        setSyncResultData(data);
      }
      
      setSelectedItems(new Set());
      await handleModalSuccess();
    } catch (err) {
      toast.error('Sync failed: ' + err.message);
    }
  }, [selectedItems, handleModalSuccess]);

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
                onClick={() => window.history.length > 1 ? navigate(-1) : navigate(createPageUrl('SupplyLanding'))}
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
              <Button
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                variant="outline"
                size="sm"
                className={cn(
                  "border-gray-700 text-white gap-2",
                  showDiagnostics && "bg-amber-900/30 border-amber-700"
                )}
              >
                <Wrench className="w-4 h-4" />
                Diagnostics
              </Button>
              <CoverageDiagnosticsPanel 
                projectId={projectId}
                onOpenCommitment={guardedSetQtyManagerDrawer}
              />
            </div>
          </div>

          {/* Phase 7: Billing Drift Diagnostics Panel + Admin Actions */}
          {showDiagnostics && (
            <div className="space-y-3">
              <InvoiceReconciliationDiagnostics
                projectInvoices={projectInvoices}
                projectedRevenue={metrics.totalPlannedRetail}
                operationalCost={0}
                backendSummary={supplySummary}
                enrichedCommitments={enrichedCommitments}
              />
              <CommitmentBillingDiagnostics projectId={projectId} />
              <ReceivingGapDiagnosticsPanel
                projectId={projectId}
                onReceive={guardedSetReceiveModal}
                onManageQty={guardedSetQtyManagerDrawer}
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBackfillModal(true)}
                  className="border-amber-700 text-amber-400 text-xs gap-1"
                >
                  <DollarSign className="w-3 h-3" />
                  Backfill PO Costs
                </Button>
              </div>
            </div>
          )}

          {/* ═══ BANNER CONTRACT ═══
              RED:   IntegrityViolationSummary — quantity violations ONLY → BLOCKS actions
              AMBER: SupplyIntegrityBanner    — structural recommendations → NEVER blocks
              Financial conditions (cost_at_risk, invoiced<planned) are shown in PSMFinancialSummary, never here
          ═══════════════════════ */}
          <IntegrityViolationSummary items={enrichedCommitments} />

          {/* Structural recommendations only — NEVER blocks actions */}
          <SupplyIntegrityBanner 
            projectId={projectId}
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

          {/* Financial Summary - Revenue + Cost Exposure + Capital Breakdown + Cashflow Risk */}
          <PSMFinancialSummary
            enrichedCommitments={enrichedCommitments}
            metrics={metrics}
            servicesSummary={servicesSummary}
            projectInvoices={projectInvoices}
          />

          {/* Financial overview consolidated into PSMFinancialSummary above */}

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
              <TabsTrigger value="orders" className="data-[state=active]:bg-indigo-900/30 gap-1.5">
                <ClipboardList className="w-4 h-4" />
                Purchase Orders
              </TabsTrigger>
              <TabsTrigger value="services" className="data-[state=active]:bg-amber-900/30 gap-1.5">
                <TruckIcon className="w-4 h-4" />
                Services (Non-Inventory)
              </TabsTrigger>
              <TabsTrigger value="report" className="data-[state=active]:bg-red-900/30 gap-1.5">
                <FileText className="w-4 h-4" />
                Report
              </TabsTrigger>
            </TabsList>

            {/* Tab Contents - GNO-style card-based grouped views */}
            <TabsContent value="plan" className="mt-4 space-y-4">
              {/* Tab Header */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Planned Requirements</h2>
                  <p className="text-xs text-gray-500">Auto: reserves stock first, remainder goes to order queue.</p>
                </div>
                <div className="flex items-center gap-2">
                  <AddPartButton projectId={projectId} onSuccess={handleModalSuccess} />
                </div>
              </div>

              {/* Controls Row */}
              <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search parts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 text-white h-8 text-sm"
                  />
                </div>
              </div>

              {/* Phase 4: Project Supply Summary Bar with action filters */}
              <ProjectSupplySummaryBar
                items={enrichedCommitments.filter(c => c.commitment_status !== 'cancelled' && c.commitment_status !== 'closed')}
                activeFilter={actionFilter}
                onFilterChange={setActionFilter}
              />

              {/* Summary Strip */}
              <PSMSummaryStrip items={getFilteredCommitments('plan')} tab="plan" />

              {/* Grouped Cards - includes built-in grouping/sorting controls */}
              <PSMGroupedView
                items={filterActiveCommitments(getFilteredCommitments('plan'), showClosedCancelled)}
                groupMode={groupMode}
                onGroupModeChange={setGroupMode}
                selectedItems={selectedItems}
                setSelectedItems={setSelectedItems}
                onPartClick={handlePartClick}
                onCreatePO={handleSinglePOCreate}
                onReceive={guardedSetReceiveModal}
                onInstall={guardedSetInstallModal}
                onReverseInstall={guardedSetReverseInstallModal}
                onDeltaOrder={guardedSetDeltaOrderCommitment}
                onManageQty={guardedSetQtyManagerDrawer}
                onCancel={guardedSetCancelModal}
                onRemoveCredit={guardedSetRemoveCreditModal}
                onEditPricing={handleEditPricing}
                onSyncCost={handleSyncCost}
                onResolveNeed={guardedSetResolveNeedTarget}
                onBatchPO={handleBulkPOPreview}
                actionsEnabled={actionsEnabled}
                categoriesMap={categoriesMap}
                vendorsMap={vendorsMap}
                tab="plan"
              />
            </TabsContent>

            {/* Invoice tab content - FORWARD MODEL */}
            <TabsContent value="invoice" className="mt-4">
              <ForwardInvoiceDashboard projectId={projectId} />
            </TabsContent>

            {/* Purchase Orders tab - All project POs */}
            <TabsContent value="orders" className="mt-4">
              <ProjectPurchaseOrders projectId={projectId} />
            </TabsContent>

            {/* Services tab - Project services (shipping, plating, etc.) */}
            <TabsContent value="services" className="mt-4">
              <ProjectServicesSection projectId={projectId} projectName={project?.name} />
            </TabsContent>

            <TabsContent value="buy" className="mt-4 space-y-4">
              {/* Tab Header */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Ready to Order</h2>
                  <p className="text-xs text-gray-500">Items gated by coverage and prepay requirements</p>
                </div>
              </div>

              {/* Controls Row */}
              <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search parts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 text-white h-8 text-sm"
                  />
                </div>
              </div>

              {/* Summary Strip */}
              <PSMSummaryStrip items={getFilteredCommitments('buy')} tab="buy" />

              {/* Grouped Cards - includes built-in grouping/sorting controls */}
              <PSMGroupedView
                items={filterActiveCommitments(getFilteredCommitments('buy'), showClosedCancelled)}
                groupMode={groupMode}
                onGroupModeChange={setGroupMode}
                selectedItems={selectedItems}
                setSelectedItems={setSelectedItems}
                onPartClick={handlePartClick}
                onCreatePO={handleSinglePOCreate}
                onReceive={guardedSetReceiveModal}
                onInstall={guardedSetInstallModal}
                onReverseInstall={guardedSetReverseInstallModal}
                onDeltaOrder={guardedSetDeltaOrderCommitment}
                onManageQty={guardedSetQtyManagerDrawer}
                onCancel={guardedSetCancelModal}
                onRemoveCredit={guardedSetRemoveCreditModal}
                onEditPricing={handleEditPricing}
                onSyncCost={handleSyncCost}
                onResolveNeed={guardedSetResolveNeedTarget}
                onBatchPO={handleBulkPOPreview}
                actionsEnabled={actionsEnabled}
                categoriesMap={categoriesMap}
                vendorsMap={vendorsMap}
                tab="buy"
              />
            </TabsContent>

            <TabsContent value="receive" className="mt-4 space-y-4">
              <SafeRenderBoundary context="Receive Tab">
              {/* Tab Header */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Receiving Queue</h2>
                  <p className="text-xs text-gray-500">Items on order awaiting delivery</p>
                </div>
              </div>

              {/* Controls Row */}
              <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search parts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 text-white h-8 text-sm"
                  />
                </div>
              </div>

              {/* Summary Strip */}
              <PSMSummaryStrip items={getFilteredCommitments('receive')} tab="receive" />

              {/* Grouped Cards - includes built-in grouping/sorting controls */}
              <PSMGroupedView
                items={filterActiveCommitments(getFilteredCommitments('receive'), showClosedCancelled)}
                groupMode={groupMode}
                onGroupModeChange={setGroupMode}
                selectedItems={selectedItems}
                setSelectedItems={setSelectedItems}
                onPartClick={handlePartClick}
                onCreatePO={handleSinglePOCreate}
                onReceive={guardedSetReceiveModal}
                onInstall={guardedSetInstallModal}
                onReverseInstall={guardedSetReverseInstallModal}
                onDeltaOrder={guardedSetDeltaOrderCommitment}
                onManageQty={guardedSetQtyManagerDrawer}
                onCancel={guardedSetCancelModal}
                onRemoveCredit={guardedSetRemoveCreditModal}
                onEditPricing={handleEditPricing}
                onSyncCost={handleSyncCost}
                onResolveNeed={guardedSetResolveNeedTarget}
                onBatchPO={handleBulkPOPreview}
                actionsEnabled={actionsEnabled}
                categoriesMap={categoriesMap}
                vendorsMap={vendorsMap}
                tab="receive"
              />
              </SafeRenderBoundary>
            </TabsContent>

            <TabsContent value="install" className="mt-4 space-y-4">
              {/* Tab Header */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Installation Queue</h2>
                  <p className="text-xs text-gray-500">Items ready to install</p>
                </div>
              </div>

              {/* Controls Row */}
              <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search parts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 text-white h-8 text-sm"
                  />
                </div>
              </div>

              {/* Summary Strip */}
              <PSMSummaryStrip items={getFilteredCommitments('install')} tab="install" />

              {/* Grouped Cards - includes built-in grouping/sorting controls */}
              <PSMGroupedView
                items={filterActiveCommitments(getFilteredCommitments('install'), showClosedCancelled)}
                groupMode={groupMode}
                onGroupModeChange={setGroupMode}
                selectedItems={selectedItems}
                setSelectedItems={setSelectedItems}
                onPartClick={handlePartClick}
                onCreatePO={handleSinglePOCreate}
                onReceive={guardedSetReceiveModal}
                onInstall={guardedSetInstallModal}
                onReverseInstall={guardedSetReverseInstallModal}
                onDeltaOrder={guardedSetDeltaOrderCommitment}
                onManageQty={guardedSetQtyManagerDrawer}
                onCancel={guardedSetCancelModal}
                onRemoveCredit={guardedSetRemoveCreditModal}
                onEditPricing={handleEditPricing}
                onSyncCost={handleSyncCost}
                onResolveNeed={guardedSetResolveNeedTarget}
                onBatchPO={handleBulkPOPreview}
                actionsEnabled={actionsEnabled}
                categoriesMap={categoriesMap}
                vendorsMap={vendorsMap}
                tab="install"
              />
            </TabsContent>

            <TabsContent value="report" className="mt-4 space-y-4">
              <ReportTab metrics={metrics} projectInvoices={projectInvoices} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Floating Action Bar for batch operations */}
      <PSMFloatingActionBar
        selectedCount={selectedItems.size}
        onClear={() => setSelectedItems(new Set())}
        onBatchPO={handleBulkPOPreview}
        onBatchSyncCost={() => handleBatchSyncCost()}
        isLoading={isBulkPOLoading}
        tab={activeTab}
      />

      {/* Pricing Editor Modal */}
      {pricingEditorCommitment && (
        <SafeRenderBoundary context="Pricing Modal">
          <CommitmentPricingEditor
           commitment={pricingEditorCommitment}
           open={!!pricingEditorCommitment}
           onClose={() => setPricingEditorCommitment(null)}
           onSuccess={() => { setPricingEditorCommitment(null); handleModalSuccess(); }}
          />
        </SafeRenderBoundary>
      )}

      {/* Backfill PO Costs Modal */}
      <BackfillPOCostsModal
        open={showBackfillModal}
        onClose={() => setShowBackfillModal(false)}
        onSuccess={handleModalSuccess}
        projectId={projectId}
      />

      {/* Modals - FORWARD MODEL (no pool modals) */}
      {/* FIX 4: Pass full enriched commitment */}
      {deltaOrderCommitment && (
        <SafeRenderBoundary context="Delta Order Modal">
          <DeltaOrderModal
            commitment={deltaOrderCommitment}
            part={deltaOrderCommitment.part}
            onClose={() => setDeltaOrderCommitment(null)}
            onSuccess={() => { setDeltaOrderCommitment(null); handleModalSuccess(); }}
          />
        </SafeRenderBoundary>
      )}

      {installModal && (
        <SafeRenderBoundary context="Install Modal">
          <InstallPartModal
            requirement={{ 
              part_id: installModal.part_id, 
              project_id: installModal.project_id || projectId,
              commitment_id: installModal.id
            }}
            commitment={installModal}
            part={installModal.part}
            onClose={() => setInstallModal(null)}
            onSuccess={() => { setInstallModal(null); handleModalSuccess(); }}
          />
        </SafeRenderBoundary>
      )}

      {reverseInstallModal && (
        <SafeRenderBoundary context="Reverse Install Modal">
          <ReverseInstallationModal
            installedPart={{
              id: reverseInstallModal.id,
              qty_consumed: reverseInstallModal.qty_installed ?? 0,
              unit_cost_at_install: reverseInstallModal.unit_cost ?? 0,
              extended_cost: (reverseInstallModal.unit_cost ?? 0) * (reverseInstallModal.qty_installed ?? 0),
            }}
            commitment={reverseInstallModal}
            part={reverseInstallModal.part}
            onClose={() => setReverseInstallModal(null)}
          />
        </SafeRenderBoundary>
      )}

      {/* FIX 3+4: Pass full enriched commitment — order_line_item_ids now top-level */}
      {receiveModal && (
        <SafeRenderBoundary context="ReceiveInventoryModal">
          <ReceiveInventoryModal
            open={true}
            commitment={receiveModal}
            part={receiveModal.part}
            onClose={() => setReceiveModal(null)}
            onSuccess={() => { setReceiveModal(null); handleModalSuccess(); }}
          />
        </SafeRenderBoundary>
      )}

      {/* FIX 2+4: Pass full enriched commitment — no payload stripping */}
      {removeCreditModal && (
        <SafeRenderBoundary context="Remove Credit Modal">
          <RemovePartCreditModal
            commitment={removeCreditModal}
            part={removeCreditModal.part}
            project={project}
            onClose={() => setRemoveCreditModal(null)}
            onSuccess={() => { setRemoveCreditModal(null); handleModalSuccess(); }}
          />
        </SafeRenderBoundary>
      )}

      {/* FIX 4: Pass full enriched commitment */}
      {cancelModal && (
        <SafeRenderBoundary context="Cancel Modal">
          <CancelCommitmentModal
            commitment={cancelModal}
            part={cancelModal.part}
            project={project}
            onClose={() => setCancelModal(null)}
            onSuccess={() => { setCancelModal(null); handleModalSuccess(); toast.success('Commitment removed'); }}
          />
        </SafeRenderBoundary>
      )}

      {/* FIX 4+6: Pass full enriched commitment — includes coverage_qty, to_order_qty, received_qty, coverage_percent */}
      {qtyManagerDrawer && (
        <SafeRenderBoundary context="Quantity Modal">
          <CommitmentQuantityDrawer
            open={!!qtyManagerDrawer}
            onClose={() => setQtyManagerDrawer(null)}
            commitment={qtyManagerDrawer}
            part={qtyManagerDrawer.part}
            onSuccess={handleModalSuccess}
          />
        </SafeRenderBoundary>
      )}

      {/* Bulk PO Preview Modal — Enhanced with expand/collapse */}
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

      {/* Bulk Sync Cost Result Modal */}
      <BulkSyncResultModal
        open={!!syncResultData}
        onClose={() => setSyncResultData(null)}
        result={syncResultData}
      />

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
            handleModalSuccess();
          }}
          onResolveVendor={resolveVendor}
          onResolveBilling={resolveBilling}
          onResolveQty={resolveQty}
          onResolveInvariant={resolveInvariant}
        />
      )}
      
      {/* Resolve Need Modal */}
      {resolveNeedTarget && (
        <ResolveNeedModal
          open={true}
          onClose={() => setResolveNeedTarget(null)}
          item={resolveNeedTarget}
          onSuccess={() => {
            setResolveNeedTarget(null);
            handleModalSuccess();
          }}
        />
      )}

      {/* PartModal - Opens when part name clicked */}
      {selectedPartId && (
        <PartModal
          partId={selectedPartId}
          onClose={() => { setSelectedPartId(null); handleModalSuccess(); }}
        />
      )}
    </MobileSafeAreaContainer>
  );
}

// Old BulkPOPreviewModal removed — now imported from components/supply/BulkPOPreviewModal

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