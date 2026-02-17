import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  ShoppingCart, Package, Truck, CheckCircle2, AlertTriangle, DollarSign,
  ArrowLeft, ArrowRight, Plus, MoreVertical, RefreshCw, Search, Wallet,
  Wrench, X, ChevronRight, FileText, Download, Eye, Edit, Trash2,
  AlertCircle, Clock, MapPin
} from "lucide-react";
import { toast } from "sonner";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import { CommitmentActions } from "@/components/financial/financialMutationGuard";
import { getAllowedCommitmentActions, getCommitmentLifecycleState } from "@/components/lifecycle/getAllowedCommitmentActions";
import { CoverageBadge, BillingStatusBadge } from "@/components/parts/FinancialColumns";
import OrderPartModal from "@/components/parts/OrderPartModal";
import DeltaOrderModal from "@/components/parts/DeltaOrderModal";
import CreatePoolModal from "@/components/financial/CreatePoolModal";
import InstallPartModal from "@/components/project/InstallPartModal";
import ReverseInstallationModal from "@/components/project/ReverseInstallationModal";
import ReceiveInventoryModal from "@/components/receiving/ReceiveInventoryModal";
import AllocatePoolModal from "@/components/financial/AllocatePoolModal";
import CancelCommitmentModal from "@/components/parts/CancelCommitmentModal";

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
  const initialTab = urlParams.get('tab') || 'plan';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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

  // Data Fetching
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const projects = await base44.entities.Project.filter({ id: projectId });
      return projects[0];
    },
    enabled: !!projectId
  });

  const { data: requirements = [], refetch: refetchReqs } = useQuery({
    queryKey: ['projectRequirements', projectId],
    queryFn: () => base44.entities.PartProjectRequirement.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  const { data: commitments = [], refetch: refetchCommitments } = useQuery({
    queryKey: ['projectCommitments', projectId],
    queryFn: () => base44.entities.PartCommitment.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  const { data: pools = [], refetch: refetchPools } = useQuery({
    queryKey: ['projectPools', projectId],
    queryFn: () => base44.entities.BillingPool.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ['projectAllocations', projectId],
    queryFn: async () => {
      const poolIds = pools.map(p => p.id);
      if (poolIds.length === 0) return [];
      const allAllocations = await base44.entities.PoolAllocation.list();
      return allAllocations.filter(a => poolIds.includes(a.pool_id));
    },
    enabled: pools.length > 0
  });

  const { data: charges = [] } = useQuery({
    queryKey: ['projectCharges', projectId],
    queryFn: () => base44.entities.PoolCharge.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['projectLineItems', projectId],
    queryFn: async () => {
      const commitmentIds = commitments.map(c => c.id);
      if (commitmentIds.length === 0) return [];
      const allItems = await base44.entities.PartPurchaseLineItem.list();
      return allItems.filter(li => commitmentIds.includes(li.commitment_id));
    },
    enabled: commitments.length > 0
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list()
  });

  const { data: installedParts = [] } = useQuery({
    queryKey: ['projectInstalledParts', projectId],
    queryFn: async () => {
      const commitmentIds = commitments.map(c => c.id);
      if (commitmentIds.length === 0) return [];
      const allInstalled = await base44.entities.InstalledPart.list();
      return allInstalled.filter(ip => commitmentIds.includes(ip.commitment_id));
    },
    enabled: commitments.length > 0
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list()
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list()
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list()
  });

  // Filtered data
  const activeCommitments = commitments.filter(c => c.commitment_status !== 'cancelled');

  // Calculate metrics
  const metrics = useMemo(() => {
    const byStatus = {
      planned: activeCommitments.filter(c => c.commitment_status === 'planned').length,
      ordered: activeCommitments.filter(c => c.commitment_status === 'ordered').length,
      partiallyReceived: activeCommitments.filter(c => c.commitment_status === 'partially_received').length,
      received: activeCommitments.filter(c => c.commitment_status === 'received').length,
      allocated: activeCommitments.filter(c => c.commitment_status === 'allocated').length,
      installed: activeCommitments.filter(c => c.commitment_status === 'installed').length,
    };

    const totalPlanned = activeCommitments.reduce((sum, c) => sum + (c.planned_retail_total || 0), 0);
    const totalCovered = activeCommitments.reduce((sum, c) => sum + (c.covered_retail_total || 0), 0);
    const totalExposure = activeCommitments.reduce((sum, c) => sum + (c.exposure_gap || 0), 0);
    const coveragePct = totalPlanned > 0 ? Math.round((totalCovered / totalPlanned) * 100) : 0;

    const poolBalance = pools.reduce((sum, p) => sum + (p.balance || 0), 0);
    const poolPaid = pools.reduce((sum, p) => sum + (p.paid_amount || 0), 0);
    const hasOverdrawn = pools.some(p => p.status === 'overdrawn');

    const totalQtyCommitted = activeCommitments.reduce((sum, c) => sum + (c.qty_committed || 0), 0);
    const totalQtyInstalled = activeCommitments.reduce((sum, c) => sum + (c.qty_installed || 0), 0);
    const installPct = totalQtyCommitted > 0 ? Math.round((totalQtyInstalled / totalQtyCommitted) * 100) : 0;

    return {
      byStatus,
      totalPlanned,
      totalCovered,
      totalExposure,
      coveragePct,
      poolBalance,
      poolPaid,
      hasOverdrawn,
      installPct,
      totalCommitments: activeCommitments.length,
    };
  }, [activeCommitments, pools]);

  // Enrich commitments with part data
  const enrichedCommitments = useMemo(() => {
    return activeCommitments.map(commitment => {
      const part = parts.find(p => p.id === commitment.part_id);
      const vendor = part ? vendors.find(v => v.id === part.default_vendor_id) : null;
      const allowed = getAllowedCommitmentActions(commitment);
      const lifecycleState = getCommitmentLifecycleState(commitment);
      const commitmentLineItems = lineItems.filter(li => li.commitment_id === commitment.id);
      const commitmentInstalled = installedParts.filter(ip => ip.commitment_id === commitment.id && !ip.is_reversed);

      return {
        ...commitment,
        part,
        vendor,
        allowed,
        lifecycleState,
        lineItems: commitmentLineItems,
        installedParts: commitmentInstalled,
      };
    });
  }, [activeCommitments, parts, vendors, lineItems, installedParts]);

  // Filter commitments for each tab
  const getFilteredCommitments = (tabFilter) => {
    let filtered = enrichedCommitments;

    // Apply status filter for tab
    switch (tabFilter) {
      case 'plan':
        filtered = filtered.filter(c => c.commitment_status === 'planned');
        break;
      case 'buy':
        filtered = filtered.filter(c => 
          c.commitment_status === 'planned' || 
          (c.qty_committed || 0) > (c.qty_ordered || 0)
        );
        break;
      case 'receive':
        filtered = filtered.filter(c => 
          ['ordered', 'partially_received'].includes(c.commitment_status)
        );
        break;
      case 'install':
        filtered = filtered.filter(c => 
          ['received', 'allocated', 'installed'].includes(c.commitment_status) ||
          (c.qty_received || 0) > (c.qty_installed || 0)
        );
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      refetchReqs(),
      refetchCommitments(),
      refetchPools(),
    ]);
    queryClient.invalidateQueries();
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

  // Render commitment row
  const renderCommitmentRow = (commitment, showActions = true) => {
    const { part, vendor, allowed, lifecycleState } = commitment;

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
        <TableCell>
          <Badge 
            variant="outline" 
            className={`text-xs border-${lifecycleState.color}-600 text-${lifecycleState.color}-400`}
            style={{ borderColor: `var(--${lifecycleState.color}-600, #6B7280)`, color: `var(--${lifecycleState.color}-400, #9CA3AF)` }}
          >
            {lifecycleState.label}
          </Badge>
        </TableCell>
        <TableCell className="text-center">
          <span className="text-white">{commitment.qty_committed || 0}</span>
        </TableCell>
        <TableCell className="text-center">
          <span className={commitment.qty_ordered > 0 ? 'text-purple-400' : 'text-gray-500'}>
            {commitment.qty_ordered || 0}
          </span>
        </TableCell>
        <TableCell className="text-center">
          <span className={commitment.qty_received > 0 ? 'text-blue-400' : 'text-gray-500'}>
            {commitment.qty_received || 0}
          </span>
        </TableCell>
        <TableCell className="text-center">
          <span className={commitment.qty_installed > 0 ? 'text-green-400' : 'text-gray-500'}>
            {commitment.qty_installed || 0}
          </span>
        </TableCell>
        <TableCell className="text-right">
          <span className="text-white">${(commitment.planned_retail_total || 0).toFixed(0)}</span>
        </TableCell>
        <TableCell>
          <CoverageBadge commitment={commitment} compact />
        </TableCell>
        <TableCell className="text-right">
          <span className={commitment.exposure_gap > 0 ? 'text-red-400' : 'text-green-400'}>
            ${(commitment.exposure_gap || 0).toFixed(0)}
          </span>
        </TableCell>
        {showActions && (
          <TableCell>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
                {allowed.canCreatePO && (
                  <DropdownMenuItem onClick={() => setOrderModalPart(part)} className="text-green-400">
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
                <DropdownMenuSeparator className="bg-gray-700" />
                <DropdownMenuItem 
                  onClick={() => setAllocateModal(commitment)} 
                  className="text-blue-400"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Allocate Pool
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
              <Button
                onClick={() => setShowCreatePoolModal(true)}
                variant="outline"
                className="border-green-600 text-green-400 gap-2"
              >
                <Wallet className="w-4 h-4" />
                Create Pool
              </Button>
            </div>
          </div>

          {/* Summary Row */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Commitments</p>
                <p className="text-xl font-bold text-white">{metrics.totalCommitments}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Coverage</p>
                <p className={`text-xl font-bold ${metrics.coveragePct >= 100 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {metrics.coveragePct}%
                </p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Planned Retail</p>
                <p className="text-xl font-bold text-white">${metrics.totalPlanned.toFixed(0)}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Exposure Gap</p>
                <p className={`text-xl font-bold ${metrics.totalExposure > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  ${metrics.totalExposure.toFixed(0)}
                </p>
              </CardContent>
            </Card>
            <Card className={`bg-black/40 ${metrics.hasOverdrawn ? 'border-red-600' : 'border-gray-800'}`}>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Pool Balance</p>
                <p className={`text-xl font-bold ${metrics.poolBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${metrics.poolBalance.toFixed(0)}
                </p>
              </CardContent>
            </Card>
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
              <TabsTrigger value="fund" className="data-[state=active]:bg-green-900/30 gap-1.5">
                <Wallet className="w-4 h-4" />
                Fund
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
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800 hover:bg-transparent">
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="text-gray-400">Part</TableHead>
                        <TableHead className="text-gray-400">Status</TableHead>
                        <TableHead className="text-gray-400 text-center">Qty</TableHead>
                        <TableHead className="text-gray-400 text-center">Ordered</TableHead>
                        <TableHead className="text-gray-400 text-center">Received</TableHead>
                        <TableHead className="text-gray-400 text-center">Installed</TableHead>
                        <TableHead className="text-gray-400 text-right">Retail</TableHead>
                        <TableHead className="text-gray-400">Coverage</TableHead>
                        <TableHead className="text-gray-400 text-right">Exposure</TableHead>
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
                        getFilteredCommitments('plan').map(c => renderCommitmentRow(c))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="fund" className="mt-4 space-y-4">
              {/* Pools Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pools.map(pool => (
                  <Card key={pool.id} className={`bg-black/40 ${pool.status === 'overdrawn' ? 'border-red-600' : 'border-gray-800'}`}>
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-base">{pool.pool_name}</CardTitle>
                        <Badge variant="outline" className={
                          pool.status === 'paid' ? 'border-green-600 text-green-400' :
                          pool.status === 'invoiced' ? 'border-yellow-600 text-yellow-400' :
                          pool.status === 'overdrawn' ? 'border-red-600 text-red-400' :
                          'border-gray-600 text-gray-400'
                        }>
                          {pool.status}
                        </Badge>
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

            <TabsContent value="buy" className="mt-4">
              <Card className="bg-black/40 border-gray-800">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white">Ready to Order</CardTitle>
                      <CardDescription>Items gated by coverage and prepay requirements</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
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
                        <Button className="bg-green-600 hover:bg-green-700 gap-1">
                          <ShoppingCart className="w-4 h-4" />
                          Create PO ({selectedItems.size})
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
                        <TableHead className="text-gray-400">Status</TableHead>
                        <TableHead className="text-gray-400 text-center">Qty</TableHead>
                        <TableHead className="text-gray-400 text-center">Ordered</TableHead>
                        <TableHead className="text-gray-400 text-center">Received</TableHead>
                        <TableHead className="text-gray-400 text-center">Installed</TableHead>
                        <TableHead className="text-gray-400 text-right">Retail</TableHead>
                        <TableHead className="text-gray-400">Coverage</TableHead>
                        <TableHead className="text-gray-400 text-right">Exposure</TableHead>
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
                        getFilteredCommitments('buy').map(c => renderCommitmentRow(c))
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
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800 hover:bg-transparent">
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="text-gray-400">Part</TableHead>
                        <TableHead className="text-gray-400">Status</TableHead>
                        <TableHead className="text-gray-400 text-center">Qty</TableHead>
                        <TableHead className="text-gray-400 text-center">Ordered</TableHead>
                        <TableHead className="text-gray-400 text-center">Received</TableHead>
                        <TableHead className="text-gray-400 text-center">Installed</TableHead>
                        <TableHead className="text-gray-400 text-right">Retail</TableHead>
                        <TableHead className="text-gray-400">Coverage</TableHead>
                        <TableHead className="text-gray-400 text-right">Exposure</TableHead>
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
                        getFilteredCommitments('receive').map(c => renderCommitmentRow(c))
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
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800 hover:bg-transparent">
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="text-gray-400">Part</TableHead>
                        <TableHead className="text-gray-400">Status</TableHead>
                        <TableHead className="text-gray-400 text-center">Qty</TableHead>
                        <TableHead className="text-gray-400 text-center">Ordered</TableHead>
                        <TableHead className="text-gray-400 text-center">Received</TableHead>
                        <TableHead className="text-gray-400 text-center">Installed</TableHead>
                        <TableHead className="text-gray-400 text-right">Retail</TableHead>
                        <TableHead className="text-gray-400">Coverage</TableHead>
                        <TableHead className="text-gray-400 text-right">Exposure</TableHead>
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
                        getFilteredCommitments('install').map(c => renderCommitmentRow(c))
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
      {showCreatePoolModal && (
        <CreatePoolModal
          projectId={projectId}
          onClose={() => setShowCreatePoolModal(false)}
          onSuccess={() => {
            refetchPools();
            setShowCreatePoolModal(false);
          }}
        />
      )}

      {orderModalPart && (
        <OrderPartModal
          part={orderModalPart}
          onClose={() => setOrderModalPart(null)}
        />
      )}

      {deltaOrderCommitment && (
        <DeltaOrderModal
          commitment={deltaOrderCommitment}
          part={deltaOrderCommitment.part}
          onClose={() => setDeltaOrderCommitment(null)}
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
            refetchCommitments();
            setInstallModal(null);
          }}
        />
      )}

      {reverseInstallModal && (
        <ReverseInstallationModal
          installedParts={reverseInstallModal.installedParts}
          commitment={reverseInstallModal}
          onClose={() => setReverseInstallModal(null)}
          onSuccess={() => {
            refetchCommitments();
            setReverseInstallModal(null);
          }}
        />
      )}

      {receiveModal && (
        <ReceiveInventoryModal
          commitment={receiveModal}
          part={receiveModal.part}
          onClose={() => setReceiveModal(null)}
          onSuccess={() => {
            refetchCommitments();
            setReceiveModal(null);
          }}
        />
      )}

      {allocateModal && (
        <AllocatePoolModal
          projectId={projectId}
          commitment={allocateModal}
          onClose={() => setAllocateModal(null)}
          onSuccess={() => {
            refetchCommitments();
            refetchPools();
            queryClient.invalidateQueries({ queryKey: ['poolAllocations'] });
          }}
        />
      )}

      {cancelModal && (
        <CancelCommitmentModal
          commitment={cancelModal}
          part={cancelModal.part}
          project={project}
          onClose={() => setCancelModal(null)}
        />
      )}
    </MobileSafeAreaContainer>
  );
}