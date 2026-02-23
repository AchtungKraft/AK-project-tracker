import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  ShoppingCart, Search, Building2, FolderKanban, AlertTriangle,
  DollarSign, CheckCircle2, XCircle, ChevronDown, ChevronUp, MoreVertical,
  Plus, RefreshCw, ArrowRight, Truck, Package
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CoverageBadgeInline } from "@/components/parts/CoverageBadge";
import OrderPartModal from "@/components/parts/OrderPartModal";
import CreateBatchOrderModal from "@/components/parts/CreateBatchOrderModal";
import DeltaOrderModal from "@/components/parts/DeltaOrderModal";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import { useOpsSupplyView, useSupplyAction, useSupplyActionPreview } from "@/components/supply/useProjectSupplyView";
import NextActionBadge from "@/components/supply/NextActionBadge";
import { PrepayStatusBadge } from "@/components/supply/InventoryStateBadge";
import PricingIntegrityBadge from "@/components/supply/PricingIntegrityBadge";
import { useWiringAudit } from "@/components/dev/wiringAudit";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { resolveVendorDisplay, resolveCategoryDisplay } from "@/components/supply/supplyResolvers";
import { cn } from "@/lib/utils";

/**
 * GlobalNeedToOrder - Cross-Project Procurement Queue
 * 
 * ALIGNED WITH ProjectSupplyManager (PSM) - Same canonical data contract
 * 
 * DATA SOURCE: getOpsSupplyView with mode='ORDERING'
 * MUTATIONS: Routes through executeSupplyAction (CREATE_PO)
 * 
 * CANONICAL FIELDS USED (from read model ONLY):
 * - required_total, reserved_from_stock, covered_from_po, qty_installed
 * - to_order (computed gap - NEVER derive locally)
 * - coverage_status (FULL/PARTIAL/NONE)
 * - inventory_snapshot.physical_stock_global, .reserved_global_active, .reserved_this_project
 * - billing_status, unit_cost, unit_retail, exposure_gap
 * - next_action, block_reason_code
 * - pricing_integrity_status
 * 
 * NO LEGACY FIELDS:
 * - NO item.qty_committed
 * - NO item.qty_ordered
 * - NO item.qty_to_order
 * - NO local derivation like: qtyToOrder = qty_committed - qty_ordered
 * 
 * COLUMN ORDER (matches PSM):
 * Checkbox | Part | Category | In Stock | Reserved (G|P) | Needed | To Order | Cost | Retail | Vendor | Payment | Coverage | Pricing | Next Action
 * 
 * CURRENCY FORMAT: formatCurrencyUSD (USA format with thousands separator)
 * NAME RESOLUTION: resolveVendorDisplay / resolveCategoryDisplay (never display IDs)
 */
