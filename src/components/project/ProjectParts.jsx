import React, { useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Search, Plus, Package, Trash2, FileText, DollarSign, ChevronDown, ChevronUp,
  CheckCircle2, ShoppingCart, Truck, Wrench, AlertTriangle, MoreHorizontal, Download, ExternalLink,
  RefreshCw, Loader2, RotateCcw
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import AddRequirementModal from "./AddRequirementModal";
import AllocatePartModal from "./AllocatePartModal";
import InstallPartModal from "./InstallPartModal";
import OrderPartModal from "../parts/OrderPartModal";
import EditPartDrawer from "../parts/EditPartDrawer";
import ImageModal from "../ui/ImageModal";
import MoveRequirementModal from "../parts/MoveRequirementModal";
import CommitmentLockIndicator from "../parts/CommitmentLockIndicator";
import ReverseInstallationModal from "./ReverseInstallationModal";
import { useCommitmentData, isRequirementManagedByCommitments, getCommitmentsForRequirement } from "../inventory/useCommitmentData";
import { isRequirementLocked } from "../inventory/commitmentStateEngine";
import CancelCommitmentModal from "../parts/CancelCommitmentModal";
import CommitmentEditModal from "../parts/CommitmentEditModal";
import { getPricingIntegrity, getPricingRowHighlight, PRICING_STATUS } from "../inventory/pricingIntegrityUtils";
import { PricingIntegrityCell, PricingWarningIcon } from "../inventory/PricingStatusBadge";
import FinancialStatusBadge from "../financial/FinancialStatusBadge";
import FinancialDetailDrawer from "../financial/FinancialDetailDrawer";
import ProjectFinancialWarningBanner from "../financial/ProjectFinancialWarningBanner";
import ProjectFinancialSummaryWidget from "../financial/ProjectFinancialSummaryWidget";
import { useFinancialStatusBatch, buildFinancialContexts, mergeFinancialStatus } from "../financial/useFinancialStatus";
import CoverageBadge, { CoverageSummary } from "../financial/CoverageBadge";
import PoolPanel from "../financial/PoolPanel";

/**
 * Derives status badge from quantities (canonical logic)
 */
const deriveStatus = (req, onOrder) => {
  const { qty_needed = 0, qty_allocated = 0, qty_installed = 0 } = req;
  // toOrder = qty_needed - qty_installed - qty_allocated - qty_ordered
  const toOrder = Math.max(0, qty_needed - qty_installed - qty_allocated - (req.qty_ordered || 0));
  
  if (qty_installed >= qty_needed && qty_needed > 0) {
    return { key: 'Installed', color: '#059669', icon: CheckCircle2, label: 'Installed' };
  }
  if (qty_installed > 0 && qty_installed < qty_needed) {
    return { key: 'Partially Installed', color: '#F59E0B', icon: Wrench, label: 'Partial Install' };
  }
  if (onOrder > 0 && qty_allocated > qty_installed) {
    return { key: 'Allocated + On Order', color: '#8B5CF6', icon: Truck, label: 'Alloc + Order' };
  }
  if (onOrder > 0) {
    return { key: 'On Order', color: '#8B5CF6', icon: Truck, label: 'On Order' };
  }
  if (qty_allocated >= qty_needed && qty_needed > 0) {
    return { key: 'Allocated', color: '#3B82F6', icon: Package, label: 'Allocated' };
  }
  if (qty_allocated > 0) {
    return { key: 'Partially Allocated', color: '#F59E0B', icon: Package, label: 'Partial Alloc' };
  }
  if (toOrder > 0) {
    return { key: 'Need To Order', color: '#EF4444', icon: ShoppingCart, label: 'Need To Order' };
  }
  return { key: 'Needed', color: '#EF4444', icon: AlertTriangle, label: 'Needed' };
};

export default function ProjectParts({ projectId }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('none'); // 'none', 'category', 'status', 'vendor', 'pricing', 'commitment'
  const [groupMode, setGroupMode] = useState('status'); // legacy tabs: 'status', 'order', 'part'
  const [expandedGroups, setExpandedGroups] = useState(new Set(['all']));
  const [showAddModal, setShowAddModal] = useState(false);
  const [allocatingRequirement, setAllocatingRequirement] = useState(null);
  const [installingRequirement, setInstallingRequirement] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [orderPart, setOrderPart] = useState(null);
  const [moveRequirement, setMoveRequirement] = useState(null);
  const [cancellingCommitment, setCancellingCommitment] = useState(null);
  const [editingCommitment, setEditingCommitment] = useState(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [financialDrawerOpen, setFinancialDrawerOpen] = useState(false);
  const [financialDrawerContext, setFinancialDrawerContext] = useState(null);
  const [financialQuickFilter, setFinancialQuickFilter] = useState(null);
  const [reversingInstall, setReversingInstall] = useState(null);

  const { data: requirements = [], isLoading } = useQuery({
    queryKey: ['partProjectRequirements', projectId],
    queryFn: () => base44.entities.PartProjectRequirement.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
  });

  const { data: installedParts = [] } = useQuery({
    queryKey: ['installedParts', projectId],
    queryFn: () => base44.entities.InstalledPart.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list(),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list('-order_date'),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: buildAssignments = [] } = useQuery({
    queryKey: ['partBuildAssignments', projectId],
    queryFn: () => base44.entities.PartBuildAssignment.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: matrixTiers = [] } = useQuery({
    queryKey: ['retailMarkupMatrix'],
    queryFn: () => base44.entities.RetailMarkupMatrix.list(),
  });

  const { data: commitments = [] } = useQuery({
    queryKey: ['partCommitments', projectId],
    queryFn: () => base44.entities.PartCommitment.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: billingPools = [] } = useQuery({
    queryKey: ['billingPools', projectId],
    queryFn: () => base44.entities.BillingPool.filter({ project_id: projectId }),
    enabled: !!projectId,
  });
  
  const project = projects.find(p => p.id === projectId);
  const primaryPool = billingPools.find(p => p.status !== 'closed') || billingPools[0];

  // Batch resolve financial status for all requirements
  const financialContexts = useMemo(() => {
    return requirements.map(req => ({
      part_id: req.part_id,
      project_id: projectId,
      commitment_id: commitments.find(c => c.requirement_id === req.id && c.commitment_status !== 'cancelled')?.id,
    }));
  }, [requirements, projectId, commitments]);
  
  const { data: financialStatuses = [] } = useFinancialStatusBatch(financialContexts, {
    enabled: requirements.length > 0,
  });
  
  // Build financial status lookup map
  const financialStatusMap = useMemo(() => {
    const map = new Map();
    financialStatuses.forEach(fs => {
      map.set(fs.part_id, fs);
    });
    return map;
  }, [financialStatuses]);

  // Handle financial badge click - open drawer
  const handleFinancialBadgeClick = ({ financialStatus, partId, projectId }) => {
    setFinancialDrawerContext({ financialStatus, partId, projectId });
    setFinancialDrawerOpen(true);
  };

  // Handle warning banner filter click
  const handleFinancialFilterClick = (filterKey) => {
    setFinancialQuickFilter(filterKey);
    // Clear status filter to show financial filtered results
    setStatusFilter('all');
  };

  // Handle summary widget metric click
  const handleMetricClick = (filterKey) => {
    setFinancialQuickFilter(filterKey);
    setStatusFilter('all');
  };

  // Clear financial quick filter
  const clearFinancialQuickFilter = () => {
    setFinancialQuickFilter(null);
  };

  // Dual-read hook for commitment-aware metrics
  const commitmentMetrics = useCommitmentData({
    commitments,
    requirements,
    lineItems,
    projectId,
  });

  // Calculate on-order quantity for each part (from open PO line items)
  const partOnOrder = useMemo(() => {
    const map = {};
    lineItems.forEach(li => {
      const pending = Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0));
      if (pending > 0) {
        if (!map[li.part_id]) map[li.part_id] = 0;
        map[li.part_id] += pending;
      }
    });
    return map;
  }, [lineItems]);

  // Build order info for this project's parts
  const projectOrders = useMemo(() => {
    const projectPartIds = new Set(requirements.map(r => r.part_id));
    const projectReqIds = new Set(requirements.map(r => r.id));
    
    // Find line items for this project's parts/requirements
    const relevantLineItems = lineItems.filter(li => 
      projectPartIds.has(li.part_id) || projectReqIds.has(li.requirement_id)
    );
    
    // Group by order
    const orderMap = {};
    relevantLineItems.forEach(li => {
      const order = orders.find(o => o.id === li.order_id);
      if (!order) return;
      
      if (!orderMap[order.id]) {
        const vendor = vendors.find(v => v.id === order.vendor_id);
        orderMap[order.id] = {
          order,
          vendor,
          lineItems: [],
          totalQty: 0,
          totalValue: 0,
        };
      }
      orderMap[order.id].lineItems.push(li);
      orderMap[order.id].totalQty += li.qty_ordered || 0;
      orderMap[order.id].totalValue += li.line_total || 0;
    });
    
    return Object.values(orderMap).sort((a, b) => 
      (b.order?.order_date || '').localeCompare(a.order?.order_date || '')
    );
  }, [requirements, lineItems, orders, vendors]);

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const deleteMutation = useMutation({
    mutationFn: async (requirement) => {
      const allocatedQty = (requirement.qty_allocated || 0) - (requirement.qty_installed || 0);
      
      if (allocatedQty > 0) {
        const partInventory = inventoryItems.filter(i => i.part_id === requirement.part_id);
        let remainingToRelease = allocatedQty;
        
        for (const item of partInventory) {
          if (remainingToRelease <= 0) break;
          const reservedHere = Math.min(item.quantity_reserved || 0, remainingToRelease);
          if (reservedHere > 0) {
            await base44.entities.InventoryItem.update(item.id, {
              quantity_reserved: Math.max(0, (item.quantity_reserved || 0) - reservedHere)
            });
            remainingToRelease -= reservedHere;
          }
        }
      }
      
      await base44.entities.PartProjectRequirement.delete(requirement.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements', projectId] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      toast.success('Requirement removed');
    },
  });

  const getPartInfo = (partId) => parts.find(p => p.id === partId) || {};

  const getInventoryAvailable = (partId) => {
    const items = inventoryItems.filter(i => i.part_id === partId);
    return items.reduce((sum, i) => sum + ((i.quantity_on_hand || 0) - (i.quantity_reserved || 0)), 0);
  };

  // Calculate project totals using canonical definitions
  const totals = useMemo(() => {
    let needed = 0, allocated = 0, installed = 0, toOrder = 0, onOrder = 0;
    
    requirements.forEach(r => {
      needed += r.qty_needed || 0;
      allocated += r.qty_allocated || 0;
      installed += r.qty_installed || 0;
      // toOrder = qty_needed - qty_installed - qty_allocated - qty_ordered
      toOrder += Math.max(0, (r.qty_needed || 0) - (r.qty_installed || 0) - (r.qty_allocated || 0) - (r.qty_ordered || 0));
      onOrder += partOnOrder[r.part_id] || 0; // Sum open PO lines for this part
    });
    
    return { needed, allocated, installed, toOrder, onOrder };
  }, [requirements, partOnOrder]);

  const projectCost = installedParts.reduce((sum, ip) => sum + (ip.extended_cost || 0), 0);

  // Enrich requirements with computed fields + pricing integrity
  const enrichedRequirements = useMemo(() => {
    return requirements.map(req => {
      const onOrder = partOnOrder[req.part_id] || 0;
      const toOrder = Math.max(0, (req.qty_needed || 0) - (req.qty_installed || 0) - (req.qty_allocated || 0) - (req.qty_ordered || 0));
      const available = getInventoryAvailable(req.part_id);
      const status = deriveStatus(req, onOrder);
      
      // Get pricing integrity
      const part = parts.find(p => p.id === req.part_id);
      const commitment = commitments.find(c => c.requirement_id === req.id && c.commitment_status !== 'cancelled');
      const assignment = buildAssignments.find(ba => ba.part_id === req.part_id);
      const lineItem = lineItems.find(li => li.requirement_id === req.id);
      
      const pricingIntegrity = getPricingIntegrity({ commitment, assignment, part, lineItem });
      
      // Get category info for grouping
      const category = categories.find(c => c.id === part?.part_category_id);
      const parentCategory = category?.parent_id ? categories.find(c => c.id === category.parent_id) : null;
      const vendor = vendors.find(v => v.id === part?.default_vendor_id);
      
      return {
        ...req,
        _onOrder: onOrder,
        _toOrder: toOrder,
        _available: available,
        _status: status,
        _pricingIntegrity: pricingIntegrity,
        _category: category,
        _parentCategory: parentCategory,
        _vendor: vendor,
        _commitment: commitment,
        _part: part,
        _financialStatus: financialStatusMap.get(req.part_id) || null,
      };
    });
  }, [requirements, partOnOrder, inventoryItems, parts, commitments, buildAssignments, lineItems, categories, vendors, financialStatusMap]);

  // Group requirements based on groupBy selection
  const groupedRequirements = useMemo(() => {
    if (groupBy === 'none') return null;
    
    const groups = {};
    
    enrichedRequirements.forEach(req => {
      let groupKey = 'Other';
      let sortOrder = 999;
      
      switch (groupBy) {
        case 'category':
          if (req._parentCategory) {
            groupKey = `${req._parentCategory.name} › ${req._category?.name || 'Uncategorized'}`;
            sortOrder = (req._parentCategory.sort_order || 0) * 100 + (req._category?.sort_order || 0);
          } else if (req._category) {
            groupKey = req._category.name;
            sortOrder = req._category.sort_order || 0;
          } else {
            groupKey = 'Uncategorized';
          }
          break;
        case 'status':
          groupKey = req._status.label;
          sortOrder = ['Installed', 'Partial Install', 'Allocated', 'Partial Alloc', 'On Order', 'Alloc + Order', 'Need To Order', 'Needed'].indexOf(req._status.label);
          break;
        case 'vendor':
          groupKey = req._vendor?.vendor_name || 'No Vendor';
          sortOrder = req._vendor?.sort_order || 999;
          break;
        case 'pricing':
          groupKey = req._pricingIntegrity.status === PRICING_STATUS.OK ? 'OK' :
                     req._pricingIntegrity.status === PRICING_STATUS.ESTIMATED_COST ? 'Estimated Cost' :
                     req._pricingIntegrity.status === PRICING_STATUS.MISSING_RETAIL ? 'Missing Retail' :
                     req._pricingIntegrity.status === PRICING_STATUS.MISSING_COST ? 'Missing Cost' :
                     req._pricingIntegrity.status === PRICING_STATUS.MISSING_BOTH ? 'Missing Both' :
                     req._pricingIntegrity.status === PRICING_STATUS.ZERO_VALUE ? '$0 Value' : 'Unknown';
          sortOrder = [PRICING_STATUS.MISSING_BOTH, PRICING_STATUS.MISSING_RETAIL, PRICING_STATUS.ZERO_VALUE, PRICING_STATUS.MISSING_COST, PRICING_STATUS.ESTIMATED_COST, PRICING_STATUS.OK].indexOf(req._pricingIntegrity.status);
          break;
        case 'commitment':
          groupKey = req._commitment ? `${req._commitment.commitment_status}` : 'No Commitment';
          sortOrder = ['installed', 'allocated', 'received', 'partially_received', 'ordered', 'planned', 'cancelled', 'closed'].indexOf(req._commitment?.commitment_status || '') || 99;
          break;
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = { items: [], sortOrder, totalRetail: 0, totalCost: 0 };
      }
      groups[groupKey].items.push(req);
      groups[groupKey].totalRetail += (req._pricingIntegrity.retailValue || 0) * (req.qty_needed || 0);
      groups[groupKey].totalCost += (req._pricingIntegrity.costValue || 0) * (req.qty_needed || 0);
    });
    
    // Sort groups
    return Object.entries(groups)
      .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
      .map(([key, data]) => ({ key, ...data }));
  }, [enrichedRequirements, groupBy]);

  const filteredRequirements = enrichedRequirements.filter(req => {
    const part = getPartInfo(req.part_id);
    const matchesSearch = part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || req._status.key === statusFilter;
    
    // Apply financial quick filter if set
    if (financialQuickFilter && req._financialStatus) {
      const fs = req._financialStatus;
      switch (financialQuickFilter) {
        case 'unbilled':
          if (fs.client_billing_status !== 'NOT_INVOICED') return false;
          break;
        case 'billed':
          if (!['INVOICED', 'PARTIALLY_PAID', 'PAID'].includes(fs.client_billing_status)) return false;
          break;
        case 'vendor_unpaid':
          if (!['UNPAID', 'PARTIAL'].includes(fs.vendor_payment_status)) return false;
          break;
        case 'vendor_paid':
          if (fs.vendor_payment_status !== 'PAID') return false;
          break;
        case 'margin_complete':
          if (fs.margin_state !== 'COMPLETE') return false;
          break;
        case 'margin_incomplete':
          if (fs.margin_state === 'COMPLETE' || fs.margin_state === 'UNKNOWN') return false;
          break;
      }
    }
    
    return matchesSearch && matchesStatus;
  });

  // Bulk recalculate pricing from matrix
  const handleBulkRecalculatePricing = async () => {
    setIsRecalculating(true);
    try {
      const response = await base44.functions.invoke('backfillCommitmentPricing', { 
        project_id: projectId,
        dry_run: false 
      });
      queryClient.invalidateQueries({ queryKey: ['partCommitments', projectId] });
      queryClient.invalidateQueries({ queryKey: ['partBuildAssignments', projectId] });
      toast.success(`Pricing recalculated for ${response.data?.updated || 0} items`);
    } catch (error) {
      toast.error('Failed to recalculate pricing: ' + error.message);
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleRemove = (requirement) => {
    // Check if managed by commitments
    const reqCommitments = getCommitmentsForRequirement(commitments, requirement.id);
    const activeCommitments = reqCommitments.filter(c => c.commitment_status !== 'cancelled');
    
    if (activeCommitments.length > 0) {
      // Has commitments - open cancel modal for first active commitment
      const commitmentToCancel = activeCommitments[0];
      if ((commitmentToCancel.qty_installed || 0) > 0) {
        toast.error('Cannot remove: parts have been installed. Use commitment editor to reduce quantity.');
        setEditingCommitment(commitmentToCancel);
        return;
      }
      setCancellingCommitment(commitmentToCancel);
      return;
    }
    
    // Legacy path - no commitments
    if ((requirement.qty_installed || 0) > 0) {
      toast.error('Cannot remove: parts have been installed');
      return;
    }
    const allocatedUninstalled = (requirement.qty_allocated || 0) - (requirement.qty_installed || 0);
    const message = allocatedUninstalled > 0 
      ? `Remove this requirement? ${allocatedUninstalled} allocated unit(s) will be released back to inventory.`
      : 'Remove this part requirement?';
    
    if (confirm(message)) {
      deleteMutation.mutate(requirement);
    }
  };

  const statusOptions = [
    { key: 'Installed', label: 'Installed' },
    { key: 'Partially Installed', label: 'Partial Install' },
    { key: 'Allocated', label: 'Allocated' },
    { key: 'Partially Allocated', label: 'Partial Alloc' },
    { key: 'On Order', label: 'On Order' },
    { key: 'Allocated + On Order', label: 'Alloc + Order' },
    { key: 'Need To Order', label: 'Need To Order' },
    { key: 'Needed', label: 'Needed' },
  ];

  // Render a single part row (used in both grouped and flat views)
  const renderPartRow = (req) => {
    const part = getPartInfo(req.part_id);
    const status = req._status;
    const StatusIcon = status.icon;
    const isManagedByCommitments = isRequirementManagedByCommitments(commitments, req.id);
    const reqCommitments = getCommitmentsForRequirement(commitments, req.id);
    const canAllocate = !isManagedByCommitments && req._available > 0 && (req.qty_allocated || 0) < (req.qty_needed || 0);
    const canInstall = (req.qty_allocated || 0) > (req.qty_installed || 0);
    const hasInstalledParts = (req.qty_installed || 0) > 0;
    const rowHighlight = getPricingRowHighlight(req._pricingIntegrity?.status);

    return (
      <TableRow key={req.id} className={`border-b border-red-900/10 hover:bg-red-950/20 ${rowHighlight}`}>
        <TableCell>
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedPart(part.id)}>
            {part.featured_photo && (
              <div 
                className="w-10 h-10 bg-gray-800 rounded flex items-center justify-center overflow-hidden"
                onClick={(e) => { e.stopPropagation(); setSelectedImage(part.featured_photo); }}
              >
                <img src={part.featured_photo} alt="" className="w-full h-full object-contain" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="text-white text-sm font-medium hover:text-red-400 transition-colors">{part.part_name}</p>
                <CommitmentLockIndicator 
                  isLocked={isManagedByCommitments} 
                  commitmentCount={reqCommitments.length}
                  size="sm"
                  showLabel={false}
                />
                <PricingWarningIcon status={req._pricingIntegrity?.status} />
              </div>
              {part.vendor_part_number && (
                <p className="text-xs text-gray-500 font-mono">{part.vendor_part_number}</p>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge style={{ backgroundColor: status.color }} className="text-white text-xs gap-1">
            <StatusIcon className="w-3 h-3" />
            {status.label}
          </Badge>
        </TableCell>
        <TableCell className="text-center text-white font-medium">{req.qty_needed || 0}</TableCell>
        <TableCell className="text-center text-blue-400">{req.qty_allocated || 0}</TableCell>
        <TableCell className="text-center text-green-400">{req.qty_installed || 0}</TableCell>
        <TableCell className="text-center">
          <span className={req._onOrder > 0 ? 'text-orange-400' : 'text-gray-500'}>{req._onOrder}</span>
        </TableCell>
        <TableCell className="text-center">
          <span className={req._available > 0 ? 'text-green-400' : 'text-gray-500'}>{req._available}</span>
        </TableCell>
        <TableCell>
          <PricingIntegrityCell integrity={req._pricingIntegrity} compact />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <CoverageBadge 
              commitment={req._commitment}
              poLine={lineItems.find(li => li.commitment_id === req._commitment?.id)}
              compact
            />
            <FinancialStatusBadge 
              financialStatus={req._financialStatus} 
              displayMode="compact"
              onClick={handleFinancialBadgeClick}
              partId={req.part_id}
              projectId={projectId}
            />
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            {canInstall && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 border-green-700 text-green-400 hover:bg-green-900/30"
                onClick={() => setInstallingRequirement(req)}
              >
                <Download className="w-3 h-3 mr-1" />
                Install
              </Button>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
                {isManagedByCommitments && (
                  <DropdownMenuItem disabled className="text-purple-400 text-xs">
                    Managed by {reqCommitments.length} commitment(s)
                  </DropdownMenuItem>
                )}
                {canAllocate && (
                  <DropdownMenuItem onClick={() => setAllocatingRequirement(req)}>
                    <Package className="w-4 h-4 mr-2" /> Allocate from Inventory
                  </DropdownMenuItem>
                )}
                {canInstall && (
                  <DropdownMenuItem onClick={() => setInstallingRequirement(req)}>
                    <Wrench className="w-4 h-4 mr-2" /> Mark as Installed
                  </DropdownMenuItem>
                )}
                {hasInstalledParts && (
                  <>
                    <DropdownMenuSeparator className="bg-gray-700" />
                    <DropdownMenuItem 
                      onClick={() => {
                        const installed = installedParts.filter(ip => 
                          ip.project_id === projectId && 
                          ip.part_id === req.part_id && 
                          !ip.is_reversed
                        );
                        if (installed.length > 0) {
                          setReversingInstall({
                            installedPart: installed[0],
                            part,
                            commitment: req._commitment,
                          });
                        }
                      }}
                      className="text-orange-400"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" /> Reverse Installation
                    </DropdownMenuItem>
                  </>
                )}
                {req._toOrder > 0 && !isManagedByCommitments && (
                  <DropdownMenuItem onClick={() => setOrderPart(part)}>
                    <ShoppingCart className="w-4 h-4 mr-2" /> Order Part ({req._toOrder})
                  </DropdownMenuItem>
                )}
                {req._onOrder > 0 && (
                  <DropdownMenuItem onClick={() => {/* Could link to On Order view */}}>
                    <Truck className="w-4 h-4 mr-2" /> View On Order ({req._onOrder})
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setSelectedPart(part.id)}>
                  <ExternalLink className="w-4 h-4 mr-2" /> View Part Details
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-gray-700" />
                {!hasInstalledParts && !isManagedByCommitments && (
                  <DropdownMenuItem onClick={() => setMoveRequirement(req)}>
                    Move to Project
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={() => handleRemove(req)}
                  className="text-red-400"
                  disabled={hasInstalledParts || isManagedByCommitments}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-4">
      {/* Financial Warning Banner */}
      <ProjectFinancialWarningBanner 
        financialStatuses={financialStatuses}
        onFilterClick={handleFinancialFilterClick}
      />

      {/* Summary Card */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-gray-400" />
              <CardTitle className="text-white text-base">Project Parts</CardTitle>
              <Badge variant="outline" className="border-gray-600 text-gray-400">
                {requirements.length} items
              </Badge>
              {commitmentMetrics.hasCommitments && (
                <Badge variant="outline" className="border-purple-600 text-purple-400 text-xs">
                  Commitment Tracking Active
                </Badge>
              )}
            </div>
            <Button
              onClick={() => setShowAddModal(true)}
              size="sm"
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Part
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {/* Summary Stats - Canonical definitions */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
            <div className="p-2 bg-gray-900/50 rounded-lg border border-gray-800">
              <p className="text-xs text-gray-400">Needed</p>
              <p className="text-lg font-bold text-white">{totals.needed}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-blue-900/30">
              <p className="text-xs text-gray-400">Allocated</p>
              <p className="text-lg font-bold text-blue-400">{totals.allocated}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-green-900/30">
              <p className="text-xs text-gray-400">Installed</p>
              <p className="text-lg font-bold text-green-400">{totals.installed}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-yellow-900/30">
              <p className="text-xs text-gray-400">On Order</p>
              <p className="text-lg font-bold text-orange-400">{totals.onOrder}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-red-900/30">
              <p className="text-xs text-gray-400">To Order</p>
              <p className="text-lg font-bold text-red-400">{totals.toOrder}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-yellow-900/30">
              <p className="text-xs text-gray-400">Parts Cost</p>
              <p className="text-lg font-bold text-yellow-400">${projectCost.toFixed(2)}</p>
            </div>
          </div>

          {/* Pool Panel - Show billing pool status */}
          {primaryPool && (
            <div className="mb-4">
              <PoolPanel pool={primaryPool} compact />
            </div>
          )}

          {/* Coverage Summary */}
          {commitments.length > 0 && (
            <div className="mb-4 p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Commitment Coverage</span>
                <CoverageSummary commitments={commitments} />
              </div>
            </div>
          )}

          {/* Financial Summary Widget (Compact) */}
          {financialStatuses.length > 0 && (
            <ProjectFinancialSummaryWidget
              financialStatuses={financialStatuses}
              onMetricClick={handleMetricClick}
              compact
              className="mb-4"
            />
          )}

          {/* Quick Filter Indicator */}
          {financialQuickFilter && (
            <div className="flex items-center gap-2 mb-4 p-2 bg-blue-900/30 border border-blue-700/50 rounded-lg">
              <span className="text-blue-300 text-sm">
                Filtering by: <span className="font-medium">{financialQuickFilter.replace('_', ' ')}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-blue-400 hover:text-blue-300"
                onClick={clearFinancialQuickFilter}
              >
                Clear
              </Button>
            </div>
          )}

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search parts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-900/50 border-gray-700 text-white"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statusOptions.map(opt => (
                  <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                <SelectValue placeholder="Group By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Grouping</SelectItem>
                <SelectItem value="category">Category</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="vendor">Vendor</SelectItem>
                <SelectItem value="pricing">Pricing Status</SelectItem>
                <SelectItem value="commitment">Commitment Status</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="border-gray-700 text-gray-300">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Bulk Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
                <DropdownMenuItem onClick={handleBulkRecalculatePricing} disabled={isRecalculating}>
                  {isRecalculating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Recalculate Pricing From Matrix
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      {/* Project Orders Summary */}
      {projectOrders.length > 0 && (
        <Card className="bg-black/40 backdrop-blur-xl border border-purple-900/30">
          <CardHeader className="border-b border-purple-900/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" />
                <CardTitle className="text-white text-sm">Project Orders</CardTitle>
                <Badge variant="outline" className="border-purple-600 text-purple-400">
                  {projectOrders.length} PO{projectOrders.length !== 1 ? 's' : ''}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-purple-900/20">
            {projectOrders.map(({ order, vendor, lineItems: orderLines, totalQty, totalValue }) => {
              const isExpanded = expandedGroups.has(`order-${order.id}`);
              
              return (
                <div key={order.id}>
                  <div 
                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-purple-950/20 transition-colors"
                    onClick={() => toggleGroup(`order-${order.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{order.po_number || `Order ${order.id.slice(0, 8)}`}</span>
                          {order.order_number && (
                            <span className="text-xs text-gray-400 font-mono">#{order.order_number}</span>
                          )}
                          <Badge 
                            variant="outline" 
                            className={
                              order.status === 'Received' ? 'border-green-600 text-green-400' :
                              order.status === 'Partial' ? 'border-orange-600 text-orange-400' :
                              'border-yellow-600 text-yellow-400'
                            }
                          >
                            {order.status}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={
                              order.billing_status === 'Client Paid' ? 'border-green-600 text-green-400' : 
                              order.billing_status === 'Client Invoiced' ? 'border-blue-600 text-blue-400' :
                              'border-gray-600 text-gray-400'
                            }
                          >
                            <DollarSign className="w-3 h-3 mr-1" />
                            {order.billing_status || 'Not Invoiced'}
                          </Badge>
                          {order.invoice_number && (
                            <span className="text-xs text-gray-400 ml-1">INV: {order.invoice_number}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{vendor?.vendor_name}</span>
                          {order.order_date && <span>· {order.order_date}</span>}
                          <span>· {totalQty} items</span>
                          {totalValue > 0 && <span>· ${totalValue.toFixed(2)}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.order_url && (
                        <a 
                          href={order.order_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="px-6 pb-3">
                      <div className="bg-gray-900/50 rounded-lg p-2 space-y-1">
                        {orderLines.map(li => {
                          const part = getPartInfo(li.part_id);
                          const pending = (li.qty_ordered || 0) - (li.qty_received || 0);
                          return (
                            <div key={li.id} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                {part.featured_photo && (
                                  <img src={part.featured_photo} alt="" className="w-6 h-6 rounded object-contain bg-gray-800" />
                                )}
                                <span className="text-gray-300">{part.part_name}</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-gray-400">
                                  {li.qty_received || 0}/{li.qty_ordered || 0} received
                                </span>
                                {pending > 0 && (
                                  <Badge variant="outline" className="border-yellow-600 text-yellow-400">
                                    {pending} pending
                                  </Badge>
                                )}
                                {li.line_total > 0 && (
                                  <span className="text-green-400">${li.line_total.toFixed(2)}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Parts List */}
      {isLoading ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-8 text-center text-gray-500">Loading parts...</CardContent>
        </Card>
      ) : filteredRequirements.length === 0 ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-8 text-center">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-500 mb-3">
              {requirements.length === 0 ? 'No parts required yet' : 'No parts match your filters'}
            </p>
            {requirements.length === 0 && (
              <Button onClick={() => setShowAddModal(true)} className="bg-red-600 hover:bg-red-700 gap-2">
                <Plus className="w-4 h-4" /> Add First Part
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-red-900/20 hover:bg-transparent">
                  <TableHead className="text-gray-400 text-xs">Part</TableHead>
                  <TableHead className="text-gray-400 text-xs">Status</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Needed</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Allocated</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Installed</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">On Order</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Available</TableHead>
                  <TableHead className="text-gray-400 text-xs">Pricing</TableHead>
                  <TableHead className="text-gray-400 text-xs">Financial</TableHead>
                  <TableHead className="text-gray-400 text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Grouped View */}
                {groupBy !== 'none' && groupedRequirements?.map(group => {
                  const isExpanded = expandedGroups.has(group.key) || expandedGroups.has('all');
                  const filteredGroupItems = group.items.filter(req => {
                    const part = getPartInfo(req.part_id);
                    const matchesSearch = part.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                         part.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());
                    const matchesStatus = statusFilter === 'all' || req._status.key === statusFilter;
                    return matchesSearch && matchesStatus;
                  });
                  
                  if (filteredGroupItems.length === 0) return null;
                  
                  return (
                    <React.Fragment key={group.key}>
                      {/* Group Header Row */}
                      <TableRow 
                        className="bg-gray-800/50 border-b border-red-900/20 cursor-pointer hover:bg-gray-800/70"
                        onClick={() => toggleGroup(group.key)}
                      >
                        <TableCell colSpan={9} className="py-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                              <span className="font-medium text-white">{group.key}</span>
                              <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
                                {filteredGroupItems.length} parts
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                              <span className="text-gray-400">
                                Retail: <span className="text-green-400">${group.totalRetail.toFixed(2)}</span>
                              </span>
                              <span className="text-gray-400">
                                Cost: <span className="text-yellow-400">${group.totalCost.toFixed(2)}</span>
                              </span>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                      
                      {/* Group Items */}
                      {isExpanded && filteredGroupItems.map(req => renderPartRow(req))}
                    </React.Fragment>
                  );
                })}
                
                {/* Flat View (no grouping) */}
                {groupBy === 'none' &&
                  filteredRequirements.map(req => renderPartRow(req))
                }
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddRequirementModal projectId={projectId} onClose={() => setShowAddModal(false)} />
      )}

      {allocatingRequirement && (
        <AllocatePartModal 
          requirement={allocatingRequirement} 
          onClose={() => setAllocatingRequirement(null)} 
        />
      )}

      {installingRequirement && (
        <InstallPartModal
          requirement={installingRequirement}
          onClose={() => setInstallingRequirement(null)}
        />
      )}

      {selectedPart && (
        <EditPartDrawer partId={selectedPart} onClose={() => setSelectedPart(null)} />
      )}

      {selectedImage && (
        <ImageModal isOpen={!!selectedImage} imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
      )}

      {orderPart && (
        <OrderPartModal 
          part={orderPart}
          onClose={() => setOrderPart(null)}
          onPartClick={(partId) => setSelectedPart(partId)}
        />
      )}

      {moveRequirement && (
        <MoveRequirementModal
          requirement={moveRequirement}
          part={getPartInfo(moveRequirement.part_id)}
          currentProject={project}
          onClose={() => setMoveRequirement(null)}
        />
      )}

      {cancellingCommitment && (
        <CancelCommitmentModal
          commitment={cancellingCommitment}
          part={getPartInfo(cancellingCommitment.part_id)}
          project={project}
          onClose={() => setCancellingCommitment(null)}
        />
      )}

      {editingCommitment && (
        <CommitmentEditModal
          commitment={editingCommitment}
          onClose={() => setEditingCommitment(null)}
        />
      )}

      {/* Financial Detail Drawer */}
      <FinancialDetailDrawer
        isOpen={financialDrawerOpen}
        onClose={() => {
          setFinancialDrawerOpen(false);
          setFinancialDrawerContext(null);
        }}
        partId={financialDrawerContext?.partId}
        projectId={financialDrawerContext?.projectId || projectId}
        financialStatus={financialDrawerContext?.financialStatus}
      />

      {/* Reverse Installation Modal */}
      {reversingInstall && (
        <ReverseInstallationModal
          installedPart={reversingInstall.installedPart}
          part={reversingInstall.part}
          commitment={reversingInstall.commitment}
          onClose={() => setReversingInstall(null)}
        />
      )}
    </div>
  );
}