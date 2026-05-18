import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShoppingCart, Search, Building2, FolderKanban, AlertTriangle,
  DollarSign, CheckCircle2, RefreshCw, Truck, Package,
  Warehouse
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import OrderPartModal from "@/components/parts/OrderPartModal";
import CreateBatchOrderModal from "@/components/parts/CreateBatchOrderModal";
import DeltaOrderModal from "@/components/parts/DeltaOrderModal";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import { useOpsSupplyView, useSupplyAction, useSupplyActionPreview } from "@/components/supply/useProjectSupplyView";
import { useWiringAudit } from "@/components/dev/wiringAudit";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { validateSupplyModelDrift } from "@/components/supply/ExecutionDataBlock";
import { PSMSummaryStrip } from "@/components/supply/PSMGroupedCards";
import PSMFloatingActionBar from "@/components/supply/PSMFloatingActionBar";
import PartModal from "@/components/parts/PartModal";
import VendorQueueView from "@/components/supply/VendorQueueView";
import ProcurementGroupedView from "@/components/supply/ProcurementGroupedView";
import resolveDefaultVendor from "@/components/supply/resolveDefaultVendor";
import AddStockOrderModal from "@/components/supply/AddStockOrderModal";
import ResolveNeedModal from "@/components/supply/ResolveNeedModal";
import { cn } from "@/lib/utils";


/**
 * GlobalNeedToOrder - Cross-Project Procurement Queue
 * 
 * ALIGNED WITH ProjectSupplyManager (PSM) - Uses identical PSMGroupedView component.
 * 
 * DATA SOURCE: getOpsSupplyView with mode='ORDERING'
 * MUTATIONS: Routes through executeSupplyAction (CREATE_PO)
 * 
 * CANONICAL FIELDS USED (from read model ONLY):
 * - required_total, reserved_from_stock, covered_from_po, qty_installed
 * - to_order (computed gap - NEVER derive locally)
 * - coverage_status (FULL/PARTIAL/NONE)
 * - order_id (for "View PO" navigation)
 * 
 * NO LOCAL DERIVATION of coverage, qty_ordered, or inventory state.
 */
