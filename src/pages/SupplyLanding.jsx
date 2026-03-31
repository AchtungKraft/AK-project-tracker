import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Layers, Search, RefreshCw, AlertTriangle, CheckCircle2,
  Package, ChevronRight, ArrowUpDown, Trash2, Eye, Loader2, ShieldAlert
} from "lucide-react";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import SupplyHardResetPanel from "@/components/supply/SupplyHardResetPanel.jsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useWiringAudit } from "@/components/dev/wiringAudit";
import GlobalActionQueue from "@/components/supply/GlobalActionQueue";
import { useSupplyAction } from "@/components/supply/useSupplyAction";

/**
 * SupplyLanding - Portfolio Overview (Screen 1)
 * Data Source: getPortfolioSupplyState() backend function
 * Mutations: NONE (read-only overview)
 */
export default function SupplyLanding() {
  const navigate = useNavigate();
  const audit = useWiringAudit('SupplyLanding');
  
  // CANONICAL: Financial model determines routing
  // Forward projects never route to tab=fund
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('exposure');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewMode, setViewMode] = useState('projects'); // 'projects' | 'actions'
  const [vendorFilter, setVendorFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const supplyAction = useSupplyAction({ showSuccessToast: true });

  // Check admin status
  useEffect(() => {
    base44.auth.me().then(user => {
      setIsAdmin(user?.role === 'admin');
    }).catch(() => setIsAdmin(false));
  }, []);

  // Debounce search to avoid excessive API calls
  const [debouncedSearch, setDebouncedSearch] = useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch portfolio state from backend with filters
  // PERF FIX: Full query stability settings
  const { data: portfolioData, isLoading, error: portfolioError, refetch } = useQuery({
    queryKey: ['portfolioSupplyState', debouncedSearch, statusFilter],
    queryFn: async () => {
      const _start = Date.now();
      const response = await base44.functions.invoke('getPortfolioSupplyState', {
        searchTerm: debouncedSearch,
        statusFilter: statusFilter === 'all' ? null : statusFilter,
      });
      if (import.meta.env.DEV) {
        console.log(`[PERF] getPortfolioSupplyState ${Date.now() - _start}ms`, {
          projects: response.data?.projects?.length
        });
      }
      return response.data;
    },
    staleTime: 30000,
    gcTime: 120000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (error?.status === 429) return false;
      return failureCount < 1;
    },
  });

  const portfolio = portfolioData?.portfolio || {};
  const projects = portfolioData?.projects || [];

  // Sort projects (filtering done server-side now)
  const sortedProjects = useMemo(() => {
    const sorted = [...projects];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'exposure':
          return (b.total_exposure || 0) - (a.total_exposure || 0);
        case 'coverage':
          return (a.coverage_percent || 0) - (b.coverage_percent || 0);
        case 'install':
          return (b.install_percent || 0) - (a.install_percent || 0);
        case 'commitments':
          return (b.total_commitments || 0) - (a.total_commitments || 0);
        default:
          return 0;
      }
    });
    return sorted;
  }, [projects, sortBy]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast.success('Portfolio refreshed');
    } catch (error) {
      toast.error('Refresh failed: ' + error.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  // CANONICAL: Route to plan tab (forward model has no fund tab)
  const handleProjectClick = (projectId) => {
    audit.trackClick('navigate_to_project', { projectId });
    navigate(createPageUrl('ProjectSupplyManager') + `?project_id=${projectId}&tab=plan`);
  };

  const getCoverageColor = (pct) => {
    if (pct >= 100) return 'text-green-400';
    if (pct >= 75) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <MobileSafeAreaContainer>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
                <Layers className="w-7 h-7 text-red-500" />
                SUPPLY DASHBOARD
              </h1>
              <p className="text-sm text-gray-400">Portfolio-wide supply chain overview</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleRefresh}
                variant="outline"
                size="sm"
                className="border-gray-700 text-white gap-2"
                disabled={isRefreshing || isLoading}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button
                onClick={() => navigate(createPageUrl('SupplyQueues'))}
                variant="outline"
                className="border-purple-600 text-purple-400 gap-2"
              >
                <Package className="w-4 h-4" />
                Work Queues
              </Button>
            </div>
          </div>

          {/* Portfolio Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Projects</p>
                <p className="text-2xl font-bold text-white">{portfolio.total_projects || 0}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Commitments</p>
                <p className="text-2xl font-bold text-white">{portfolio.total_commitments || 0}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Need Order</p>
                <p className="text-2xl font-bold text-purple-400">{portfolio.total_needs_order || 0}</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">Ready Install</p>
                <p className="text-2xl font-bold text-green-400">{portfolio.total_ready_to_install || 0}</p>
              </CardContent>
            </Card>
            <Card className={`bg-black/40 ${portfolio.projects_with_alerts > 0 ? 'border-red-600' : 'border-gray-800'}`}>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">With Alerts</p>
                <p className={`text-2xl font-bold ${portfolio.projects_with_alerts > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                  {portfolio.projects_with_alerts || 0}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* View Toggle */}
          <Tabs value={viewMode} onValueChange={setViewMode}>
            <TabsList className="bg-black/40 border border-gray-800">
              <TabsTrigger value="projects" className="data-[state=active]:bg-gray-700 gap-1.5">
                <Layers className="w-4 h-4" /> Projects
              </TabsTrigger>
              <TabsTrigger value="actions" className="data-[state=active]:bg-blue-900/30 gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Action Queue
                {(portfolioData?.all_commitments?.length || 0) > 0 && (
                  <Badge className="ml-1 text-[9px] bg-blue-900/50 text-blue-400">{portfolioData?.all_commitments?.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Filters */}
          <Card className="bg-black/40 border-gray-800">
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search projects..." value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 text-white h-9"
                  />
                </div>
                {viewMode === 'projects' && (
                  <>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[150px] bg-gray-900/50 border-gray-700 text-white h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Projects</SelectItem>
                        <SelectItem value="active">With Commitments</SelectItem>
                        <SelectItem value="alerts">With Alerts</SelectItem>
                        <SelectItem value="funding_blocked">Funding Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="w-[150px] bg-gray-900/50 border-gray-700 text-white h-9">
                        <ArrowUpDown className="w-4 h-4 mr-2" /><SelectValue placeholder="Sort" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exposure">Highest Exposure</SelectItem>
                        <SelectItem value="coverage">Lowest Coverage</SelectItem>
                        <SelectItem value="install">Most Installed</SelectItem>
                        <SelectItem value="commitments">Most Items</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
                {viewMode === 'actions' && (
                  <>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                      <SelectTrigger className="w-[130px] bg-gray-900/50 border-gray-700 text-white h-9"><SelectValue placeholder="Priority" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Priority</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="LOW">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={vendorFilter} onValueChange={setVendorFilter}>
                      <SelectTrigger className="w-[150px] bg-gray-900/50 border-gray-700 text-white h-9"><SelectValue placeholder="Vendor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Vendors</SelectItem>
                        {(() => {
                          const vendorSet = new Map();
                          (portfolioData?.all_commitments || []).forEach(c => {
                            const vId = c.part?.default_vendor_id || c.vendor_id;
                            const vName = c.vendor_name || c.part?.vendor_name;
                            if (vId && vName) vendorSet.set(vId, vName);
                          });
                          return Array.from(vendorSet.entries()).sort((a,b) => a[1].localeCompare(b[1])).map(([id, name]) => (
                            <SelectItem key={id} value={id}>{name}</SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Projects Table */}
          {viewMode === 'actions' && (
            <GlobalActionQueue
              items={portfolioData?.all_commitments || []}
              projects={projects}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              projectFilter={statusFilter !== 'all' ? null : undefined}
              vendorFilter={vendorFilter}
              onVendorFilterChange={setVendorFilter}
              priorityFilter={priorityFilter}
              onPriorityFilterChange={setPriorityFilter}
              selectedItems={selectedItems}
              onItemSelect={(id) => setSelectedItems(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
              })}
              onAction={(commitment, action, qty) => {
                if (action === 'ALLOCATE') {
                  supplyAction.autoReserve(commitment.id);
                } else if (action === 'INSTALL') {
                  supplyAction.install(commitment.id, { qty: qty || 1 });
                } else if (action === 'CREATE_PO') {
                  navigate(createPageUrl('ProjectSupplyManager') + `?project_id=${commitment.project_id}&tab=buy`);
                }
              }}
              onPartClick={(part) => {
                if (part?.id) navigate(createPageUrl('PartsTracker') + `?part_id=${part.id}`);
              }}
              onBatchPO={(items) => {
                if (items.length > 0) {
                  const projectId = items[0].project_id;
                  navigate(createPageUrl('ProjectSupplyManager') + `?project_id=${projectId}&tab=buy`);
                }
              }}
              onBatchAllocate={async (items) => {
                const ids = items.map(i => i.id).filter(Boolean);
                if (ids.length > 0) {
                  toast.info(`Allocating ${ids.length} items...`);
                  await supplyAction.autoReserve(ids);
                }
              }}
              onBatchInstall={async (items) => {
                for (const item of items) {
                  const installable = Math.max(0, (item.reserved_from_stock ?? 0) - (item.qty_installed ?? 0));
                  if (installable > 0 && item.id) {
                    await supplyAction.install(item.id, { qty: installable });
                  }
                }
                toast.success(`Installed ${items.length} items`);
              }}
              isLoading={supplyAction.isPending}
            />
          )}

          {viewMode === 'projects' && (
          <Card className="bg-black/40 border-gray-800">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-gray-500">Loading portfolio data...</div>
              ) : sortedProjects.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No projects match your filters</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableHead className="text-gray-400">Project</TableHead>
                      <TableHead className="text-gray-400 text-center">Items</TableHead>
                      <TableHead className="text-gray-400 text-center">Coverage</TableHead>
                      <TableHead className="text-gray-400 text-right">To Order</TableHead>
                      <TableHead className="text-gray-400 text-center">Install %</TableHead>
                      <TableHead className="text-gray-400 text-center">Status</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedProjects.map(project => (
                      <TableRow
                        key={project.project_id}
                        className="border-gray-800 hover:bg-gray-800/30 cursor-pointer"
                        onClick={() => handleProjectClick(project.project_id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {project.featured_image_url && (
                              <div className="w-10 h-10 bg-gray-800 rounded overflow-hidden flex-shrink-0">
                                <img src={project.featured_image_url} alt="" className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div>
                              <p className="text-white font-medium">{project.project_name}</p>
                              <p className="text-xs text-gray-500">{project.client_name}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-white">{project.total_commitments || 0}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={getCoverageColor(project.coverage_percent)}>
                            {project.coverage_percent || 0}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={project.needs_order_count > 0 ? 'text-purple-400' : 'text-gray-400'}>
                            {project.needs_order_count || 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center gap-2 justify-center">
                            <Progress value={project.install_percent || 0} className="w-16 h-2" />
                            <span className="text-xs text-gray-400">{project.install_percent || 0}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {project.needs_order_count > 0 && (
                              <Badge variant="outline" className="border-purple-600 text-purple-400 text-xs">
                                <Package className="w-3 h-3 mr-1" />
                                Order
                              </Badge>
                            )}
                            {project.ready_to_install_count > 0 && (
                              <Badge variant="outline" className="border-green-600 text-green-400 text-xs">
                                Install
                              </Badge>
                            )}
                            {!project.needs_order_count && !project.ready_to_install_count && project.total_commitments > 0 && (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          )}

          {/* Admin-only Danger Zone */}
          {isAdmin && (
            <SupplyHardResetPanel />
          )}
        </div>
      </div>
    </MobileSafeAreaContainer>
  );
}