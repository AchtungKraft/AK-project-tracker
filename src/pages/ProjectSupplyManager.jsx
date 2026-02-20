import React, { useState, useMemo } from "react";
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
  ShoppingCart, Package, Truck, AlertTriangle, DollarSign,
  ArrowLeft, Plus, MoreVertical, RefreshCw, Search, Wallet,
  Wrench, X, FileText, Edit, Trash2, Download,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import { getAllowedCommitmentActions } from "@/components/lifecycle/getAllowedCommitmentActions";
import DeltaOrderModal from "@/components/parts/DeltaOrderModal";
// LEGACY ONLY: Pool modals not rendered for forward model projects
import CreatePoolModal from "@/components/financial/CreatePoolModal";
import InstallPartModal from "@/components/project/InstallPartModal";
import ReverseInstallationModal from "@/components/project/ReverseInstallationModal";
import ReceiveInventoryModal from "@/components/receiving/ReceiveInventoryModal";
import AllocatePoolModal from "@/components/financial/AllocatePoolModal";
import CancelCommitmentModal from "@/components/parts/CancelCommitmentModal";
import SupplyIntegrityBanner from "@/components/supply/SupplyIntegrityBanner";
import PoolActionsMenu from "@/components/financial/PoolActionsMenu";
import BlockedActionResolutionModal from "@/components/supply/BlockedActionResolutionModal";
import CommitmentQuantityDrawer from "@/components/parts/CommitmentQuantityDrawer";
import { InlineQtyStepper } from "@/components/parts/CommitmentQuantityManager";
import { CoverageBadgeInline } from "@/components/parts/CoverageBadge";
import CoverageDiagnosticsPanel from "@/components/parts/CoverageDiagnosticsPanel";
import CoverageControlsPopover from "@/components/parts/CoverageControlsPopover";
import { useProjectSupplyView } from "@/components/supply/useProjectSupplyView";

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
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('project_id');
  
  // CANONICAL: Validate tab param against allowed values
  const ALLOWED_TABS = ['plan', 'fund', 'buy', 'receive', 'install'];
  const rawTab = urlParams.get('tab');
  const initialTab = ALLOWED_TABS.includes(rawTab) ? rawTab : 'plan';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('category'); // values: 'none' | 'category'
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Modal states
  const [showCreatePoolModal, setShowCreatePoolModal] = useState(false);
  const [orderModalPart, setOrderModalPart] = useState(null);
  const [deltaOrderCommitment, setDeltaOrderCommitment] = useState(null);
  const [installModal, setInstallModal] = useState(null);
  const [reverseInstallModal, setReverseInstallModal] = useState(null);
  const [receiveModal, setReceiveModal] = useState(null);
  const [allocateModal, setAllocateModal] = useState(null);
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
  // CANONICAL READ MODEL - Single source of truth for supply state
  // UI MUST NOT compute coverage, to_order, or next_action locally.
  // =====================================================================
  const { 
    items: supplyItems, 
    summary: supplySummary, 
    pools, 
    categories,
    project,
    isLoading: supplyLoading, 
    refetch: refetchSupply,
    invalidate: invalidateSupply
  } = useProjectSupplyView(projectId);

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

  // Metrics from read model summary
  const metrics = useMemo(() => {
    const s = supplySummary;
    return {
      byStatus: s.by_status || {
        planned: 0, ordered: 0, partiallyReceived: 0,
        received: 0, allocated: 0, installed: 0
      },
      totalPlanned: s.total_planned_retail || 0,
      totalCovered: s.total_covered_retail || 0,
      totalExposure: s.total_exposure || 0,
      coveragePct: s.coverage_percent || 0,
      poolBalance: s.pool_balance || 0,
      poolPaid: s.pool_paid || 0,
      hasOverdrawn: s.has_overdrawn || false,
      installPct: s.install_percent || 0,
      totalCommitments: supplyItems.length,
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

  // Render grouped commitment rows
  const renderGroupedCommitments = (tabFilter, showActions = true) => {
    const filtered = getFilteredCommitments(tabFilter);
    const groups = groupCommitments(filtered);

    return groups.map((group) => (
      <React.Fragment key={group.key}>
        {groupBy !== 'none' && (
          <TableRow className="bg-gray-900/70 border-l-4" style={{ borderLeftColor: group.color || '#6B7280' }}>
            <TableCell colSpan={11} className="py-2">
              <div className={`flex items-center gap-2 ${group.isChild ? 'pl-6' : ''}`}>
                {group.color && (
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: group.color }}
                  />
                )}
                <span className="text-sm font-semibold" style={{ color: group.color || '#D1D5DB' }}>
                  {group.isChild ? '↳ ' : ''}{group.categoryObj?.name || group.name}
                </span>
                <span className="text-xs text-gray-500">({group.items.length})</span>
              </div>
            </TableCell>
          </TableRow>
        )}

        {group.items.map(c => renderCommitmentRow(c, showActions))}

        {groupBy !== 'none' && (
          <TableRow className="bg-gray-900/40 border-t border-gray-800">
            <TableCell colSpan={7} />
            <TableCell className="text-right text-sm" style={{ color: group.color || '#9CA3AF' }}>
              ${group.items
                .reduce((sum, c) => sum + (c.planned_retail_total || 0), 0)
                .toFixed(0)}
            </TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        )}
      </React.Fragment>
    ));
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
    if (selectedItems.size === 0) {
      toast.error('No items selected');
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
    } catch (error) {
      toast.error('Failed to preview PO: ' + error.message);
    } finally {
      setIsBulkPOLoading(false);
    }
  };

  // Execute bulk PO creation
  const handleBulkPOExecute = async () => {
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
      
      // Clear selection
      setSelectedItems(new Set());
      setShowBulkPOPreview(false);
      setBulkPOPreviewData(null);
    } catch (error) {
      toast.error('Failed to create PO: ' + error.message);
    } finally {
      setIsBulkPOLoading(false);
    }
  };

  // Single row PO creation
  const handleSinglePOCreate = async (commitment, overrideVendorId = null) => {
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

      // Invalidate and refresh via read model
      invalidateSupply();
    } catch (error) {
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
    const commitment = enrichedCommitments.find(c => c.id === commitmentId);
    if (commitment) setAllocateModal(commitment);
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

  // Render commitment row - CANONICAL fields only
  const renderCommitmentRow = (commitment, showActions = true) => {
    const { part, vendor, allowed } = commitment;
    const nextStep = getNextStepLabel(commitment);

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
        <TableCell>
          <div className="flex items-center gap-2">
            {part?.featured_photo && (
              <div className="w-8 h-8 bg-gray-800 rounded overflow-hidden flex-shrink-0">
                <img src={part.featured_photo} alt="" className="w-full h-full object-contain" />
              </div>
            )}
            <div>
              <p className="text-white text-sm font-medium">{part?.part_name || 'Unknown Part'}</p>
              <p className="text-xs text-gray-500">{part?.vendor_part_number}</p>
            </div>
          </div>
        </TableCell>
        {/* Needed (editable stepper) - CANONICAL: required_total */}
        <TableCell className="text-center">
          <InlineQtyStepper 
            commitment={{ 
              id: commitment.id, 
              required_total: commitment.required_total,
              commitment_status: commitment.commitment_status,
            }} 
            onMutationSuccess={() => invalidateSupply()}
            disabled={!actionsEnabled}
          />
        </TableCell>
        {/* Reserved (read-only) - CANONICAL: reserved_from_stock */}
        <TableCell className="text-center">
          <span className={commitment.reserved_from_stock > 0 ? 'text-cyan-400' : 'text-gray-500'}>
            {commitment.reserved_from_stock}
          </span>
        </TableCell>
        {/* To Order (read-only) - CANONICAL: to_order */}
        <TableCell className="text-center">
          {commitment.to_order > 0 ? (
            <Badge variant="outline" className="border-purple-600 text-purple-400">
              {commitment.to_order}
            </Badge>
          ) : (
            <span className="text-gray-500">0</span>
          )}
        </TableCell>
        {/* On Order - CANONICAL: on_order_qty (from line items) */}
        <TableCell className="text-center">
          <span className={commitment.on_order_qty > 0 ? 'text-purple-400' : 'text-gray-500'}>
            {commitment.on_order_qty}
          </span>
        </TableCell>
        {/* Received - CANONICAL: received_qty */}
        <TableCell className="text-center">
          <span className={commitment.received_qty > 0 ? 'text-blue-400' : 'text-gray-500'}>
            {commitment.received_qty}
          </span>
        </TableCell>
        {/* Installed - CANONICAL: qty_installed */}
        <TableCell className="text-center">
          <span className={commitment.qty_installed > 0 ? 'text-green-400' : 'text-gray-500'}>
            {commitment.qty_installed}
          </span>
        </TableCell>
        {/* Coverage - CANONICAL: coverage_status, coverage_percent */}
        <TableCell>
          <div className="flex items-center gap-1">
            <CoverageBadgeInline 
              coverage={commitment.coverage}
              onClick={() => setQtyManagerDrawer(commitment)}
            />
            <CoverageControlsPopover
              commitment={{ 
                id: commitment.id,
                commitment_status: commitment.commitment_status,
                required_total: commitment.required_total,
                reserved_from_stock: commitment.reserved_from_stock,
                covered_from_po: commitment.covered_from_po,
              }}
              coverage={commitment.coverage}
              undoAvailable={false}
              onActionComplete={() => invalidateSupply()}
              disabled={!actionsEnabled}
            />
          </div>
        </TableCell>
        {/* Next Step - CANONICAL: next_action */}
        <TableCell>
          <Badge 
            variant="outline" 
            className="text-xs"
            style={{ 
              borderColor: nextStep.color === 'green' ? '#16a34a' : 
                           nextStep.color === 'yellow' ? '#ca8a04' :
                           nextStep.color === 'red' ? '#dc2626' :
                           nextStep.color === 'blue' ? '#2563eb' :
                           nextStep.color === 'cyan' ? '#0891b2' :
                           nextStep.color === 'purple' ? '#9333ea' : '#6b7280',
              color: nextStep.color === 'green' ? '#4ade80' : 
                     nextStep.color === 'yellow' ? '#facc15' :
                     nextStep.color === 'red' ? '#f87171' :
                     nextStep.color === 'blue' ? '#60a5fa' :
                     nextStep.color === 'cyan' ? '#22d3ee' :
                     nextStep.color === 'purple' ? '#c084fc' : '#9ca3af'
            }}
          >
            {nextStep.label}
          </Badge>
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
                {allowed.canCreatePO && (
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
                {/* LEGACY ONLY: Pool allocation option */}
                {project?.financial_model_version !== 'forward' && (
                  <>
                    <DropdownMenuSeparator className="bg-gray-700" />
                    <DropdownMenuItem 
                      onClick={() => setAllocateModal(commitment)} 
                      className="text-blue-400"
                    >
                      <DollarSign className="w-4 h-4 mr-2" />
                      Allocate Pool
                    </DropdownMenuItem>
                  </>
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
              {/* LEGACY ONLY: Pool creation for legacy financial model */}
              {project?.financial_model_version !== 'forward' && (
                <Button
                  onClick={() => setShowCreatePoolModal(true)}
                  variant="outline"
                  className="border-green-600 text-green-400 gap-2"
                >
                  <Wallet className="w-4 h-4" />
                  Create Pool
                </Button>
              )}
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

          {/* Summary Row */}
          {/* FORWARD MODEL: Shows Commitments, Planned Retail, Installed - NO exposure/pool metrics */}
          {/* LEGACY MODEL: Shows all including Exposure Gap, Pool Balance */}
          <div className={`grid gap-3 ${project?.financial_model_version === 'forward' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-6'}`}>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Commitments</p>
                <p className="text-xl font-bold text-white">{metrics.totalCommitments}</p>
              </CardContent>
            </Card>
            {/* LEGACY ONLY: Coverage percentage (pool-based) */}
            {project?.financial_model_version !== 'forward' && (
              <Card className="bg-black/40 border-gray-800">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-gray-500">Coverage</p>
                  <p className={`text-xl font-bold ${metrics.coveragePct >= 100 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {metrics.coveragePct}%
                  </p>
                </CardContent>
              </Card>
            )}
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Planned Retail</p>
                <p className="text-xl font-bold text-white">${metrics.totalPlanned.toFixed(0)}</p>
              </CardContent>
            </Card>
            {/* LEGACY ONLY: Exposure Gap (pool-based) */}
            {project?.financial_model_version !== 'forward' && (
              <Card className="bg-black/40 border-gray-800">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-gray-500">Exposure Gap</p>
                  <p className={`text-xl font-bold ${metrics.totalExposure > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    ${metrics.totalExposure.toFixed(0)}
                  </p>
                </CardContent>
              </Card>
            )}
            {/* LEGACY ONLY: Pool Balance */}
            {project?.financial_model_version !== 'forward' && (
              <Card className={`bg-black/40 ${metrics.hasOverdrawn ? 'border-red-600' : 'border-gray-800'}`}>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-gray-500">Pool Balance</p>
                  <p className={`text-xl font-bold ${metrics.poolBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${metrics.poolBalance.toFixed(0)}
                  </p>
                </CardContent>
              </Card>
            )}
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Installed</p>
                <p className="text-xl font-bold text-green-400">{metrics.installPct}%</p>
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

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="bg-black/40 border border-gray-800 w-full justify-start overflow-x-auto">
              <TabsTrigger value="plan" className="data-[state=active]:bg-gray-700 gap-1.5">
                <Package className="w-4 h-4" />
                Plan
              </TabsTrigger>
              {/* LEGACY ONLY: Fund tab for pool management */}
              {project?.financial_model_version !== 'forward' && (
                <TabsTrigger value="fund" className="data-[state=active]:bg-green-900/30 gap-1.5">
                  <Wallet className="w-4 h-4" />
                  Fund
                </TabsTrigger>
              )}
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
              <TabsTrigger value="report" className="data-[state=active]:bg-red-900/30 gap-1.5">
                <FileText className="w-4 h-4" />
                Report
              </TabsTrigger>
            </TabsList>

            {/* Tab Contents */}
            <TabsContent value="plan" className="mt-4">
              <Card className="bg-black/40 border-gray-800">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                  <CardTitle className="text-white">Planned Requirements</CardTitle>
                  <div className="flex items-center gap-2">
                    <Select value={groupBy} onValueChange={setGroupBy}>
                      <SelectTrigger className="w-40 bg-gray-900/50 border-gray-700 text-white h-9">
                        <SelectValue placeholder="Group By" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        <SelectItem value="none">No Grouping</SelectItem>
                        <SelectItem value="category">Category</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <Input
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 bg-gray-900/50 border-gray-700 text-white h-9"
                      />
                    </div>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1">
                      <Plus className="w-4 h-4" />
                      Add Part
                    </Button>
                  </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <p className="text-xs text-gray-500 px-4 py-2 border-b border-gray-800">
                    Auto: reserves stock first, remainder goes to order queue.
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800 hover:bg-transparent">
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="text-gray-400">Part</TableHead>
                        <TableHead className="text-gray-400 text-center">Needed</TableHead>
                        <TableHead className="text-gray-400 text-center">Reserved</TableHead>
                        <TableHead className="text-gray-400 text-center">To Order</TableHead>
                        <TableHead className="text-gray-400 text-center">Ordered</TableHead>
                        <TableHead className="text-gray-400 text-center">Received</TableHead>
                        <TableHead className="text-gray-400 text-center">Installed</TableHead>
                        <TableHead className="text-gray-400">Coverage</TableHead>
                        <TableHead className="text-gray-400">Next Step</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getFilteredCommitments('plan').length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center py-8 text-gray-500">
                            No planned items. All requirements are in progress or completed.
                          </TableCell>
                        </TableRow>
                      ) : (
                        renderGroupedCommitments('plan')
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* LEGACY ONLY: Fund tab content for pool management */}
            {project?.financial_model_version !== 'forward' && (
            <TabsContent value="fund" className="mt-4 space-y-4">
              {/* Pools Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pools.map(pool => (
                  <Card key={pool.id} className={`bg-black/40 ${pool.status === 'overdrawn' ? 'border-red-600' : 'border-gray-800'}`}>
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-white text-base">{pool.pool_name}</CardTitle>
                        <Badge variant="outline" className={
                          pool.status === 'paid' ? 'border-green-600 text-green-400' :
                          pool.status === 'invoiced' ? 'border-yellow-600 text-yellow-400' :
                          pool.status === 'overdrawn' ? 'border-red-600 text-red-400' :
                          pool.status === 'closed' ? 'border-gray-500 text-gray-400' :
                          'border-gray-600 text-gray-400'
                        }>
                          {pool.status}
                        </Badge>
                      </div>
                      <PoolActionsMenu 
                        pool={pool} 
                        disabled={!actionsEnabled}
                        onRefresh={() => invalidateSupply()}
                      />
                    </div>
                  </CardHeader>
                    <CardContent className="p-4 pt-0 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Invoiced</span>
                        <span className="text-white">${(pool.invoiced_amount || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Paid</span>
                        <span className="text-green-400">${(pool.paid_amount || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Allocated</span>
                        <span className="text-blue-400">${(pool.allocated_total || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Charges</span>
                        <span className="text-orange-400">${(pool.charges_total || 0).toFixed(2)}</span>
                      </div>
                      <div className="border-t border-gray-700 pt-2 flex justify-between">
                        <span className="text-gray-400 font-medium">Balance</span>
                        <span className={`font-bold ${(pool.balance || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ${(pool.balance || 0).toFixed(2)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {pools.length === 0 && (
                  <Card className="bg-black/40 border-gray-800 border-dashed col-span-full">
                    <CardContent className="p-8 text-center">
                      <Wallet className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                      <p className="text-gray-400 mb-3">No billing pools created</p>
                      <Button onClick={() => setShowCreatePoolModal(true)} className="bg-green-600 hover:bg-green-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Create Pool
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Exposure Basis Info */}
              <Card className="bg-black/40 border-gray-800">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-white text-base">Exposure Rules</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 text-sm text-gray-400">
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Before Invoice:</strong> Exposure = Planned Retail Total</li>
                    <li><strong>After Invoice:</strong> Exposure = Invoiced Retail Total</li>
                    <li>Pool charges (freight/tariff) reduce available balance and can cause overdraw</li>
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>
            )}

            <TabsContent value="buy" className="mt-4">
              <Card className="bg-black/40 border-gray-800">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white">Ready to Order</CardTitle>
                    <CardDescription>Items gated by coverage and prepay requirements</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={groupBy} onValueChange={setGroupBy}>
                      <SelectTrigger className="w-40 bg-gray-900/50 border-gray-700 text-white h-9">
                        <SelectValue placeholder="Group By" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        <SelectItem value="none">No Grouping</SelectItem>
                        <SelectItem value="category">Category</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <Input
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 bg-gray-900/50 border-gray-700 text-white h-9"
                      />
                    </div>
                    {selectedItems.size > 0 && (
                      <Button 
                        className="bg-green-600 hover:bg-green-700 gap-1"
                        onClick={handleBulkPOPreview}
                        disabled={isBulkPOLoading}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        {isBulkPOLoading ? 'Loading...' : `Create PO (${selectedItems.size})`}
                      </Button>
                    )}
                  </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800 hover:bg-transparent">
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="text-gray-400">Part</TableHead>
                        <TableHead className="text-gray-400 text-center">Needed</TableHead>
                        <TableHead className="text-gray-400 text-center">Reserved</TableHead>
                        <TableHead className="text-gray-400 text-center">To Order</TableHead>
                        <TableHead className="text-gray-400 text-center">Ordered</TableHead>
                        <TableHead className="text-gray-400 text-center">Received</TableHead>
                        <TableHead className="text-gray-400 text-center">Installed</TableHead>
                        <TableHead className="text-gray-400">Coverage</TableHead>
                        <TableHead className="text-gray-400">Next Step</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getFilteredCommitments('buy').length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center py-8 text-gray-500">
                            No items need ordering
                          </TableCell>
                        </TableRow>
                      ) : (
                        renderGroupedCommitments('buy')
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="receive" className="mt-4">
              <Card className="bg-black/40 border-gray-800">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white">Receiving Queue</CardTitle>
                    <div className="flex items-center gap-2">
                      <Select value={groupBy} onValueChange={setGroupBy}>
                        <SelectTrigger className="w-40 bg-gray-900/50 border-gray-700 text-white h-9">
                          <SelectValue placeholder="Group By" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-gray-700">
                          <SelectItem value="none">No Grouping</SelectItem>
                          <SelectItem value="category">Category</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <Input
                          placeholder="Search..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10 bg-gray-900/50 border-gray-700 text-white h-9"
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800 hover:bg-transparent">
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="text-gray-400">Part</TableHead>
                        <TableHead className="text-gray-400 text-center">Needed</TableHead>
                        <TableHead className="text-gray-400 text-center">Reserved</TableHead>
                        <TableHead className="text-gray-400 text-center">To Order</TableHead>
                        <TableHead className="text-gray-400 text-center">Ordered</TableHead>
                        <TableHead className="text-gray-400 text-center">Received</TableHead>
                        <TableHead className="text-gray-400 text-center">Installed</TableHead>
                        <TableHead className="text-gray-400">Coverage</TableHead>
                        <TableHead className="text-gray-400">Next Step</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getFilteredCommitments('receive').length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center py-8 text-gray-500">
                            No items on order
                          </TableCell>
                        </TableRow>
                      ) : (
                        renderGroupedCommitments('receive')
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="install" className="mt-4">
              <Card className="bg-black/40 border-gray-800">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white">Installation Queue</CardTitle>
                    <div className="flex items-center gap-2">
                      <Select value={groupBy} onValueChange={setGroupBy}>
                        <SelectTrigger className="w-40 bg-gray-900/50 border-gray-700 text-white h-9">
                          <SelectValue placeholder="Group By" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-gray-700">
                          <SelectItem value="none">No Grouping</SelectItem>
                          <SelectItem value="category">Category</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <Input
                          placeholder="Search..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10 bg-gray-900/50 border-gray-700 text-white h-9"
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800 hover:bg-transparent">
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="text-gray-400">Part</TableHead>
                        <TableHead className="text-gray-400 text-center">Needed</TableHead>
                        <TableHead className="text-gray-400 text-center">Reserved</TableHead>
                        <TableHead className="text-gray-400 text-center">To Order</TableHead>
                        <TableHead className="text-gray-400 text-center">Ordered</TableHead>
                        <TableHead className="text-gray-400 text-center">Received</TableHead>
                        <TableHead className="text-gray-400 text-center">Installed</TableHead>
                        <TableHead className="text-gray-400">Coverage</TableHead>
                        <TableHead className="text-gray-400">Next Step</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getFilteredCommitments('install').length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center py-8 text-gray-500">
                            No items ready to install
                          </TableCell>
                        </TableRow>
                      ) : (
                        renderGroupedCommitments('install')
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="report" className="mt-4 space-y-4">
              {/* Report Summary */}
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
                        <p className="text-xl font-bold text-white">${metrics.totalPlanned.toFixed(2)}</p>
                      </div>
                      <div className="bg-gray-800/50 p-3 rounded">
                        <p className="text-xs text-gray-500">Covered</p>
                        <p className="text-xl font-bold text-green-400">${metrics.totalCovered.toFixed(2)}</p>
                      </div>
                      <div className="bg-gray-800/50 p-3 rounded">
                        <p className="text-xs text-gray-500">Exposure Gap</p>
                        <p className={`text-xl font-bold ${metrics.totalExposure > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          ${metrics.totalExposure.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Pool Ledger Summary */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Pool Ledger Summary</h4>
                    <div className="bg-gray-800/50 p-3 rounded">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div>
                          <p className="text-xs text-gray-500">Total Invoiced</p>
                          <p className="text-lg font-bold text-white">
                            ${pools.reduce((sum, p) => sum + (p.invoiced_amount || 0), 0).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Total Paid</p>
                          <p className="text-lg font-bold text-green-400">${metrics.poolPaid.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Allocations</p>
                          <p className="text-lg font-bold text-blue-400">
                            ${pools.reduce((sum, p) => sum + (p.allocated_total || 0), 0).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Charges</p>
                          <p className="text-lg font-bold text-orange-400">
                            ${pools.reduce((sum, p) => sum + (p.charges_total || 0), 0).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Balance</p>
                          <p className={`text-lg font-bold ${metrics.poolBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ${metrics.poolBalance.toFixed(2)}
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

      {/* Modals */}
      {/* LEGACY ONLY: CreatePoolModal for pool-based billing */}
      {showCreatePoolModal && project?.financial_model_version !== 'forward' && (
        <CreatePoolModal
          projectId={projectId}
          onClose={() => setShowCreatePoolModal(false)}
          onSuccess={() => {
            invalidateSupply();
            setShowCreatePoolModal(false);
          }}
        />
      )}

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

      {/* LEGACY ONLY: AllocatePoolModal for pool-based allocation */}
      {allocateModal && project?.financial_model_version !== 'forward' && (
        <AllocatePoolModal
          projectId={projectId}
          commitment={{
            id: allocateModal.id,
            commitment_status: allocateModal.commitment_status,
            required_total: allocateModal.required_total,
            unit_retail_snapshot: allocateModal.unit_retail,
            planned_retail_total: allocateModal.planned_retail_total,
            covered_retail_total: allocateModal.covered_retail_total,
            exposure_gap: allocateModal.exposure_gap,
          }}
          onClose={() => setAllocateModal(null)}
          onSuccess={() => {
            invalidateSupply();
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