export default function GlobalNeedToOrder() {
  const navigate = useNavigate();
  const audit = useWiringAudit('GlobalNeedToOrder');
  const urlParams = new URLSearchParams(window.location.search);
  const filterProjectId = urlParams.get('project_id');
  const filterVendorId = urlParams.get('vendor_id');

  const filterDemandSource = urlParams.get('demand_source');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState(filterProjectId || 'all');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState(filterVendorId || 'all');
  const [coverageFilter, setCoverageFilter] = useState('all');
  const [prepayFilter, setPrepayFilter] = useState('all');
  const [demandSourceFilter, setDemandSourceFilter] = useState(filterDemandSource || 'all');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [orderModalPart, setOrderModalPart] = useState(null);
  const [showBatchOrderModal, setShowBatchOrderModal] = useState(false);
  const [deltaOrderCommitment, setDeltaOrderCommitment] = useState(null);
  const [editingPartId, setEditingPartId] = useState(null);
  // Grouping mode: vendor_project | project_vendor | vendor_only | vendor_sources
  const [groupingMode, setGroupingMode] = useState(() => {
    return localStorage.getItem('gno_grouping_mode') || 'vendor_project';
  });
  const [selectedVendorContext, setSelectedVendorContext] = useState(null);
  const [vendorSourcesByPart, setVendorSourcesByPart] = useState({});
  const [showStockOrderModal, setShowStockOrderModal] = useState(false);
  const [resolveNeedTarget, setResolveNeedTarget] = useState(null);

  // Persist grouping mode
  const handleGroupingChange = (mode) => {
    setGroupingMode(mode);
    localStorage.setItem('gno_grouping_mode', mode);
  };

  // Use canonical ops supply view
  // CRITICAL: vendor filter is NEVER set by vendor view selection — only by explicit dropdown
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
  const actionPreview = useSupplyActionPreview();

  // CANONICAL: Filter using read model fields only — no local derivation
  const filteredItems = useMemo(() => {
    return needToOrderItems.filter(item => {
      // Skip fully covered items (coverage_status now includes qty_installed)
      if (item.coverage_status === 'FULL' || item.coverage_status === 'OVER') return false;
      if ((item.to_order ?? 0) === 0) return false;
      
      if (coverageFilter !== 'all') {
        const coverageState = item.coverage_status === 'FULL' ? 'covered' :
                              item.coverage_status === 'PARTIAL' ? 'partial' : 'uncovered';
        if (coverageState !== coverageFilter) return false;
      }
      
      if (prepayFilter === 'required' && !item.requires_prepay) return false;
      if (prepayFilter === 'not_required' && item.requires_prepay) return false;

      // Demand source filter
      if (demandSourceFilter !== 'all') {
        const ds = item.demand_source || 'PROJECT';
        if (demandSourceFilter === 'project' && ds !== 'PROJECT') return false;
        if (demandSourceFilter === 'stock' && ds !== 'STOCK_REPLENISHMENT' && ds !== 'STOCK_MANUAL') return false;
        if (demandSourceFilter === 'manual' && ds !== 'STOCK_MANUAL') return false;
      }

      return true;
    });
  }, [needToOrderItems, coverageFilter, prepayFilter, demandSourceFilter]);

  // Stats from canonical resolved fields (PartVendorSource-first)
  const totalQty = filteredItems.reduce((sum, i) => sum + (i.to_order ?? 0), 0);
  const totalExposure = filteredItems.reduce((sum, i) => sum + (i.resolved_exposure ?? 0), 0);
  const totalCost = filteredItems.reduce((sum, i) => sum + (i.resolved_cost_total ?? i.estimated_cost ?? 0), 0);
  const canOrderCount = filteredItems.filter(i => i.is_orderable).length;
  const blockedCount = filteredItems.filter(i => !i.is_orderable).length;
  const projectDemandCount = filteredItems.filter(i => (i.demand_source || 'PROJECT') === 'PROJECT').length;
  const stockDemandCount = filteredItems.filter(i => i.demand_source === 'STOCK_REPLENISHMENT' || i.demand_source === 'STOCK_MANUAL').length;

  // DEV DRIFT GUARD
  useEffect(() => {
    if (import.meta.env.DEV && filteredItems.length > 0) {
      validateSupplyModelDrift(filteredItems, 'GlobalNeedToOrder');
    }
  }, [filteredItems]);

  // Build vendor override map using canonical resolver (source-first, even without explicit context)
  const buildVendorOverrideMap = (items) => {
    const vendor_override_map = {};
    const source_override_map = {};
    for (const item of items) {
      if (!item.commitment_id) continue;
      const resolved = resolveDefaultVendor(item, selectedVendorContext, vendorSourcesByPart);
      if (!resolved?.vendor_id) continue;
      
      // Only set override if resolved vendor differs from item's stale vendor
      const staleVid = item.vendor_id || item.vendor?.id;
      if (resolved.vendor_id !== staleVid || resolved.source_id) {
        vendor_override_map[item.commitment_id] = resolved.vendor_id;
        if (resolved.source_id) {
          source_override_map[item.commitment_id] = {
            vendor_id: resolved.vendor_id,
            source_id: resolved.source_id,
            source_cost: resolved.unit_cost || 0,
            source_url: resolved.order_url || '',
            source_vendor_part_number: resolved.vendor_part_number || '',
          };
        }
      }
    }
    return { vendor_override_map, source_override_map };
  };

  // Batch PO creation handler
  const handleBatchCreatePO = async () => {
    audit.trackClick('batch_create_po', { selected_count: selectedItems.size });
    const selectedData = filteredItems.filter(item => selectedItems.has(item.id));
    if (selectedData.length === 0) {
      toast.error('Select items to create PO');
      return;
    }

    const commitment_ids = selectedData.map(i => i.commitment_id);
    const { vendor_override_map, source_override_map } = buildVendorOverrideMap(selectedData);
    
    try {
      const preview = await actionPreview.preview({
        action_type: 'CREATE_PO',
        commitment_ids,
        payload: {
          allow_multi_vendor: false,
          vendor_override_map,
          source_override_map,
        },
      });

      if (preview.blocked_items?.length > 0) {
        audit.trackError('batch_create_po', new Error('Items blocked'));
        toast.error(`${preview.blocked_items.length} items blocked from ordering`);
        return;
      }

      audit.trackSuccess('batch_create_po');
      setShowBatchOrderModal(true);
    } catch (error) {
      audit.trackError('batch_create_po', error);
      toast.error('Failed to preview: ' + error.message);
    }
  };

  // PSM callback handlers — bridge PSM component API to GNO modals
  const handleCreatePO = (commitment) => {
    // Use canonical resolver for vendor defaults
    const resolved = resolveDefaultVendor(commitment, selectedVendorContext, vendorSourcesByPart);
    setOrderModalPart({
      commitment_id: commitment.commitment_id || commitment.id,
      part_id: commitment.part_id,
      part_name: commitment.part?.part_name || commitment.part_name,
      vendor_id: resolved?.vendor_id || commitment.vendor_id || commitment.vendor?.id,
      vendor_name: resolved?.vendor_name || commitment.vendor?.vendor_name || commitment.vendor_name,
      qty_to_order: commitment.to_order ?? 0,
      estimated_cost: commitment.estimated_cost,
      default_cost: resolved?.unit_cost || commitment.unit_cost,
      default_retail: commitment.unit_retail,
    });
  };

  const handleDeltaOrder = (commitment) => {
    setDeltaOrderCommitment(commitment);
  };

  const handleResolveNeed = (commitment) => {
    setResolveNeedTarget(commitment);
  };

  const handlePartClick = (part, commitment) => {
    if (part?.id || commitment?.part_id) {
      setEditingPartId(part?.id || commitment?.part_id);
    }
  };

  const handleReceive = (commitment) => {
    if (commitment.order_id) {
      navigate(createPageUrl('POReceiving') + `?order_id=${commitment.order_id}`);
    } else {
      navigate(createPageUrl('POReceiving'));
    }
  };

  const getSelectedItemsData = () => {
    return filteredItems.filter(item => selectedItems.has(item.id));
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
              {/* Grouping Mode Selector */}
              <div className="flex items-center bg-gray-800 rounded-lg p-0.5 border border-gray-700">
                <Button
                  variant={groupingMode === 'vendor_project' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleGroupingChange('vendor_project')}
                  className={cn(
                    "gap-1.5 h-7 text-xs",
                    groupingMode === 'vendor_project' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                  )}
                  title="Vendor → Project: Group by vendor, then by project underneath"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  Vendor→Project
                </Button>
                <Button
                  variant={groupingMode === 'project_vendor' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleGroupingChange('project_vendor')}
                  className={cn(
                    "gap-1.5 h-7 text-xs",
                    groupingMode === 'project_vendor' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                  )}
                  title="Project → Vendor: Group by project, then by vendor underneath"
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  Project→Vendor
                </Button>
                <Button
                  variant={groupingMode === 'vendor_only' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleGroupingChange('vendor_only')}
                  className={cn(
                    "gap-1.5 h-7 text-xs",
                    groupingMode === 'vendor_only' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                  )}
                  title="Vendor Only: Flat vendor groups for rapid PO creation"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Vendor Only
                </Button>
                <Button
                  variant={groupingMode === 'vendor_sources' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleGroupingChange('vendor_sources')}
                  className={cn(
                    "gap-1.5 h-7 text-xs",
                    groupingMode === 'vendor_sources' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                  )}
                  title="Vendor Intelligence: Multi-source vendor comparison"
                >
                  <Package className="w-3.5 h-3.5" />
                  Sources
                </Button>
              </div>
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
                onClick={() => setShowStockOrderModal(true)}
                className="border-gray-700 text-white gap-2"
              >
                <Warehouse className="w-4 h-4" />
                Add Stock Order
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(createPageUrl('POReceiving'))}
                className="border-gray-700 text-white gap-2"
              >
                <Truck className="w-4 h-4" />
                Go to Receiving
              </Button>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Items to Order</p>
                <p className="text-2xl font-bold text-white">{filteredItems.length}</p>
                <p className="text-xs text-gray-400">
                  {projectDemandCount > 0 && <span className="text-blue-400">{projectDemandCount} project</span>}
                  {projectDemandCount > 0 && stockDemandCount > 0 && ' · '}
                  {stockDemandCount > 0 && <span className="text-orange-400">{stockDemandCount} stock</span>}
                  {projectDemandCount === 0 && stockDemandCount === 0 && `${totalQty} qty`}
                </p>
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

                <Select value={demandSourceFilter} onValueChange={setDemandSourceFilter}>
                  <SelectTrigger className="w-36 bg-gray-900/50 border-gray-700 text-white">
                    <Package className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Demand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Demand</SelectItem>
                    <SelectItem value="project">🏗️ Projects</SelectItem>
                    <SelectItem value="stock">📦 Stock</SelectItem>
                    <SelectItem value="manual">✋ Manual</SelectItem>
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
              </div>
            </CardContent>
          </Card>

          {/* PSM Summary Strip */}
          <PSMSummaryStrip items={filteredItems} tab="buy" />

          {/* Main Content — Grouped procurement view */}
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
          ) : groupingMode === 'vendor_sources' ? (
            <VendorQueueView
              items={filteredItems}
              onSelectVendor={(vendor, itemIds, sourcesByPartId) => {
                setSelectedItems(new Set(itemIds));
                setSelectedVendorContext({ vendor_id: vendor.id, vendor_name: vendor.vendor_name });
                setVendorSourcesByPart(sourcesByPartId || {});
                handleGroupingChange('vendor_project');
              }}
            />
          ) : (
            <ProcurementGroupedView
              items={filteredItems}
              groupingMode={groupingMode}
              selectedItems={selectedItems}
              setSelectedItems={setSelectedItems}
              onPartClick={handlePartClick}
              onCreatePO={handleCreatePO}
              onReceive={handleReceive}
              onDeltaOrder={handleDeltaOrder}
              onResolveNeed={handleResolveNeed}
              onBatchPO={handleBatchCreatePO}
              actionsEnabled={true}
              vendorSourcesByPart={vendorSourcesByPart}
            />
          )}
        </div>
      </div>

      {/* PSM Floating Action Bar */}
      <PSMFloatingActionBar
        selectedCount={selectedItems.size}
        onClear={() => { setSelectedItems(new Set()); setSelectedVendorContext(null); }}
        onBatchPO={handleBatchCreatePO}
        isLoading={actionPreview.isPending}
        tab="buy"
      />

      {/* Modals */}
      {orderModalPart && (
        <OrderPartModal
          part={orderModalPart}
          onClose={() => setOrderModalPart(null)}
        />
      )}

      {showBatchOrderModal && (
        <CreateBatchOrderModal
          selectedItems={(() => {
            // Merge all vendor sources across commitments + override context
            function mergeSources(commitments, overrideSources) {
              const srcMap = new Map();
              for (const c of commitments) {
                for (const s of (c.vendor_sources || [])) {
                  if (s.vendor_id && !srcMap.has(s.vendor_id)) {
                    srcMap.set(s.vendor_id, s);
                  }
                }
              }
              for (const s of overrideSources) {
                if (s.vendor_id && !srcMap.has(s.vendor_id)) {
                  srcMap.set(s.vendor_id, s);
                }
              }
              return Array.from(srcMap.values());
            }

            // Resolve primary source from merged sources
            function resolvePrimarySource(mergedSources, vendorId) {
              if (!vendorId || vendorId === 'unassigned') return null;
              return mergedSources.find(s => s.vendor_id === vendorId) || null;
            }

            // AGGREGATION: One row per part per RESOLVED vendor (source-first)
            const map = new Map();
            const allItems = getSelectedItemsData();
            
            for (const item of allItems) {
              // Canonical resolution: source-defined vendor takes precedence
              const resolved = resolveDefaultVendor(item, selectedVendorContext, vendorSourcesByPart);
              const vid = resolved?.vendor_id || 'unassigned';
              const vName = resolved?.vendor_name || item.vendor_name || 'Unknown';
              const key = `${item.part_id}::${vid}`;

              if (!map.has(key)) {
                map.set(key, {
                  part_id: item.part_id,
                  part_name: item.part_name,
                  vendor_id: vid,
                  vendor_name: vName,
                  default_retail: item.unit_retail,
                  cost_source_tag: item.cost_source_tag,
                  invalid_cost: item.invalid_cost,
                  order_url: resolved?.order_url || null,
                  default_cost: resolved?.unit_cost || 0,
                  sources: [],
                  qty_to_order: 0,
                  estimated_cost: 0,
                  commitments: [],
                });
              }
              const agg = map.get(key);
              agg.qty_to_order += (item.to_order ?? 0);
              agg.estimated_cost += (item.resolved_cost_total ?? item.estimated_cost ?? 0);
              agg.commitments.push({
                commitment_id: item.commitment_id,
                part_id: item.part_id,
                part_name: item.part_name,
                vendor_id: vid,
                vendor_name: vName,
                project_id: item.project_id,
                project_name: item.project_name,
                qty_to_order: item.to_order,
                default_cost: resolved?.unit_cost || item.resolved_unit_cost || item.unit_cost || 0,
                vendor_sources: item.vendor_sources || [],
              });
            }

            // Post-aggregation: merge sources + ensure resolved fields are set
            for (const agg of map.values()) {
              const overrideSources = vendorSourcesByPart[agg.part_id] || [];
              agg.sources = mergeSources(agg.commitments, overrideSources);

              // Fill in order_url/cost from sources if resolver didn't provide them
              if (!agg.order_url) {
                const primary = resolvePrimarySource(agg.sources, agg.vendor_id);
                agg.order_url = primary?.order_url
                  || agg.sources.find(s => s.order_url)?.order_url
                  || null;
              }
              if (!agg.default_cost || agg.default_cost === 0) {
                const primary = resolvePrimarySource(agg.sources, agg.vendor_id);
                agg.default_cost = primary?.unit_cost || agg.commitments[0]?.default_cost || 0;
              }
            }

            return Array.from(map.values());
          })()}
          selectedVendorContext={selectedVendorContext}
          onClose={() => setShowBatchOrderModal(false)}
          onSuccess={() => {
            setSelectedItems(new Set());
            setSelectedVendorContext(null);
            setVendorSourcesByPart({});
            refetch();
          }}
        />
      )}

      {deltaOrderCommitment && (
        <DeltaOrderModal
          commitment={{
            commitment_id: deltaOrderCommitment.commitment_id || deltaOrderCommitment.id,
            commitment_status: deltaOrderCommitment.commitment_status || deltaOrderCommitment._raw?.commitment_status,
            required_total: deltaOrderCommitment.required_total,
            covered_from_po: deltaOrderCommitment.covered_from_po,
          }}
          part={{ id: deltaOrderCommitment.part_id, part_name: deltaOrderCommitment.part?.part_name || deltaOrderCommitment.part_name }}
          onClose={() => setDeltaOrderCommitment(null)}
        />
      )}

      {editingPartId && (
        <PartModal
          partId={editingPartId}
          onClose={() => setEditingPartId(null)}
        />
      )}

      {resolveNeedTarget && (
        <ResolveNeedModal
          open={true}
          onClose={() => setResolveNeedTarget(null)}
          item={resolveNeedTarget}
          onSuccess={() => {
            setResolveNeedTarget(null);
            refetch();
          }}
        />
      )}

      {showStockOrderModal && (
        <AddStockOrderModal
          open={showStockOrderModal}
          onClose={() => setShowStockOrderModal(false)}
          onSuccess={() => refetch()}
        />
      )}
    </MobileSafeAreaContainer>
  );
}