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
  Wallet, AlertCircle, Clock, Wrench, FolderKanban, Filter, Loader2
} from "lucide-react";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";

/**
 * Supply Landing - Portfolio-level supply chain overview
 * 
 * CANONICAL: Uses getPortfolioSupplyState backend read model
 * UI renders precomputed metrics only - NO lifecycle math here
 */
export default function SupplyLanding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState('cards');

  // Canonical data source - backend read model
  const { data: supplyState, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['portfolioSupplyState'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getPortfolioSupplyState', {});
      return response.data;
    },
    staleTime: 30000, // 30 seconds
  });

  // Reference data for filters (lightweight)
  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list()
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list()
  });

  const projectStatuses = statuses.filter(s => s.scope === 'Project' && s.active);
  const projects = supplyState?.projects || [];
  const portfolio = supplyState?.portfolio || {};

  // Apply local filters to precomputed data (no lifecycle recalculation)
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!p.project_name?.toLowerCase().includes(term) && 
            !p.client_name?.toLowerCase().includes(term)) {
          return false;
        }
      }
      if (statusFilter !== 'all' && p.status_id !== statusFilter) return false;
      if (typeFilter !== 'all' && p.project_type_id !== typeFilter) return false;
      return true;
    });
  }, [projects, searchTerm, statusFilter, typeFilter]);

  // Filtered portfolio totals (simple sum of precomputed values)
  const filteredTotals = useMemo(() => ({
    totalProjects: filteredProjects.length,
    totalCommitments: filteredProjects.reduce((sum, p) => sum + p.total_commitments, 0),
    totalNeedsOrder: filteredProjects.reduce((sum, p) => sum + p.needs_order_count, 0),
    totalOnOrder: filteredProjects.reduce((sum, p) => sum + p.on_order_count, 0),
    totalExposure: filteredProjects.reduce((sum, p) => sum + p.total_exposure, 0),
    totalPoolAvailable: filteredProjects.reduce((sum, p) => sum + p.total_pool_balance, 0),
    alertProjects: filteredProjects.filter(p => p.alerts.length > 0).length,
  }), [filteredProjects]);

  const handleRefresh = async () => {
    await refetch();
  };

  const handleDrilldown = (projectId, view) => {
    // All drilldowns route to canonical supply surface
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
        navigate(createPageUrl(`ProjectSupplyManager?project_id=${projectId}&tab=buy`));
        break;
      default:
        navigate(createPageUrl(`ProjectSupplyManager?project_id=${projectId}`));
    }
  };

  const renderProjectCard = (projectData) => {
    return (
      <Card 
        key={projectData.project_id}
        className="bg-black/40 border-gray-800 hover:border-red-900/50 transition-colors cursor-pointer"
        onClick={() => handleDrilldown(projectData.project_id, 'supply')}
      >
        <CardHeader className="p-4 pb-2">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-white text-base truncate">{projectData.project_name}</CardTitle>
              {projectData.client_name && (
                <p className="text-xs text-gray-400 truncate">{projectData.client_name}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {projectData.alerts.length > 0 && (
                <Badge variant="outline" className="border-red-600 text-red-400 text-xs">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {projectData.alerts.length}
                </Badge>
              )}
              {projectData.status_label && (
                <Badge style={{ backgroundColor: projectData.status_color }} className="text-white text-xs shrink-0">
                  {projectData.status_label}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-0 space-y-3">
          {/* Progress Bars - render precomputed values */}
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Coverage</span>
                <span className={projectData.coverage_percent >= 100 ? 'text-green-400' : projectData.coverage_percent > 50 ? 'text-yellow-400' : 'text-red-400'}>
                  {projectData.coverage_percent}%
                </span>
              </div>
              <Progress value={projectData.coverage_percent} className="h-1.5" />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Installed</span>
                <span className="text-white">{projectData.install_percent}%</span>
              </div>
              <Progress value={projectData.install_percent} className="h-1.5" />
            </div>
          </div>

          {/* Status Grid - render precomputed counts */}
          <div className="grid grid-cols-5 gap-1 text-center">
            <div className="p-1 bg-gray-800/50 rounded">
              <p className="text-xs text-gray-500">Plan</p>
              <p className="text-sm font-bold text-gray-300">{projectData.status_counts.planned}</p>
            </div>
            <div className="p-1 bg-purple-900/20 rounded">
              <p className="text-xs text-gray-500">Order</p>
              <p className="text-sm font-bold text-purple-400">{projectData.status_counts.ordered}</p>
            </div>
            <div className="p-1 bg-blue-900/20 rounded">
              <p className="text-xs text-gray-500">Recv</p>
              <p className="text-sm font-bold text-blue-400">{projectData.status_counts.received}</p>
            </div>
            <div className="p-1 bg-cyan-900/20 rounded">
              <p className="text-xs text-gray-500">Alloc</p>
              <p className="text-sm font-bold text-cyan-400">{projectData.status_counts.allocated}</p>
            </div>
            <div className="p-1 bg-green-900/20 rounded">
              <p className="text-xs text-gray-500">Inst</p>
              <p className="text-sm font-bold text-green-400">{projectData.status_counts.installed}</p>
            </div>
          </div>

          {/* Financial Summary - render precomputed values */}
          <div className="flex items-center justify-between p-2 bg-gray-800/30 rounded text-xs">
            <div className="flex items-center gap-3">
              {projectData.needs_order_count > 0 && (
                <button 
                  className="flex items-center gap-1 text-red-400 hover:text-red-300"
                  onClick={(e) => { e.stopPropagation(); handleDrilldown(projectData.project_id, 'needs_order'); }}
                >
                  <ShoppingCart className="w-3 h-3" />
                  <span>{projectData.needs_order_count}</span>
                </button>
              )}
              {projectData.total_exposure > 0 && (
                <button 
                  className="flex items-center gap-1 text-yellow-400 hover:text-yellow-300"
                  onClick={(e) => { e.stopPropagation(); handleDrilldown(projectData.project_id, 'financial'); }}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>${projectData.total_exposure.toFixed(0)}</span>
                </button>
              )}
              {projectData.has_overdrawn_pool && (
                <span className="flex items-center gap-1 text-red-400">
                  <Wallet className="w-3 h-3" />
                  OD
                </span>
              )}
            </div>
            <span className="text-gray-500">
              Pool: <span className={projectData.total_pool_balance >= 0 ? 'text-green-400' : 'text-red-400'}>
                ${projectData.total_pool_balance.toFixed(0)}
              </span>
            </span>
          </div>

          {/* Alert Pills - render precomputed alerts */}
          {projectData.alerts.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {projectData.alerts.includes('FUNDING_BLOCKED') && (
                <Badge variant="outline" className="border-red-600/50 text-red-400 text-xs">Funding Blocked</Badge>
              )}
              {projectData.alerts.includes('POOL_OVERDRAWN') && (
                <Badge variant="outline" className="border-red-600/50 text-red-400 text-xs">Pool Overdrawn</Badge>
              )}
              {projectData.alerts.includes('PARTIAL_COVERAGE') && (
                <Badge variant="outline" className="border-orange-600/50 text-orange-400 text-xs">Partial Coverage</Badge>
              )}
              {projectData.is_funding_blocked && (
                <Badge variant="outline" className="border-yellow-600/50 text-yellow-400 text-xs">Prepay Block</Badge>
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
                disabled={isLoading || isRefetching}
              >
                <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
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

          {/* Portfolio Summary - render precomputed totals */}
          <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Projects</p>
                <p className="text-2xl font-bold text-white">{filteredTotals.totalProjects}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Commitments</p>
                <p className="text-2xl font-bold text-blue-400">{filteredTotals.totalCommitments}</p>
              </CardContent>
            </Card>
            <Card 
              className="bg-black/40 border-red-900/30 cursor-pointer hover:bg-red-900/10"
              onClick={() => navigate(createPageUrl('GlobalNeedToOrder'))}
            >
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Needs Order</p>
                <p className="text-2xl font-bold text-red-400">{filteredTotals.totalNeedsOrder}</p>
              </CardContent>
            </Card>
            <Card 
              className="bg-black/40 border-purple-900/30 cursor-pointer hover:bg-purple-900/10"
              onClick={() => navigate(createPageUrl('SupplyQueues?queue=on_order'))}
            >
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">On Order</p>
                <p className="text-2xl font-bold text-purple-400">{filteredTotals.totalOnOrder}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Pool Available</p>
                <p className={`text-2xl font-bold ${filteredTotals.totalPoolAvailable >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${filteredTotals.totalPoolAvailable.toFixed(0)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Exposure</p>
                <p className="text-2xl font-bold text-yellow-400">${filteredTotals.totalExposure.toFixed(0)}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-orange-900/30">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">With Alerts</p>
                <p className="text-2xl font-bold text-orange-400">{filteredTotals.alertProjects}</p>
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
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-red-500" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-8 text-center">
                <FolderKanban className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                <p className="text-gray-400">No projects match your filters</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map(renderProjectCard)}
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
                  onClick={() => navigate(createPageUrl('SupplyQueues?queue=on_order'))}
                >
                  <Truck className="w-4 h-4" />
                  On Order
                </Button>
                <Button
                  variant="outline"
                  className="border-blue-900/50 text-blue-400 hover:bg-blue-900/20 justify-start gap-2"
                  onClick={() => navigate(createPageUrl('SupplyQueues?queue=ready_to_receive'))}
                >
                  <Package className="w-4 h-4" />
                  Ready to Receive
                </Button>
                <Button
                  variant="outline"
                  className="border-cyan-900/50 text-cyan-400 hover:bg-cyan-900/20 justify-start gap-2"
                  onClick={() => navigate(createPageUrl('SupplyQueues?queue=unassigned_inventory'))}
                >
                  <Clock className="w-4 h-4" />
                  Needs Location
                </Button>
                <Button
                  variant="outline"
                  className="border-emerald-900/50 text-emerald-400 hover:bg-emerald-900/20 justify-start gap-2"
                  onClick={() => navigate(createPageUrl('SupplyQueues?queue=ready_to_install'))}
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