export default function GlobalNeedToOrder() {
  const navigate = useNavigate();
  const audit = useWiringAudit('GlobalNeedToOrder');
  const urlParams = new URLSearchParams(window.location.search);
  const filterProjectId = urlParams.get('project_id');
  const filterVendorId = urlParams.get('vendor_id');

  const [searchTerm, setSearchTerm] = useState('');
  const [groupMode, setGroupMode] = useState('vendor');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState(filterProjectId || 'all');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState(filterVendorId || 'all');
  const [coverageFilter, setCoverageFilter] = useState('all');
  const [prepayFilter, setPrepayFilter] = useState('all');
  const [expandedGroups, setExpandedGroups] = useState(new Set(['all']));
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [orderModalPart, setOrderModalPart] = useState(null);
  const [showBatchOrderModal, setShowBatchOrderModal] = useState(false);
  const [deltaOrderCommitment, setDeltaOrderCommitment] = useState(null);

  // Use canonical ops supply view - replaces getGlobalOrderQueue
  const { 
    items: needToOrderItems, 
    summary, 
    filterOptions, 
    isLoading, 
    refetch 
  } = useOpsSupplyView('ORDERING', {
    vendor_id: selectedVendorFilter !== 'all' ? selectedVendorFilter : undefined,
    project_id: selectedProjectFilter !== 'all' ? selectedProjectFilter : undefined,
    search: searchTerm || undefined,
  });

  // Supply action dispatcher
  const supplyAction = useSupplyAction();
  const actionPreview = useSupplyActionPreview();

  // PHASE 6: GNO is a FILTERED view of supply data
  // MUST exclude: coverage_status === 'FULL' OR to_order === 0
  // Uses canonical inventory_snapshot fields from read model
  const filteredItems = useMemo(() => {
    return needToOrderItems.filter(item => {
      // PHASE 6 CORE RULE: Exclude fully covered items
      if (item.coverage_status === 'FULL') return false;
      
      // PHASE 6 CORE RULE: Exclude items with nothing to order
      if ((item.to_order ?? 0) === 0) return false;
      
      // Coverage filter using canonical coverage_status
      if (coverageFilter !== 'all') {
        const coverageState = item.coverage_status === 'FULL' ? 'covered' :
                              item.coverage_status === 'PARTIAL' ? 'partial' : 'uncovered';
        if (coverageState !== coverageFilter) return false;
      }
      
      // Prepay filter
      if (prepayFilter === 'required' && !item.requires_prepay) return false;
      if (prepayFilter === 'not_required' && item.requires_prepay) return false;

      return true;
    });
  }, [needToOrderItems, coverageFilter, prepayFilter]);

  // Group items - using canonical fields from read model
  const groupedItems = useMemo(() => {
    const groups = {};

    filteredItems.forEach(item => {
      let groupKey, groupLabel, groupColor;

      // CANONICAL: Resolve vendor/category names via resolvers - never display IDs
      const vendorDisplay = resolveVendorDisplay(item.vendor_id, item.vendor_name);
      const categoryDisplay = resolveCategoryDisplay(item.category_id, item.category_name);

      if (groupMode === 'vendor') {
        groupKey = item.vendor_id || 'unassigned';
        groupLabel = vendorDisplay.name;
        groupColor = '#3B82F6';
      } else if (groupMode === 'project') {
        groupKey = item.project_id || 'general';
        groupLabel = item.project_name || 'General / AK Stock';
        groupColor = '#EF4444';
      } else {
        // Use canonical coverage_status
        const coverageState = item.coverage_status === 'FULL' ? 'covered' :
                              item.coverage_status === 'PARTIAL' ? 'partial' : 'uncovered';
        groupKey = coverageState;
        groupLabel = coverageState === 'covered' ? '✓ Fully Covered' :
                     coverageState === 'partial' ? '◐ Partially Covered' : '○ Uncovered';
        groupColor = coverageState === 'covered' ? '#10B981' :
                     coverageState === 'partial' ? '#F59E0B' : '#EF4444';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          id: groupKey,
          label: groupLabel,
          color: groupColor,
          items: [],
          totalQty: 0,
          totalExposure: 0,
          totalCost: 0,
          canOrderCount: 0,
        };
      }

      groups[groupKey].items.push(item);
      // CANONICAL: Use to_order from read model - NO local derivation
      // Group totals use canonical fields only
      groups[groupKey].totalQty += item.to_order ?? 0;
      groups[groupKey].totalExposure += item.exposure_gap ?? 0;
      // Use planned_cost_total if available, otherwise estimated_cost
      groups[groupKey].totalCost += item.planned_cost_total ?? item.estimated_cost ?? 0;
      if (item.is_orderable) groups[groupKey].canOrderCount++;
    });

    return Object.values(groups).sort((a, b) => {
      if (groupMode === 'coverage') {
        const order = { covered: 0, partial: 1, uncovered: 2 };
        return (order[a.id] || 3) - (order[b.id] || 3);
      }
      return a.label.localeCompare(b.label);
    });
  }, [filteredItems, groupMode]);

  // Stats from filtered items - using canonical fields from read model ONLY
  // Group totals use sum(to_order), sum(exposure_gap), sum(planned_cost_total)
  const totalQty = filteredItems.reduce((sum, i) => sum + (i.to_order ?? 0), 0);
  const totalExposure = filteredItems.reduce((sum, i) => sum + (i.exposure_gap ?? 0), 0);
  const totalCost = filteredItems.reduce((sum, i) => sum + (i.planned_cost_total ?? i.estimated_cost ?? 0), 0);
  const canOrderCount = filteredItems.filter(i => i.is_orderable).length;
  const blockedCount = filteredItems.filter(i => !i.is_orderable).length;

  // DEV GUARD: Validate canonical inventory consistency
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && filteredItems.length > 0) {
      filteredItems.forEach(item => {
        const snap = item.inventory_snapshot;
        if (snap) {
          // Reserved global should >= reserved this project
          if ((snap.reserved_global_active ?? 0) < (snap.reserved_this_project ?? 0)) {
            console.error('[CANONICAL VIOLATION] reserved_global_active < reserved_this_project', item.commitment_id);
          }
        }
        // to_order must be >= 0
        if ((item.to_order ?? 0) < 0) {
          console.error('[CANONICAL VIOLATION] to_order < 0', item.commitment_id, item.to_order);
        }
        // coverage_status should align with to_order
        if (item.coverage_status === 'FULL' && (item.to_order ?? 0) > 0) {
          console.error('[CANONICAL VIOLATION] FULL coverage but to_order > 0', item.commitment_id);
        }
      });
    }
  }, [filteredItems]);

  // Batch PO creation handler using dispatcher
  const handleBatchCreatePO = async () => {
    audit.trackClick('batch_create_po', { selected_count: selectedItems.size });
    const selectedData = getSelectedItemsData();
    if (selectedData.length === 0) {
      toast.error('Select items to create PO');
      return;
    }

    const commitment_ids = selectedData.map(i => i.commitment_id);
    
    try {
      // Preview first
      const preview = await actionPreview.preview({
        action_type: 'CREATE_PO',
        commitment_ids,
        payload: { allow_multi_vendor: false },
      });

      if (preview.blocked_items?.length > 0) {
        audit.trackError('batch_create_po', new Error('Items blocked'));
        toast.error(`${preview.blocked_items.length} items blocked from ordering`);
        return;
      }

      audit.trackSuccess('batch_create_po');
      // Show batch order modal with preview data
      setShowBatchOrderModal(true);
    } catch (error) {
      audit.trackError('batch_create_po', error);
      toast.error('Failed to preview: ' + error.message);
    }
  };

  // Go to receiving after PO creation
  const handleGoToReceiving = () => {
    audit.trackClick('navigate_to_receiving');
    navigate(createPageUrl('POReceiving'));
  };

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // CANONICAL: Selection uses commitment_id exclusively
  const toggleItemSelection = (commitmentId) => {
    if (!commitmentId) {
      console.error('[CANONICAL VIOLATION] toggleItemSelection called with undefined commitmentId');
      return;
    }
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(commitmentId)) next.delete(commitmentId);
      else next.add(commitmentId);
      return next;
    });
  };

  const selectAllInGroup = (groupItems) => {
    const orderableIds = groupItems.filter(i => i.is_orderable).map(i => i.commitment_id);
    const allSelected = orderableIds.every(id => selectedItems.has(id));
    
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (allSelected) {
        orderableIds.forEach(id => next.delete(id));
      } else {
        orderableIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const getSelectedItemsData = () => {
    return filteredItems.filter(item => selectedItems.has(item.commitment_id));
  };

  // PHASE 4: Import shared ExecutionDataBlock - NO local definition
  // Uses ExecutionDataBlock from @/components/supply/ExecutionDataBlock

  const renderItem = (item) => {
    // PHASE 9K: Use ONLY backend is_orderable - NO local gating logic
    const isOrderable = item.is_orderable === true;
    
    // CANONICAL: Inventory stats from read model only
    const snap = item.inventory_snapshot || {};
    const inStock = snap.physical_stock_global ?? 0;
    const reservedGlobal = snap.reserved_global_active ?? 0;
    const reservedProject = snap.reserved_this_project ?? 0;
    const needed = (item.required_total ?? 0) - (item.qty_installed ?? 0);
    const toOrder = item.to_order ?? 0;

    // Resolve vendor/category names - NEVER display IDs
    const vendorDisplay = resolveVendorDisplay(item.vendor_id, item.vendor_name);
    const categoryDisplay = resolveCategoryDisplay(item.category_id, item.category_name);

    return (
      <div 
        key={item.commitment_id}
        className={cn(
          "p-3 hover:bg-gray-800/30 transition-colors border-b border-gray-800/50 last:border-b-0",
          !isOrderable && "opacity-60"
        )}
      >
        {/* Main Row */}
        <div className="flex items-center gap-3">
          {/* Checkbox */}
          <Checkbox
            checked={selectedItems.has(item.commitment_id)}
            onCheckedChange={() => toggleItemSelection(item.commitment_id)}
            disabled={!isOrderable}
          />

          {/* Part Info */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {item.featured_photo && (
              <div className="w-10 h-10 bg-gray-800 rounded flex-shrink-0 overflow-hidden">
                <img src={item.featured_photo} alt="" className="w-full h-full object-contain" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{item.part_name}</p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {item.vendor_part_number && <span className="font-mono">{item.vendor_part_number}</span>}
                {groupMode !== 'project' && item.project_name && <span>· {item.project_name}</span>}
                <span>· {vendorDisplay.name}</span>
              </div>
            </div>
          </div>

          {/* Coverage Badge (canonical: coverage_status) */}
          <div className="w-24 hidden md:block">
            <CoverageBadgeInline coverage={{
              coverage_status: item.coverage_status,
              gap_qty: toOrder,
              qty_needed: needed,
              qty_reserved: reservedProject,
              qty_ordered: item.covered_from_po ?? 0,
              qty_installed: item.qty_installed ?? 0,
            }} />
          </div>

          {/* Payment/Prepay Status */}
          <div className="w-20 hidden lg:block">
            <PrepayStatusBadge 
              requiresPrepay={item.requires_prepay}
              billingStatus={item.billing_status}
            />
          </div>

          {/* Pricing Integrity */}
          <div className="w-24 hidden xl:block">
            <PricingIntegrityBadge status={item.pricing_integrity_status} />
          </div>

          {/* Next Action */}
          <NextActionBadge 
            nextAction={item.next_action} 
            blockReason={item.block_reason_code}
            compact
          />

          {/* Actions Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
              {isOrderable && (
                <DropdownMenuItem onClick={() => setOrderModalPart({
                  commitment_id: item.commitment_id,
                  part_id: item.part_id,
                  part_name: item.part_name,
                  vendor_id: item.vendor_id,
                  vendor_name: vendorDisplay.name,
                  qty_to_order: toOrder,
                  estimated_cost: item.estimated_cost,
                  default_cost: item.unit_cost,
                  default_retail: item.unit_retail
                })} className="text-green-400">
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Create PO
                </DropdownMenuItem>
              )}
              {item.covered_from_po > 0 && (
                <DropdownMenuItem onClick={() => setDeltaOrderCommitment(item)} className="text-purple-400">
                  <Plus className="w-4 h-4 mr-2" />
                  Additional Order
                </DropdownMenuItem>
              )}
              <DropdownMenuItem 
                onClick={() => navigate(createPageUrl(`ProjectDetail?id=${item.project_id}&tab=parts`))}
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Go to Project
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-gray-700" />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* PHASE 6: Execution Data Block - same as PSM */}
        <div className="mt-2 ml-6 max-w-xs">
          <GNOExecutionDataBlock item={item} />
        </div>
      </div>
    );
  };

  return (
    <MobileSafeAreaContainer>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
                GLOBAL PROCUREMENT QUEUE
              </h1>
              <p className="text-sm text-gray-400">Cross-project ordering with financial visibility</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => refetch()}
                variant="outline"
                size="sm"
                className="border-gray-700 text-white gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={handleGoToReceiving}
                className="border-gray-700 text-white gap-2"
              >
                <Truck className="w-4 h-4" />
                Go to Receiving
              </Button>
              {selectedItems.size > 0 && (
                <Button
                  onClick={handleBatchCreatePO}
                  disabled={actionPreview.isPending}
                  className="bg-green-600 hover:bg-green-700 gap-2"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Create Batch PO ({selectedItems.size})
                </Button>
              )}
            </div>
          </div>

          {/* Summary Stats - using formatCurrencyUSD for canonical formatting */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Items to Order</p>
                <p className="text-2xl font-bold text-white">{filteredItems.length}</p>
                <p className="text-xs text-gray-400">{totalQty} qty total</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Est. Cost</p>
                <p className="text-2xl font-bold text-yellow-400">{formatCurrencyUSD(totalCost)}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Total Exposure</p>
                <p className="text-2xl font-bold text-red-400">{formatCurrencyUSD(totalExposure)}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Ready to Order</p>
                <p className="text-2xl font-bold text-green-400">{canOrderCount}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Blocked</p>
                <p className="text-2xl font-bold text-red-400">{blockedCount}</p>
                <p className="text-xs text-gray-400">need coverage/prepay</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="bg-black/40 border-gray-800">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search parts, projects, vendors..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 text-white"
                  />
                </div>

                <Select value={selectedProjectFilter} onValueChange={setSelectedProjectFilter}>
                  <SelectTrigger className="w-40 bg-gray-900/50 border-gray-700 text-white">
                    <FolderKanban className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {filterOptions.projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedVendorFilter} onValueChange={setSelectedVendorFilter}>
                  <SelectTrigger className="w-40 bg-gray-900/50 border-gray-700 text-white">
                    <Building2 className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="All Vendors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Vendors</SelectItem>
                    {filterOptions.vendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={coverageFilter} onValueChange={setCoverageFilter}>
                  <SelectTrigger className="w-36 bg-gray-900/50 border-gray-700 text-white">
                    <DollarSign className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Coverage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Coverage</SelectItem>
                    <SelectItem value="covered">✓ Covered</SelectItem>
                    <SelectItem value="partial">◐ Partial</SelectItem>
                    <SelectItem value="uncovered">○ Uncovered</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={prepayFilter} onValueChange={setPrepayFilter}>
                  <SelectTrigger className="w-36 bg-gray-900/50 border-gray-700 text-white">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Prepay" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Items</SelectItem>
                    <SelectItem value="required">Prepay Required</SelectItem>
                    <SelectItem value="not_required">No Prepay</SelectItem>
                  </SelectContent>
                </Select>

                <Tabs value={groupMode} onValueChange={setGroupMode}>
                  <TabsList className="bg-gray-900/50 border border-gray-700">
                    <TabsTrigger value="vendor" className="data-[state=active]:bg-blue-900/30 gap-1.5">
                      <Building2 className="w-3.5 h-3.5" />
                      Vendor
                    </TabsTrigger>
                    <TabsTrigger value="project" className="data-[state=active]:bg-red-900/30 gap-1.5">
                      <FolderKanban className="w-3.5 h-3.5" />
                      Project
                    </TabsTrigger>
                    <TabsTrigger value="coverage" className="data-[state=active]:bg-green-900/30 gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" />
                      Coverage
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardContent>
          </Card>

          {/* Grouped Items List */}
          {isLoading ? (
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-8 text-center text-gray-500">Loading procurement queue...</CardContent>
            </Card>
          ) : filteredItems.length === 0 ? (
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400" />
                <p className="text-gray-400">No items need ordering</p>
                <p className="text-xs text-gray-500 mt-1">All commitments are ordered or filters exclude results</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {groupedItems.map(group => {
                const isExpanded = expandedGroups.has(group.id) || expandedGroups.has('all');
                // CANONICAL: Use is_orderable and commitment_id
                const allOrderable = group.items.filter(i => i.is_orderable);
                const allSelected = allOrderable.length > 0 && allOrderable.every(i => selectedItems.has(i.commitment_id));

                return (
                  <Card key={group.id} className="bg-black/40 border-gray-800 overflow-hidden">
                    <CardHeader 
                      className="p-3 cursor-pointer hover:bg-gray-800/30 transition-colors"
                      onClick={() => toggleGroup(group.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => selectAllInGroup(group.items)}
                            onClick={(e) => e.stopPropagation()}
                            disabled={allOrderable.length === 0}
                          />
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: group.color }}
                          />
                          <div>
                            <p className="text-white font-medium">{group.label}</p>
                            <p className="text-xs text-gray-500">
                              {group.items.length} items · {group.totalQty} qty · 
                              <span className="text-green-400 ml-1">{group.canOrderCount} ready</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Exposure</p>
                            <p className="text-red-400 font-medium">{formatCurrencyUSD(group.totalExposure)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Est. Cost</p>
                            <p className="text-yellow-400 font-medium">{formatCurrencyUSD(group.totalCost)}</p>
                          </div>
                          {group.canOrderCount > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-green-600 text-green-400 hover:bg-green-900/30"
                              onClick={(e) => {
                                e.stopPropagation();
                                // CANONICAL: Use is_orderable and commitment_id
                                const ids = group.items.filter(i => i.is_orderable).map(i => i.commitment_id);
                                setSelectedItems(new Set(ids));
                                setShowBatchOrderModal(true);
                              }}
                            >
                              <ShoppingCart className="w-3 h-3 mr-1" />
                              Order All
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    {isExpanded && (
                      <CardContent className="p-0 border-t border-gray-800">
                        {group.items.map(item => renderItem(item))}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {orderModalPart && (
        <OrderPartModal
          part={orderModalPart}
          onClose={() => setOrderModalPart(null)}
        />
      )}

      {showBatchOrderModal && (
        <CreateBatchOrderModal
          selectedItems={getSelectedItemsData().map(item => ({
            commitment_id: item.commitment_id,
            part_id: item.part_id,
            part_name: item.part_name,
            vendor_id: item.vendor_id,
            vendor_name: item.vendor_name,
            project_id: item.project_id,
            project_name: item.project_name,
            qty_to_order: item.to_order,
            estimated_cost: item.estimated_cost,
            default_cost: item.unit_cost,
            default_retail: item.unit_retail,
          }))}
          onClose={() => setShowBatchOrderModal(false)}
          onSuccess={() => {
            setSelectedItems(new Set());
            refetch();
          }}
        />
      )}

      {deltaOrderCommitment && (
        <DeltaOrderModal
          commitment={{
            commitment_id: deltaOrderCommitment.commitment_id,
            commitment_status: deltaOrderCommitment.commitment_status,
            required_total: deltaOrderCommitment.required_total,
            covered_from_po: deltaOrderCommitment.covered_from_po,
          }}
          part={{ id: deltaOrderCommitment.part_id, part_name: deltaOrderCommitment.part_name }}
          onClose={() => setDeltaOrderCommitment(null)}
        />
      )}
    </MobileSafeAreaContainer>
  );
}