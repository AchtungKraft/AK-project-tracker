import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShoppingCart, Package, Truck, CheckCircle2, AlertTriangle, DollarSign,
  ArrowRight, Eye, Building2, RefreshCw, Search, LayoutGrid, List,
  Wallet, AlertCircle, Clock, Wrench, FolderKanban, Filter
} from "lucide-react";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";

/**
 * Supply Landing - Portfolio-level supply chain overview (Screen 1)
 * Route: /supply
 */
export default function SupplyLanding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState('cards');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Data Fetching
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date')
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list()
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list()
  });

  const { data: commitments = [] } = useQuery({
    queryKey: ['partCommitments'],
    queryFn: () => base44.entities.PartCommitment.list()
  });

  const { data: pools = [] } = useQuery({
    queryKey: ['billingPools'],
    queryFn: () => base44.entities.BillingPool.list()
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list()
  });

  const { data: requirements = [] } = useQuery({
    queryKey: ['partProjectRequirements'],
    queryFn: () => base44.entities.PartProjectRequirement.list()
  });

  const { data: installedParts = [] } = useQuery({
    queryKey: ['installedParts'],
    queryFn: () => base44.entities.InstalledPart.list()
  });

  const projectStatuses = statuses.filter(s => s.scope === 'Project' && s.active);

  // Calculate comprehensive supply metrics per project
  const projectMetrics = useMemo(() => {
    return projects.map(project => {
      const projectCommitments = commitments.filter(c => c.project_id === project.id && c.commitment_status !== 'cancelled');
      const projectRequirements = requirements.filter(r => r.project_id === project.id);
      const projectPools = pools.filter(p => p.project_id === project.id);
      const projectInstalled = installedParts.filter(ip => !ip.is_reversed && projectCommitments.some(c => c.id === ip.commitment_id));

      // Commitment lifecycle counts
      const byStatus = {
        planned: projectCommitments.filter(c => c.commitment_status === 'planned').length,
        ordered: projectCommitments.filter(c => c.commitment_status === 'ordered').length,
        partiallyReceived: projectCommitments.filter(c => c.commitment_status === 'partially_received').length,
        received: projectCommitments.filter(c => c.commitment_status === 'received').length,
        allocated: projectCommitments.filter(c => c.commitment_status === 'allocated').length,
        installed: projectCommitments.filter(c => c.commitment_status === 'installed').length,
      };

      // Requirements summary
      const reqTotal = projectRequirements.length;
      const reqInStock = projectRequirements.filter(r => r.needed_status === 'On-Hand').length;
      const reqToBuy = projectRequirements.filter(r => r.needed_status === 'Need to Buy').length;

      // Financial metrics
      const totalPlannedRetail = projectCommitments.reduce((sum, c) => sum + (c.planned_retail_total || 0), 0);
      const totalCovered = projectCommitments.reduce((sum, c) => sum + (c.covered_retail_total || 0), 0);
      const totalExposure = projectCommitments.reduce((sum, c) => sum + (c.exposure_gap || 0), 0);
      const totalInvoiced = projectCommitments.reduce((sum, c) => sum + (c.invoiced_retail_total || 0), 0);

      // Pool metrics
      const poolPaid = projectPools.reduce((sum, p) => sum + (p.paid_amount || 0), 0);
      const poolAvailable = projectPools.reduce((sum, p) => sum + (p.balance || 0), 0);
      const hasOverdrawn = projectPools.some(p => p.status === 'overdrawn' || (p.balance || 0) < 0);

      // Coverage percentage
      const coveragePct = totalPlannedRetail > 0 ? Math.round((totalCovered / totalPlannedRetail) * 100) : 0;

      // Procurement metrics
      const needsOrder = projectCommitments.filter(c => 
        c.commitment_status === 'planned' || 
        (c.qty_committed || 0) > (c.qty_ordered || 0)
      ).length;

      const onOrder = projectCommitments.filter(c => 
        ['ordered', 'partially_received'].includes(c.commitment_status)
      ).length;

      const receivedPendingPutaway = projectCommitments.filter(c => 
        c.commitment_status === 'received' && (c.qty_received || 0) > (c.qty_allocated || 0)
      ).length;

      // Install metrics
      const totalQtyCommitted = projectCommitments.reduce((sum, c) => sum + (c.qty_committed || 0), 0);
      const totalQtyInstalled = projectCommitments.reduce((sum, c) => sum + (c.qty_installed || 0), 0);
      const installPct = totalQtyCommitted > 0 ? Math.round((totalQtyInstalled / totalQtyCommitted) * 100) : 0;

      // Alert flags
      const alerts = {
        prepayBlocking: projectCommitments.some(c => c.requires_prepay && !c.prepay_satisfied_at && c.commitment_status === 'planned'),
        poolOverdrawn: hasOverdrawn,
        unreceivedItems: onOrder > 0,
        unallocatedInventory: receivedPendingPutaway > 0,
        installedUncovered: projectCommitments.some(c => c.commitment_status === 'installed' && (c.exposure_gap || 0) > 0),
      };
      const alertCount = Object.values(alerts).filter(Boolean).length;

      return {
        project,
        byStatus,
        reqTotal,
        reqInStock,
        reqToBuy,
        totalPlannedRetail,
        totalCovered,
        totalExposure,
        totalInvoiced,
        poolPaid,
        poolAvailable,
        hasOverdrawn,
        coveragePct,
        needsOrder,
        onOrder,
        receivedPendingPutaway,
        installPct,
        alerts,
        alertCount,
        total: projectCommitments.length,
      };
    });
  }, [projects, commitments, requirements, pools, installedParts]);

  // Apply filters
  const filteredMetrics = useMemo(() => {
    return projectMetrics.filter(({ project }) => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!project.name?.toLowerCase().includes(term) && 
            !project.client_name?.toLowerCase().includes(term)) {
          return false;
        }
      }
      if (statusFilter !== 'all' && project.status_id !== statusFilter) return false;
      if (typeFilter !== 'all' && project.project_type_id !== typeFilter) return false;
      return true;
    });
  }, [projectMetrics, searchTerm, statusFilter, typeFilter]);

  // Portfolio totals
  const portfolioTotals = useMemo(() => ({
    totalProjects: filteredMetrics.length,
    totalCommitments: filteredMetrics.reduce((sum, p) => sum + p.total, 0),
    totalNeedsOrder: filteredMetrics.reduce((sum, p) => sum + p.needsOrder, 0),
    totalOnOrder: filteredMetrics.reduce((sum, p) => sum + p.onOrder, 0),
    totalExposure: filteredMetrics.reduce((sum, p) => sum + p.totalExposure, 0),
    totalPoolAvailable: filteredMetrics.reduce((sum, p) => sum + p.poolAvailable, 0),
    alertProjects: filteredMetrics.filter(p => p.alertCount > 0).length,
  }), [filteredMetrics]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setIsRefreshing(false);
  };

  const handleDrilldown = (projectId, view) => {
    switch (view) {
      case 'supply':
        navigate(createPageUrl(`ProjectSupplyManager?project_id=${projectId}`));
        break;
      case 'needs_order':
        navigate(createPageUrl(`GlobalNeedToOrder?project_id=${projectId}`));
        break;
      case 'financial':
        navigate(createPageUrl(`ProjectSupplyManager?project_id=${projectId}&tab=fund`));
        break;
      case 'open_pos':
        navigate(createPageUrl(`SupplyOnOrder?project_id=${projectId}`));
        break;
      default:
        navigate(createPageUrl(`ProjectSupplyManager?project_id=${projectId}`));
    }
  };

  const renderProjectCard = ({ project, ...metrics }) => {
    const status = statuses.find(s => s.id === project.status_id);
    const projectType = projectTypes.find(t => t.id === project.project_type_id);

    return (
      <Card 
        key={project.id}
        className="bg-black/40 border-gray-800 hover:border-red-900/50 transition-colors cursor-pointer"
        onClick={() => handleDrilldown(project.id, 'supply')}
      >
        <CardHeader className="p-4 pb-2">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-white text-base truncate">{project.name}</CardTitle>
              {project.client_name && (
                <p className="text-xs text-gray-400 truncate">{project.client_name}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {metrics.alertCount > 0 && (
                <Badge variant="outline" className="border-red-600 text-red-400 text-xs">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {metrics.alertCount}
                </Badge>
              )}
              {status && (
                <Badge style={{ backgroundColor: status.color }} className="text-white text-xs shrink-0">
                  {status.label}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-0 space-y-3">
          {/* Progress Bars */}
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Coverage</span>
                <span className={metrics.coveragePct >= 100 ? 'text-green-400' : metrics.coveragePct > 50 ? 'text-yellow-400' : 'text-red-400'}>
                  {metrics.coveragePct}%
                </span>
              </div>
              <Progress value={metrics.coveragePct} className="h-1.5" />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Installed</span>
                <span className="text-white">{metrics.installPct}%</span>
              </div>
              <Progress value={metrics.installPct} className="h-1.5" />
            </div>
          </div>

          {/* Status Grid */}
          <div className="grid grid-cols-5 gap-1 text-center">
            <div className="p-1 bg-gray-800/50 rounded">
              <p className="text-xs text-gray-500">Plan</p>
              <p className="text-sm font-bold text-gray-300">{metrics.byStatus.planned}</p>
            </div>
            <div className="p-1 bg-purple-900/20 rounded">
              <p className="text-xs text-gray-500">Order</p>
              <p className="text-sm font-bold text-purple-400">{metrics.byStatus.ordered}</p>
            </div>
            <div className="p-1 bg-blue-900/20 rounded">
              <p className="text-xs text-gray-500">Recv</p>
              <p className="text-sm font-bold text-blue-400">{metrics.byStatus.received}</p>
            </div>
            <div className="p-1 bg-cyan-900/20 rounded">
              <p className="text-xs text-gray-500">Alloc</p>
              <p className="text-sm font-bold text-cyan-400">{metrics.byStatus.allocated}</p>
            </div>
            <div className="p-1 bg-green-900/20 rounded">
              <p className="text-xs text-gray-500">Inst</p>
              <p className="text-sm font-bold text-green-400">{metrics.byStatus.installed}</p>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="flex items-center justify-between p-2 bg-gray-800/30 rounded text-xs">
            <div className="flex items-center gap-3">
              {metrics.needsOrder > 0 && (
                <button 
                  className="flex items-center gap-1 text-red-400 hover:text-red-300"
                  onClick={(e) => { e.stopPropagation(); handleDrilldown(project.id, 'needs_order'); }}
                >
                  <ShoppingCart className="w-3 h-3" />
                  <span>{metrics.needsOrder}</span>
                </button>
              )}
              {metrics.totalExposure > 0 && (
                <button 
                  className="flex items-center gap-1 text-yellow-400 hover:text-yellow-300"
                  onClick={(e) => { e.stopPropagation(); handleDrilldown(project.id, 'financial'); }}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>${metrics.totalExposure.toFixed(0)}</span>
                </button>
              )}
              {metrics.hasOverdrawn && (
                <span className="flex items-center gap-1 text-red-400">
                  <Wallet className="w-3 h-3" />
                  OD
                </span>
              )}
            </div>
            <span className="text-gray-500">
              Pool: <span className={metrics.poolAvailable >= 0 ? 'text-green-400' : 'text-red-400'}>
                ${metrics.poolAvailable.toFixed(0)}
              </span>
            </span>
          </div>

          {/* Alert Pills */}
          {metrics.alertCount > 0 && (
            <div className="flex flex-wrap gap-1">
              {metrics.alerts.prepayBlocking && (
                <Badge variant="outline" className="border-orange-600/50 text-orange-400 text-xs">Prepay Block</Badge>
              )}
              {metrics.alerts.installedUncovered && (
                <Badge variant="outline" className="border-red-600/50 text-red-400 text-xs">Uncovered Install</Badge>
              )}
              {metrics.alerts.unallocatedInventory && (
                <Badge variant="outline" className="border-blue-600/50 text-blue-400 text-xs">Needs Location</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
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
                SUPPLY CHAIN DASHBOARD
              </h1>
              <p className="text-sm text-gray-400">Portfolio-level supply management</p>
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
                Refresh
              </Button>
              <Button
                onClick={() => navigate(createPageUrl('GlobalNeedToOrder'))}
                className="bg-red-600 hover:bg-red-700 gap-2"
              >
                <ShoppingCart className="w-4 h-4" />
                Order Queue
              </Button>
            </div>
          </div>

          {/* Portfolio Summary */}
          <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Projects</p>
                <p className="text-2xl font-bold text-white">{portfolioTotals.totalProjects}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Commitments</p>
                <p className="text-2xl font-bold text-blue-400">{portfolioTotals.totalCommitments}</p>
              </CardContent>
            </Card>
            <Card 
              className="bg-black/40 border-red-900/30 cursor-pointer hover:bg-red-900/10"
              onClick={() => navigate(createPageUrl('GlobalNeedToOrder'))}
            >
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Needs Order</p>
                <p className="text-2xl font-bold text-red-400">{portfolioTotals.totalNeedsOrder}</p>
              </CardContent>
            </Card>
            <Card 
              className="bg-black/40 border-purple-900/30 cursor-pointer hover:bg-purple-900/10"
              onClick={() => navigate(createPageUrl('SupplyOnOrder'))}
            >
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">On Order</p>
                <p className="text-2xl font-bold text-purple-400">{portfolioTotals.totalOnOrder}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Pool Available</p>
                <p className={`text-2xl font-bold ${portfolioTotals.totalPoolAvailable >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${portfolioTotals.totalPoolAvailable.toFixed(0)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Exposure</p>
                <p className="text-2xl font-bold text-yellow-400">${portfolioTotals.totalExposure.toFixed(0)}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-orange-900/30">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">With Alerts</p>
                <p className="text-2xl font-bold text-orange-400">{portfolioTotals.alertProjects}</p>
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
                    placeholder="Search projects..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 text-white"
                  />
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36 bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {projectStatuses.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-36 bg-gray-900/50 border-gray-700 text-white">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {projectTypes.filter(t => t.active).map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Tabs value={viewMode} onValueChange={setViewMode}>
                  <TabsList className="bg-gray-900/50 border border-gray-700">
                    <TabsTrigger value="cards" className="data-[state=active]:bg-red-900/30">
                      <LayoutGrid className="w-4 h-4" />
                    </TabsTrigger>
                    <TabsTrigger value="list" className="data-[state=active]:bg-red-900/30">
                      <List className="w-4 h-4" />
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardContent>
          </Card>

          {/* Project Cards/List */}
          {projectsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Card key={i} className="bg-black/40 border-gray-800 h-64 animate-pulse" />
              ))}
            </div>
          ) : filteredMetrics.length === 0 ? (
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-8 text-center">
                <FolderKanban className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                <p className="text-gray-400">No projects match your filters</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMetrics.map(renderProjectCard)}
            </div>
          )}

          {/* Quick Queue Links */}
          <Card className="bg-black/40 border-gray-800">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-white text-base">Work Queues</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button
                  variant="outline"
                  className="border-red-900/50 text-red-400 hover:bg-red-900/20 justify-start gap-2"
                  onClick={() => navigate(createPageUrl('SupplyQueues?queue=need_funding'))}
                >
                  <Wallet className="w-4 h-4" />
                  Need Funding
                </Button>
                <Button
                  variant="outline"
                  className="border-green-900/50 text-green-400 hover:bg-green-900/20 justify-start gap-2"
                  onClick={() => navigate(createPageUrl('GlobalNeedToOrder'))}
                >
                  <ShoppingCart className="w-4 h-4" />
                  Ready to Order
                </Button>
                <Button
                  variant="outline"
                  className="border-purple-900/50 text-purple-400 hover:bg-purple-900/20 justify-start gap-2"
                  onClick={() => navigate(createPageUrl('SupplyOnOrder'))}
                >
                  <Truck className="w-4 h-4" />
                  On Order
                </Button>
                <Button
                  variant="outline"
                  className="border-blue-900/50 text-blue-400 hover:bg-blue-900/20 justify-start gap-2"
                  onClick={() => navigate(createPageUrl('SupplyQueues?queue=ready_receive'))}
                >
                  <Package className="w-4 h-4" />
                  Ready to Receive
                </Button>
                <Button
                  variant="outline"
                  className="border-cyan-900/50 text-cyan-400 hover:bg-cyan-900/20 justify-start gap-2"
                  onClick={() => navigate(createPageUrl('SupplyQueues?queue=unassigned_location'))}
                >
                  <Clock className="w-4 h-4" />
                  Needs Location
                </Button>
                <Button
                  variant="outline"
                  className="border-emerald-900/50 text-emerald-400 hover:bg-emerald-900/20 justify-start gap-2"
                  onClick={() => navigate(createPageUrl('SupplyQueues?queue=ready_install'))}
                >
                  <Wrench className="w-4 h-4" />
                  Ready to Install
                </Button>
                <Button
                  variant="outline"
                  className="border-orange-900/50 text-orange-400 hover:bg-orange-900/20 justify-start gap-2"
                  onClick={() => navigate(createPageUrl('SupplyQueues?queue=installed_uncovered'))}
                >
                  <AlertTriangle className="w-4 h-4" />
                  Uncovered Installs
                </Button>
                <Button
                  variant="outline"
                  className="border-red-900/50 text-red-400 hover:bg-red-900/20 justify-start gap-2"
                  onClick={() => navigate(createPageUrl('SupplyQueues?queue=overdrawn_pools'))}
                >
                  <AlertCircle className="w-4 h-4" />
                  Overdrawn Pools
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MobileSafeAreaContainer>
  );
}