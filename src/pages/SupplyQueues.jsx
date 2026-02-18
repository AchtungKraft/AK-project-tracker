import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Wallet, ShoppingCart, Truck, Package, Wrench, AlertTriangle,
  Search, RefreshCw, ArrowLeft, ChevronRight, Layers, MapPin
} from "lucide-react";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";

/**
 * SupplyQueues - Global Work Queues (Screen 3)
 * Data Source: getGlobalSupplyQueues() backend function
 * Mutations: NONE (read-only, links to ProjectSupplyManager for actions)
 * 
 * Displays cross-project work buckets: need_funding, ready_to_order, on_order, etc.
 */
export default function SupplyQueues() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeQueue, setActiveQueue] = useState('ready_to_order');
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch queue data from backend read model
  const { data: queueData, isLoading, refetch } = useQuery({
    queryKey: ['globalSupplyQueues', activeQueue],
    queryFn: async () => {
      const response = await base44.functions.invoke('getGlobalSupplyQueues', { queue: activeQueue });
      return response.data;
    },
    staleTime: 60000, // Cache for 60s to reduce API calls
  });

  const summary = queueData?.summary || {};
  const queues = queueData?.queues || {};

  // Get current queue items
  const currentQueue = queues[activeQueue] || { items: [] };
  const queueItems = currentQueue.items || [];

  // Get unique projects for filter
  const uniqueProjects = useMemo(() => {
    const projectMap = new Map();
    queueItems.forEach(item => {
      if (item.project_id && item.project_name) {
        projectMap.set(item.project_id, item.project_name);
      }
    });
    return Array.from(projectMap.entries());
  }, [queueItems]);

  // Filter items
  const filteredItems = useMemo(() => {
    let filtered = [...queueItems];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.part_name?.toLowerCase().includes(term) ||
        item.project_name?.toLowerCase().includes(term)
      );
    }

    if (projectFilter !== 'all') {
      filtered = filtered.filter(item => item.project_id === projectFilter);
    }

    return filtered;
  }, [queueItems, searchTerm, projectFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const handleItemClick = (item) => {
    navigate(createPageUrl('ProjectSupplyManager') + `?project_id=${item.project_id}&tab=${getTabForQueue(activeQueue)}`);
  };

  const getTabForQueue = (queue) => {
    switch (queue) {
      case 'need_funding': return 'fund';
      case 'ready_to_order': return 'buy';
      case 'on_order': return 'receive';
      case 'ready_to_receive': return 'receive';
      case 'unassigned_inventory': return 'install';
      case 'ready_to_install': return 'install';
      case 'installed_uncovered': return 'fund';
      case 'overdrawn_pools': return 'fund';
      default: return 'plan';
    }
  };

  const queueConfigs = {
    need_funding: {
      label: 'Need Funding',
      icon: Wallet,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-900/30',
    },
    ready_to_order: {
      label: 'Ready to Order',
      icon: ShoppingCart,
      color: 'text-green-400',
      bgColor: 'bg-green-900/30',
    },
    on_order: {
      label: 'On Order',
      icon: Truck,
      color: 'text-purple-400',
      bgColor: 'bg-purple-900/30',
    },
    ready_to_receive: {
      label: 'Ready to Receive',
      icon: Package,
      color: 'text-blue-400',
      bgColor: 'bg-blue-900/30',
    },
    unassigned_inventory: {
      label: 'Unassigned Inventory',
      icon: MapPin,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-900/30',
    },
    ready_to_install: {
      label: 'Ready to Install',
      icon: Wrench,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-900/30',
    },
    installed_uncovered: {
      label: 'Installed Uncovered',
      icon: AlertTriangle,
      color: 'text-red-400',
      bgColor: 'bg-red-900/30',
    },
    overdrawn_pools: {
      label: 'Overdrawn Pools',
      icon: AlertTriangle,
      color: 'text-orange-400',
      bgColor: 'bg-orange-900/30',
    },
  };

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
                <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                  <Layers className="w-6 h-6 text-purple-500" />
                  WORK QUEUES
                </h1>
                <p className="text-sm text-gray-400">Cross-project supply chain queues</p>
              </div>
            </div>
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              className="border-gray-700 text-white gap-2"
              disabled={isRefreshing || isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Queue Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(queueConfigs).slice(0, 4).map(([key, config]) => {
              const Icon = config.icon;
              const count = summary[key] || 0;
              return (
                <Card
                  key={key}
                  className={`bg-black/40 border-gray-800 cursor-pointer transition-colors ${activeQueue === key ? 'ring-2 ring-red-500' : 'hover:border-gray-600'}`}
                  onClick={() => setActiveQueue(key)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">{config.label}</p>
                        <p className={`text-2xl font-bold ${config.color}`}>{count}</p>
                      </div>
                      <Icon className={`w-6 h-6 ${config.color}`} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(queueConfigs).slice(4).map(([key, config]) => {
              const Icon = config.icon;
              const count = summary[key] || 0;
              return (
                <Card
                  key={key}
                  className={`bg-black/40 border-gray-800 cursor-pointer transition-colors ${activeQueue === key ? 'ring-2 ring-red-500' : 'hover:border-gray-600'}`}
                  onClick={() => setActiveQueue(key)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">{config.label}</p>
                        <p className={`text-2xl font-bold ${config.color}`}>{count}</p>
                      </div>
                      <Icon className={`w-6 h-6 ${config.color}`} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Queue Content */}
          <Card className="bg-black/40 border-gray-800">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  {(() => {
                    const config = queueConfigs[activeQueue];
                    const Icon = config?.icon || Package;
                    return (
                      <>
                        <Icon className={`w-5 h-5 ${config?.color || 'text-white'}`} />
                        <CardTitle className="text-white">{config?.label || 'Queue'}</CardTitle>
                        <Badge variant="outline" className="border-gray-600 text-gray-400">
                          {filteredItems.length} items
                        </Badge>
                      </>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <Input
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-gray-900/50 border-gray-700 text-white h-9"
                    />
                  </div>
                  <Select value={projectFilter} onValueChange={setProjectFilter}>
                    <SelectTrigger className="w-[180px] bg-gray-900/50 border-gray-700 text-white h-9">
                      <SelectValue placeholder="All Projects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {uniqueProjects.map(([id, name]) => (
                        <SelectItem key={id} value={id}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-gray-500">Loading queue data...</div>
              ) : filteredItems.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No items in this queue
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableHead className="text-gray-400">Part</TableHead>
                      <TableHead className="text-gray-400">Project</TableHead>
                      <TableHead className="text-gray-400">Vendor</TableHead>
                      <TableHead className="text-gray-400 text-center">Qty</TableHead>
                      <TableHead className="text-gray-400 text-right">Retail</TableHead>
                      <TableHead className="text-gray-400 text-center">Coverage</TableHead>
                      <TableHead className="text-gray-400 text-right">Exposure</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item, idx) => (
                      <TableRow
                        key={item.commitment_id || idx}
                        className="border-gray-800 hover:bg-gray-800/30 cursor-pointer"
                        onClick={() => handleItemClick(item)}
                      >
                        <TableCell>
                          <div>
                            <p className="text-white text-sm font-medium">{item.part_name || 'Unknown'}</p>
                            <p className="text-xs text-gray-500">{item.commitment_status}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-gray-300">{item.project_name || 'Unknown'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-gray-400">{item.vendor_name || '-'}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-white">{item.qty_committed || 0}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-white">${(item.planned_retail || 0).toFixed(0)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={
                            item.coverage_percent >= 100 ? 'text-green-400' :
                            item.coverage_percent >= 50 ? 'text-yellow-400' : 'text-red-400'
                          }>
                            {item.coverage_percent || 0}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={item.exposure_gap > 0 ? 'text-red-400' : 'text-green-400'}>
                            ${(item.exposure_gap || 0).toFixed(0)}
                          </span>
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