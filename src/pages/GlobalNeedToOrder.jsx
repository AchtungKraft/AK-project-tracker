import React, { useState, useMemo } from "react";
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
  Plus, RefreshCw, ArrowRight, Truck
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { getAllowedCommitmentActions } from "@/components/lifecycle/getAllowedCommitmentActions";
import { CoverageBadge } from "@/components/parts/FinancialColumns";
import OrderPartModal from "@/components/parts/OrderPartModal";
import CreateBatchOrderModal from "@/components/parts/CreateBatchOrderModal";
import DeltaOrderModal from "@/components/parts/DeltaOrderModal";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import { useOpsSupplyView, useSupplyAction, useSupplyActionPreview } from "@/components/supply/useProjectSupplyView";
import InventoryChip from "@/components/supply/InventoryChip";
import SourceTypeBadge from "@/components/supply/SourceTypeBadge";
import NextActionBadge from "@/components/supply/NextActionBadge";

/**
 * GlobalNeedToOrder - Cross-Project Procurement Queue
 * 
 * DATA SOURCE: getGlobalOrderQueue backend function
 * MUTATIONS: Routes through executeSupplyAction (CREATE_PO)
 * 
 * Displays canonical to_order (gap) values from resolver - NO local derivation
 */
export default function GlobalNeedToOrder() {
  const navigate = useNavigate();
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

  // Apply local filters (search already applied in API, but coverage/prepay are local)
  const filteredItems = useMemo(() => {
    if (!needToOrderItems) return [];
    return needToOrderItems.filter(item => {
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

      if (groupMode === 'vendor') {
        groupKey = item.vendor_id || 'unassigned';
        groupLabel = item.vendor_name || 'No Vendor Assigned';
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
      // Use canonical to_order from read model - NO local derivation
      groups[groupKey].totalQty += item.to_order ?? 0;
      groups[groupKey].totalExposure += item.exposure_gap ?? 0;
      groups[groupKey].totalCost += item.estimated_cost ?? 0;
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

  // Stats from filtered items - using canonical fields from read model
  const totalQty = filteredItems.reduce((sum, i) => sum + (i.to_order ?? 0), 0);
  const totalExposure = filteredItems.reduce((sum, i) => sum + (i.exposure_gap ?? 0), 0);
  const totalCost = filteredItems.reduce((sum, i) => sum + (i.estimated_cost ?? 0), 0);
  const canOrderCount = filteredItems.filter(i => i.is_orderable).length;
  const blockedCount = filteredItems.filter(i => !i.is_orderable).length;

  // Batch PO creation handler using dispatcher
  const handleBatchCreatePO = async () => {
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
        toast.error(`${preview.blocked_items.length} items blocked from ordering`);
        return;
      }

      // Show batch order modal with preview data
      setShowBatchOrderModal(true);
    } catch (error) {
      toast.error('Failed to preview: ' + error.message);
    }
  };

  // Go to receiving after PO creation
  const handleGoToReceiving = () => {
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

  const toggleItemSelection = (itemId) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
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

  const renderItem = (item) => {
    // Use canonical fields from read model - NO local derivation
    const isOrderable = item.is_orderable;

    return (
      <div 
        key={item.commitment_id}
        className={`p-3 flex items-center gap-3 hover:bg-gray-800/30 transition-colors border-b border-gray-800/50 last:border-b-0 ${
          !isOrderable ? 'opacity-60' : ''
        }`}
      >
        <Checkbox
          checked={selectedItems.has(item.commitment_id)}
          onCheckedChange={() => toggleItemSelection(item.commitment_id)}
          disabled={!isOrderable}
        />

        {item.featured_photo && (
          <div className="w-10 h-10 bg-gray-800 rounded flex-shrink-0 overflow-hidden">
            <img src={item.featured_photo} alt="" className="w-full h-full object-contain" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{item.part_name}</p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {item.vendor_part_number && <span className="font-mono">{item.vendor_part_number}</span>}
            {groupMode !== 'project' && item.project_name && <span>· {item.project_name}</span>}
            {groupMode !== 'vendor' && item.vendor_name && <span>· {item.vendor_name}</span>}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-center w-16">
            <p className="text-xs text-gray-500">Order</p>
            {/* Display canonical to_order (gap) from resolver */}
            <p className="text-white font-bold">×{item.to_order ?? item.qtyToOrder ?? 0}</p>
          </div>

          {/* Canonical quantity display */}
          <div className="text-center w-20">
            <p className="text-xs text-gray-500">Exposure</p>
            <p className={(item.exposure_gap ?? 0) > 0 ? 'text-red-400 font-medium' : 'text-green-400'}>
              ${(item.exposure_gap ?? 0).toFixed(0)}
            </p>
          </div>

          <div className="text-center w-20">
            <p className="text-xs text-gray-500">Pool</p>
            <p className={(item.pool_balance ?? 0) >= (item.exposure_gap ?? 0) ? 'text-green-400' : 'text-yellow-400'}>
              ${(item.pool_balance ?? 0).toFixed(0)}
            </p>
          </div>

          {/* Next action badge from resolver */}
          <NextActionBadge 
            nextAction={item.next_action} 
            blockReason={item.block_reason_code}
            compact
          />

          {item.requires_prepay && (
            <Badge variant="outline" className={item.prepay_ok ? 'border-green-600 text-green-400' : 'border-red-600 text-red-400'}>
              {item.prepay_ok ? '✓ Prepaid' : '⚠ Prepay Req'}
            </Badge>
          )}

          {isOrderable ? (
            <Badge className="bg-green-600 text-white">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Ready
            </Badge>
          ) : (
            <Badge variant="outline" className="border-red-600 text-red-400">
              <XCircle className="w-3 h-3 mr-1" />
              {item.block_reason_code === 'INSUFFICIENT_FUNDS' ? 'Need Funds' : 'Blocked'}
            </Badge>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
              {isOrderable && (
                <DropdownMenuItem onClick={() => setOrderModalPart({ id: item.part_id, part_name: item.part_name })} className="text-green-400">
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
              <DropdownMenuItem className="text-blue-400">
                <DollarSign className="w-4 h-4 mr-2" />
                Allocate Pool
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                <p className="text-2xl font-bold text-yellow-400">${totalCost.toFixed(0)}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Total Exposure</p>
                <p className="text-2xl font-bold text-red-400">${totalExposure.toFixed(0)}</p>
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
                const allOrderable = group.items.filter(i => i.canOrder);
                const allSelected = allOrderable.length > 0 && allOrderable.every(i => selectedItems.has(i.id));

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
                            <p className="text-red-400 font-medium">${group.totalExposure.toFixed(0)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Est. Cost</p>
                            <p className="text-yellow-400 font-medium">${group.totalCost.toFixed(0)}</p>
                          </div>
                          {group.canOrderCount > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-green-600 text-green-400 hover:bg-green-900/30"
                              onClick={(e) => {
                                e.stopPropagation();
                                const ids = group.items.filter(i => i.canOrder).map(i => i.id);
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
            id: item.id,
            part: { id: item.part_id, part_name: item.part_name },
            requirement: { project_id: item.project_id },
            qty_to_order: item.qtyToOrder,
            estimated_cost: item.estimatedCost,
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
            id: deltaOrderCommitment.commitment_id,
            commitment_status: deltaOrderCommitment.commitment_status,
            qty_committed: deltaOrderCommitment.qty_committed,
            qty_ordered: deltaOrderCommitment.qty_ordered,
          }}
          part={{ id: deltaOrderCommitment.part_id, part_name: deltaOrderCommitment.part_name }}
          onClose={() => setDeltaOrderCommitment(null)}
        />
      )}
    </MobileSafeAreaContainer>
  );
}