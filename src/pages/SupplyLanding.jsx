import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
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
  Package, ChevronRight, ArrowUpDown
} from "lucide-react";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";

/**
 * SupplyLanding - Portfolio Overview (Screen 1)
 * Data Source: getPortfolioSupplyState() backend function
 * Mutations: NONE (read-only overview)
 */
export default function SupplyLanding() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('exposure');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Debounce search to avoid excessive API calls
  const [debouncedSearch, setDebouncedSearch] = useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch portfolio state from backend with filters
  const { data: portfolioData, isLoading, refetch } = useQuery({
    queryKey: ['portfolioSupplyState', debouncedSearch, statusFilter],
    queryFn: async () => {
      const response = await base44.functions.invoke('getPortfolioSupplyState', {
        searchTerm: debouncedSearch,
        statusFilter: statusFilter === 'all' ? null : statusFilter,
      });
      return response.data;
    },
    staleTime: 30000,
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
    await refetch();
    setIsRefreshing(false);
  };

  const handleProjectClick = (projectId) => {
    navigate(createPageUrl('ProjectSupplyManager') + `?project_id=${projectId}`);
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

          {/* Filters */}
          <Card className="bg-black/40 border-gray-800">
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search projects..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 text-white h-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px] bg-gray-900/50 border-gray-700 text-white h-9">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    <SelectItem value="active">With Commitments</SelectItem>
                    <SelectItem value="alerts">With Alerts</SelectItem>
                    <SelectItem value="funding_blocked">Funding Blocked</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[150px] bg-gray-900/50 border-gray-700 text-white h-9">
                    <ArrowUpDown className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exposure">Highest Exposure</SelectItem>
                    <SelectItem value="coverage">Lowest Coverage</SelectItem>
                    <SelectItem value="install">Most Installed</SelectItem>
                    <SelectItem value="commitments">Most Items</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Projects Table */}
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
                      <TableHead className="text-gray-400 text-right">Exposure</TableHead>
                      <TableHead className="text-gray-400 text-right">Pool Bal</TableHead>
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
                          <span className={project.total_exposure > 0 ? 'text-red-400' : 'text-green-400'}>
                            ${(project.total_exposure || 0).toFixed(0)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={project.total_pool_balance >= 0 ? 'text-green-400' : 'text-red-400'}>
                            ${(project.total_pool_balance || 0).toFixed(0)}
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
                            {project.is_funding_blocked && (
                              <Badge variant="outline" className="border-red-600 text-red-400 text-xs">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Blocked
                              </Badge>
                            )}
                            {project.has_overdrawn_pool && (
                              <Badge variant="outline" className="border-orange-600 text-orange-400 text-xs">
                                Overdrawn
                              </Badge>
                            )}
                            {!project.is_funding_blocked && !project.has_overdrawn_pool && project.total_commitments > 0 && (
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
        </div>
      </div>
    </MobileSafeAreaContainer>
  );
}