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
  DollarSign, CheckCircle2, RefreshCw, Truck, Package, List, LayoutGrid
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
import PSMGroupedView, { PSMSummaryStrip } from "@/components/supply/PSMGroupedCards";
import PSMFloatingActionBar from "@/components/supply/PSMFloatingActionBar";
import PartModal from "@/components/parts/PartModal";
import VendorQueueView from "@/components/supply/VendorQueueView";
import AggregatedProcurementView, { resolveActiveVendorSource } from "@/components/supply/AggregatedProcurementView";
// VendorPOBuilder removed — all PO creation unified through CreateBatchOrderModal
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

  const [searchTerm, setSearchTerm] = useState('');
  const [groupMode, setGroupMode] = useState('vendor');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState(filterProjectId || 'all');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState(filterVendorId || 'all');
  const [coverageFilter, setCoverageFilter] = useState('all');
  const [prepayFilter, setPrepayFilter] = useState('all');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [orderModalPart, setOrderModalPart] = useState(null);
  const [showBatchOrderModal, setShowBatchOrderModal] = useState(false);
  const [deltaOrderCommitment, setDeltaOrderCommitment] = useState(null);
  const [editingPartId, setEditingPartId] = useState(null);
  const [viewMode, setViewMode] = useState('procurement'); // 'procurement' | 'parts' | 'vendors'
  const [selectedVendorContext, setSelectedVendorContext] = useState(null); // { vendor_id, vendor_name }
  const [vendorSourcesByPart, setVendorSourcesByPart] = useState({}); // part_id -> PartVendorSource[]

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
      if (item.coverage_status === 'FULL') return false;
      if ((item.to_order ?? 0) === 0) return false;
      
      if (coverageFilter !== 'all') {
        const coverageState = item.coverage_status === 'FULL' ? 'covered' :
                              item.coverage_status === 'PARTIAL' ? 'partial' : 'uncovered';
        if (coverageState !== coverageFilter) return false;
      }
      
      if (prepayFilter === 'required' && !item.requires_prepay) return false;
      if (prepayFilter === 'not_required' && item.requires_prepay) return false;

      return true;
    });
  }, [needToOrderItems, coverageFilter, prepayFilter]);

  // Stats from canonical resolved fields (PartVendorSource-first)
  const totalQty = filteredItems.reduce((sum, i) => sum + (i.to_order ?? 0), 0);
  const totalExposure = filteredItems.reduce((sum, i) => sum + (i.resolved_exposure ?? 0), 0);
  const totalCost = filteredItems.reduce((sum, i) => sum + (i.resolved_cost_total ?? i.estimated_cost ?? 0), 0);
  const canOrderCount = filteredItems.filter(i => i.is_orderable).length;
  const blockedCount = filteredItems.filter(i => !i.is_orderable).length;

  // DEV DRIFT GUARD
  useEffect(() => {
    if (import.meta.env.DEV && filteredItems.length > 0) {
      validateSupplyModelDrift(filteredItems, 'GlobalNeedToOrder');
    }
  }, [filteredItems]);

  // Build vendor override map from selectedVendorContext + sources
  const buildVendorOverrideMap = (items) => {
    if (!selectedVendorContext?.vendor_id) return { vendor_override_map: {}, source_override_map: {} };
    const ctxVid = selectedVendorContext.vendor_id;
    const vendor_override_map = {};
    const source_override_map = {};
    for (const item of items) {
      if (!item.commitment_id) continue;
      const defaultVid = item.vendor_id;
      if (defaultVid === ctxVid) {
        vendor_override_map[item.commitment_id] = ctxVid;
        continue;
      }
      const sources = vendorSourcesByPart[item.part_id] || [];
      const match = sources.find(s => s.vendor_id === ctxVid);
      if (match) {
        vendor_override_map[item.commitment_id] = ctxVid;
        source_override_map[item.commitment_id] = {
          vendor_id: ctxVid,
          source_id: match.id,
          source_cost: match.unit_cost || 0,
          source_url: match.order_url || '',
          source_vendor_part_number: match.vendor_part_number || '',
        };
      }
      // else: no override, default vendor used
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
    setOrderModalPart({
      commitment_id: commitment.commitment_id || commitment.id,
      part_id: commitment.part_id,
      part_name: commitment.part?.part_name || commitment.part_name,
      vendor_id: commitment.vendor_id || commitment.vendor?.id,
      vendor_name: commitment.vendor?.vendor_name || commitment.vendor_name,
      qty_to_order: commitment.to_order ?? 0,
      estimated_cost: commitment.estimated_cost,
      default_cost: commitment.unit_cost,
      default_retail: commitment.unit_retail,
    });
  };

  const handleDeltaOrder = (commitment) => {
    setDeltaOrderCommitment(commitment);
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
              {/* View Mode Toggle */}
              <div className="flex items-center bg-gray-800 rounded-lg p-0.5 border border-gray-700">
                <Button
                  variant={viewMode === 'procurement' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('procurement')}
                  className={cn(
                    "gap-1.5 h-7 text-xs",
                    viewMode === 'procurement' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                  )}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Order
                </Button>
                <Button
                  variant={viewMode === 'parts' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('parts')}
                  className={cn(
                    "gap-1.5 h-7 text-xs",
                    viewMode === 'parts' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                  )}
                >
                  <List className="w-3.5 h-3.5" />
                  Commitments
                </Button>
                <Button
                  variant={viewMode === 'vendors' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('vendors')}
                  className={cn(
                    "gap-1.5 h-7 text-xs",
                    viewMode === 'vendors' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                  )}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  Vendors
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
              </div>
            </CardContent>
          </Card>

          {/* PSM Summary Strip */}
          <PSMSummaryStrip items={filteredItems} tab="buy" />

          {/* Main Content — Procurement, Parts, or Vendors view */}
          {viewMode === 'vendors' ? (
            isLoading ? (
              <Card className="bg-black/40 border-gray-800">
                <CardContent className="p-8 text-center text-gray-500">Loading vendor queue...</CardContent>
              </Card>
            ) : (
              <VendorQueueView
                items={filteredItems}
                onSelectVendor={(vendor, itemIds, sourcesByPartId) => {
                  // Selection ONLY — no filter mutation
                  setSelectedItems(new Set(itemIds));
                  setSelectedVendorContext({ vendor_id: vendor.id, vendor_name: vendor.vendor_name });
                  setVendorSourcesByPart(sourcesByPartId || {});
                  setViewMode('parts');
                }}
              />
            )
          ) : viewMode === 'procurement' ? (
            isLoading ? (
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
              <AggregatedProcurementView
                items={filteredItems}
                selectedItems={selectedItems}
                setSelectedItems={setSelectedItems}
                onPartClick={handlePartClick}
                onCreatePO={handleCreatePO}
                onReceive={handleReceive}
                onDeltaOrder={handleDeltaOrder}
                onBatchPO={handleBatchCreatePO}
                actionsEnabled={true}
                vendorSourcesByPart={vendorSourcesByPart}
              />
            )
          ) : isLoading ? (
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
            <PSMGroupedView
              items={filteredItems}
              groupMode={groupMode}
              onGroupModeChange={setGroupMode}
              selectedItems={selectedItems}
              setSelectedItems={setSelectedItems}
              onPartClick={handlePartClick}
              onCreatePO={handleCreatePO}
              onReceive={handleReceive}
              onDeltaOrder={handleDeltaOrder}
              onBatchPO={handleBatchCreatePO}
              actionsEnabled={true}
              tab="buy"
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
            // AGGREGATION: One row per part per vendor
            const map = new Map();
            for (const item of getSelectedItemsData()) {
              const vid = item.vendor_id || item.vendor?.id || 'unassigned';
              const key = `${item.part_id}::${vid}`;
              if (!map.has(key)) {
                const source = resolveActiveVendorSource(item.part_id, vid === 'unassigned' ? null : vid, item, vendorSourcesByPart);
                map.set(key, {
                  // Aggregated identity
                  part_id: item.part_id,
                  part_name: item.part_name,
                  vendor_id: item.vendor_id,
                  vendor_name: item.vendor_name,
                  // Resolved source fields
                  order_url: source?.order_url ?? item.order_url,
                  default_cost: source?.unit_cost ?? item.resolved_unit_cost ?? item.unit_cost,
                  default_retail: item.unit_retail,
                  cost_source_tag: item.cost_source_tag,
                  invalid_cost: item.invalid_cost,
                  sources: item.vendor_sources || vendorSourcesByPart[item.part_id] || [],
                  // Aggregation accumulators
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
                vendor_id: item.vendor_id,
                vendor_name: item.vendor_name,
                project_id: item.project_id,
                project_name: item.project_name,
                qty_to_order: item.to_order,
                default_cost: item.resolved_unit_cost ?? item.unit_cost,
                sources: item.vendor_sources || vendorSourcesByPart[item.part_id] || [],
              });
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
    </MobileSafeAreaContainer>
  );
}