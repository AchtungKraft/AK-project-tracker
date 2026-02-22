import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShoppingCart, Wallet, Search, RefreshCw, ArrowLeft, 
  ChevronDown, ChevronRight, Layers
} from "lucide-react";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import MobileCommitmentCard from "@/components/supply/MobileCommitmentCard";
import PricingIntegrityBadge from "@/components/supply/PricingIntegrityBadge";
import { getDisplayStatus, filterActiveCommitments } from "@/components/supply/lifecycleDisplay";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { validateInventoryConsistency } from "@/components/supply/inventoryResolver";
import EditPartDrawer from "@/components/parts/EditPartDrawer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * SupplyQueueSimplified - AK Industrial Mode
 * 
 * TWO SECTIONS ONLY:
 * Section A: Needs to Order (commitment_status = Planned)
 * Section B: Awaiting Payment (commitment_status = Ordered AND payment_status = Unpaid)
 * 
 * Max 2-level grouping: Project > Vendor OR Project > Category
 * No triple nesting. No pricing integrity filtering here.
 */
export default function SupplyQueueSimplified() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  
  const [activeSection, setActiveSection] = useState('needs_to_order');
  const [searchTerm, setSearchTerm] = useState('');
  const [groupBy, setGroupBy] = useState('project'); // project | vendor | category
  const [showClosedCancelled, setShowClosedCancelled] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});

  // Fetch commitments
  const { data: commitments = [], isLoading: loadingCommitments, refetch: refetchCommitments } = useQuery({
    queryKey: ['commitments-queue'],
    queryFn: () => base44.entities.PartCommitment.list(),
    staleTime: 60000,
  });

  // Fetch supporting data
  const { data: parts = [] } = useQuery({
    queryKey: ['parts-queue'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-queue'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-queue'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories-queue'],
    queryFn: () => base44.entities.PartCategory.list(),
  });

  // Build lookup maps
  const partsMap = useMemo(() => new Map(parts.map(p => [p.id, p])), [parts]);
  const projectsMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const vendorsMap = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);
  const categoriesMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  // ============================================================================
  // PHASE 2B: CANONICAL PART-LEVEL INVENTORY MAP
  // Computes GLOBAL reserved/on_order across ALL active commitments for each part
  // UI must display BOTH global reserved AND this-project reserved
  // 
  // "physical_stock_global" = Part.physical_stock
  // "reserved_global_active" = SUM(reserved_from_stock) across ALL active commitments
  // "available_global_active" = physical_stock_global - reserved_global_active
  // ============================================================================
  const partInventoryMap = useMemo(() => {
    const map = new Map();
    
    // Initialize from parts
    for (const part of parts) {
      map.set(part.id, {
        physical_stock_global: part.physical_stock ?? 0,
        reserved_global_active: 0,
        on_order_global: 0,
        available_global_active: part.physical_stock ?? 0,
        // Deprecated aliases for backward compatibility
        physical_stock: part.physical_stock ?? 0,
        reserved_global: 0,
        available: part.physical_stock ?? 0,
      });
    }
    
    // Aggregate from ALL active commitments
    for (const c of commitments) {
      if (c.commitment_status === 'cancelled' || c.commitment_status === 'closed') {
        continue;
      }
      const inv = map.get(c.part_id);
      if (!inv) continue;
      
      const reservedQty = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      inv.reserved_global_active += reservedQty;
      inv.reserved_global += reservedQty; // Deprecated alias
      inv.on_order_global += c.covered_from_po ?? c.qty_ordered ?? 0;
    }
    
    // Calculate available after aggregation
    for (const [partId, inv] of map.entries()) {
      inv.available_global_active = Math.max(0, inv.physical_stock_global - inv.reserved_global_active);
      inv.available = inv.available_global_active; // Deprecated alias
    }
    
    return map;
  }, [parts, commitments]);

  // Filter and section commitments
  const { needsToOrder, awaitingPayment, counts } = useMemo(() => {
    let filtered = filterActiveCommitments(commitments, showClosedCancelled);
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c => {
        const part = partsMap.get(c.part_id);
        const project = projectsMap.get(c.project_id);
        return (
          part?.part_name?.toLowerCase().includes(term) ||
          project?.name?.toLowerCase().includes(term) ||
          c.id?.toLowerCase().includes(term)
        );
      });
    }

    // Section A: Needs to Order
    const needsToOrder = filtered.filter(c => 
      c.commitment_status?.toLowerCase() === 'planned'
    );

    // Section B: Awaiting Payment
    const awaitingPayment = filtered.filter(c => 
      c.commitment_status?.toLowerCase() === 'ordered' &&
      (c.payment_status?.toLowerCase() === 'unpaid' || !c.payment_status)
    );

    return {
      needsToOrder,
      awaitingPayment,
      counts: {
        needs_to_order: needsToOrder.length,
        awaiting_payment: awaitingPayment.length
      }
    };
  }, [commitments, showClosedCancelled, searchTerm, partsMap, projectsMap]);

  // Get current section items
  const currentItems = activeSection === 'needs_to_order' ? needsToOrder : awaitingPayment;

  // Group items (max 2 levels)
  const groupedItems = useMemo(() => {
    const groups = new Map();

    currentItems.forEach(commitment => {
      const part = partsMap.get(commitment.part_id);
      const project = projectsMap.get(commitment.project_id);
      const vendor = vendorsMap.get(part?.default_vendor_id);
      const category = categoriesMap.get(part?.part_category_id);

      let groupKey, groupLabel;
      
      switch (groupBy) {
        case 'vendor':
          groupKey = vendor?.id || 'no_vendor';
          groupLabel = vendor?.vendor_name || 'No Vendor';
          break;
        case 'category':
          groupKey = category?.id || 'no_category';
          groupLabel = category?.name || 'Uncategorized';
          break;
        case 'project':
        default:
          groupKey = project?.id || 'no_project';
          groupLabel = project?.name || 'No Project';
          break;
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, { 
          key: groupKey, 
          label: groupLabel, 
          items: [],
          totalCost: 0,
          totalRetail: 0
        });
      }
      
      const group = groups.get(groupKey);
      group.items.push({ commitment, part, project, vendor, category });
      group.totalCost += (commitment.unit_cost_snapshot || part?.cost || 0) * (commitment.required_total || 1);
      group.totalRetail += (commitment.unit_retail_snapshot || 0) * (commitment.required_total || 1);
    });

    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [currentItems, groupBy, partsMap, projectsMap, vendorsMap, categoriesMap]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetchCommitments();
      toast.success('Queue refreshed');
    } catch (error) {
      toast.error('Refresh failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePartClick = (part) => {
    if (part?.id) {
      setSelectedPartId(part.id);
    }
  };

  return (
    <MobileSafeAreaContainer>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
        <div className="max-w-6xl mx-auto space-y-4">
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
                <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                  <Layers className="w-6 h-6 text-gray-400" />
                  SUPPLY QUEUE
                </h1>
                <p className="text-sm text-gray-500 font-mono">
                  {counts.needs_to_order} to order • {counts.awaiting_payment} awaiting payment
                </p>
              </div>
            </div>
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              className="border-gray-700 text-gray-300 gap-2"
              disabled={isRefreshing || loadingCommitments}
            >
              <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {/* Section Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveSection('needs_to_order')}
              className={cn(
                "flex-1 md:flex-none px-4 py-3 rounded-lg border transition-all",
                "flex items-center justify-center gap-2",
                activeSection === 'needs_to_order'
                  ? "bg-gray-800 border-gray-600 text-white"
                  : "bg-gray-900/50 border-gray-800 text-gray-400 hover:border-gray-700"
              )}
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="font-medium">Needs to Order</span>
              <span className="font-mono text-sm bg-gray-700/50 px-2 py-0.5 rounded">
                {counts.needs_to_order}
              </span>
            </button>
            <button
              onClick={() => setActiveSection('awaiting_payment')}
              className={cn(
                "flex-1 md:flex-none px-4 py-3 rounded-lg border transition-all",
                "flex items-center justify-center gap-2",
                activeSection === 'awaiting_payment'
                  ? "bg-gray-800 border-gray-600 text-white"
                  : "bg-gray-900/50 border-gray-800 text-gray-400 hover:border-gray-700"
              )}
            >
              <Wallet className="w-4 h-4" />
              <span className="font-medium">Awaiting Payment</span>
              <span className="font-mono text-sm bg-gray-700/50 px-2 py-0.5 rounded">
                {counts.awaiting_payment}
              </span>
            </button>
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search parts or projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-gray-900/50 border-gray-700 text-gray-200"
              />
            </div>
            
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger className="w-[140px] bg-gray-900/50 border-gray-700 text-gray-200">
                <SelectValue placeholder="Group by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">By Project</SelectItem>
                <SelectItem value="vendor">By Vendor</SelectItem>
                <SelectItem value="category">By Category</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch
                id="show-closed"
                checked={showClosedCancelled}
                onCheckedChange={setShowClosedCancelled}
              />
              <Label htmlFor="show-closed" className="text-xs text-gray-500">
                Show Closed/Cancelled
              </Label>
            </div>
          </div>

          {/* Content */}
          {loadingCommitments ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          ) : groupedItems.length === 0 ? (
            <Card className="bg-gray-900/50 border-gray-800">
              <CardContent className="py-12 text-center">
                <p className="text-gray-500 font-mono uppercase">
                  {activeSection === 'needs_to_order' 
                    ? 'No parts need ordering'
                    : 'No orders awaiting payment'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {groupedItems.map(group => {
                const isExpanded = expandedGroups[group.key] !== false; // Default expanded
                
                return (
                  <Card key={group.key} className="bg-gray-900/60 border-gray-800">
                    {/* Group Header */}
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                        <span className="font-medium text-white">{group.label}</span>
                        <span className="text-xs text-gray-500 font-mono">
                          {group.items.length} items
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500 font-mono">
                        <span>C: {formatCurrencyUSD(group.totalCost)}</span>
                        <span>R: {formatCurrencyUSD(group.totalRetail)}</span>
                      </div>
                    </button>

                    {/* Group Items */}
                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-2">
                        {isMobile ? (
                          // Mobile: Expandable Cards
                          group.items.map(({ commitment, part, vendor }) => (
                            <MobileCommitmentCard
                              key={commitment.id}
                              commitment={commitment}
                              part={part}
                              vendor={vendor}
                              onPartClick={handlePartClick}
                            />
                          ))
                        ) : (
                          // Desktop: Compact Table with MANDATORY columns
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
                                <th className="text-left py-2 px-2">Part</th>
                                <th className="text-center py-2 px-2">Stock</th>
                                <th className="text-center py-2 px-2">Rsv</th>
                                <th className="text-center py-2 px-2">Need</th>
                                <th className="text-right py-2 px-2">Cost</th>
                                <th className="text-right py-2 px-2">Retail</th>
                                <th className="text-left py-2 px-2">Status</th>
                                <th className="text-left py-2 px-2">Vendor</th>
                                <th className="text-left py-2 px-2">Payment</th>
                                <th className="text-left py-2 px-2"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.items.map(({ commitment, part, vendor }) => {
                                // ============================================================================
                                // PHASE 2B: CANONICAL INVENTORY VALUES - GLOBAL + PROJECT RESERVED
                                // Use partInventoryMap for GLOBAL reserved (not just this project)
                                // 
                                // DISPLAY CONTRACT (AK Industrial Mode):
                                //   "In Stock" column: physical_stock_global
                                //   "Reserved" column: "GlobalReserved | ThisProject" (e.g. "4 | 2")
                                //   "Needed" column: required_total - qty_installed
                                // ============================================================================
                                const partInv = partInventoryMap.get(part?.id) || { 
                                  physical_stock_global: 0, 
                                  reserved_global_active: 0, 
                                  available_global_active: 0 
                                };
                                const inStock = partInv.physical_stock_global ?? partInv.physical_stock ?? 0;
                                const reservedGlobal = partInv.reserved_global_active ?? partInv.reserved_global ?? 0;
                                const reservedThisProject = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;
                                const needed = Math.max(0, (commitment.required_total ?? 0) - (commitment.qty_installed ?? 0));
                                
                                // PHASE 7: DEV GUARD - Validate inventory consistency
                                if (process.env.NODE_ENV === 'development') {
                                  const displayed = { in_stock: inStock, reserved: reservedGlobal, available: partInv.available_global_active ?? 0 };
                                  const canonical = { physical_stock: inStock, reserved_global: reservedGlobal, available_global: partInv.available_global_active ?? 0 };
                                  validateInventoryConsistency('SupplyQueueSimplified', part?.id, displayed, canonical);
                                }
                                
                                return (
                                  <tr 
                                    key={commitment.id}
                                    className="border-b border-gray-800/50 hover:bg-gray-800/20"
                                  >
                                    <td className="py-2 px-2">
                                      <button
                                        onClick={() => handlePartClick(part)}
                                        className="text-left text-gray-200 hover:text-white truncate max-w-[200px] block"
                                      >
                                        {part?.part_name || 'Unknown'}
                                      </button>
                                    </td>
                                    <td className="py-2 px-2 text-center font-mono text-gray-300">
                                      {inStock}
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <div className="flex items-center justify-center gap-1 font-mono">
                                        <span className={cn("text-sm", reservedGlobal > 0 ? "text-cyan-400" : "text-gray-500")}>
                                          {reservedGlobal}
                                        </span>
                                        <span className="text-gray-600">|</span>
                                        <span className={cn("text-sm", reservedThisProject > 0 ? "text-cyan-300" : "text-gray-600")}>
                                          {reservedThisProject}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-2 text-center font-mono text-white">
                                      {needed}
                                    </td>
                                    <td className="py-2 px-2 text-right font-mono text-gray-300">
                                      {formatCurrencyUSD(commitment.unit_cost_snapshot || part?.cost || 0)}
                                    </td>
                                    <td className="py-2 px-2 text-right font-mono text-gray-300">
                                      {formatCurrencyUSD(commitment.unit_retail_snapshot || 0)}
                                    </td>
                                    <td className="py-2 px-2">
                                      <span className="text-[10px] font-mono uppercase text-gray-400 border-l-2 border-l-gray-600 pl-2">
                                        {getDisplayStatus(commitment.commitment_status)}
                                      </span>
                                    </td>
                                    <td className="py-2 px-2 text-gray-400 truncate max-w-[100px]">
                                      {vendor?.vendor_name || '—'}
                                    </td>
                                    <td className="py-2 px-2">
                                      <span className={cn(
                                        "text-[10px] font-mono uppercase",
                                        commitment.billing_status === 'invoiced' || commitment.billing_status === 'paid' ? 'text-gray-500' : 'text-amber-500'
                                      )}>
                                        {commitment.billing_status || 'billable'}
                                      </span>
                                    </td>
                                    <td className="py-2 px-2">
                                      <PricingIntegrityBadge commitment={commitment} />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Part Drawer */}
      {selectedPartId && (
        <EditPartDrawer
          partId={selectedPartId}
          open={!!selectedPartId}
          onClose={() => setSelectedPartId(null)}
          onSaved={() => {
            setSelectedPartId(null);
            refetchCommitments();
          }}
        />
      )}
    </MobileSafeAreaContainer>
  );
}