import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  ShoppingCart, Package, Truck, CheckCircle2, AlertTriangle,
  ArrowLeft, ArrowRight, RefreshCw, Search, Wallet, Wrench, AlertCircle,
  Clock, MapPin, FolderKanban, Loader2
} from "lucide-react";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";

/**
 * SupplyQueues - Global Work Queues
 * 
 * CANONICAL: Uses getGlobalSupplyQueues backend read model
 * UI renders precomputed queue buckets only - NO lifecycle math here
 */
export default function SupplyQueues() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const initialQueue = urlParams.get('queue') || 'need_funding';

  const [activeQueue, setActiveQueue] = useState(initialQueue);
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');

  // Canonical data source - backend read model
  const { data: queueData, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['globalSupplyQueues'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getGlobalSupplyQueues', {});
      return response.data;
    },
    staleTime: 30000,
  });

  // Reference data for filters
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  const queues = queueData?.queues || {};
  const summary = queueData?.summary || {};

  // Queue config (icons, colors)
  const queueConfig = {
    need_funding: { icon: Wallet, color: 'red', label: 'Need Funding' },
    ready_to_order: { icon: ShoppingCart, color: 'green', label: 'Ready to Order' },
    on_order: { icon: Truck, color: 'purple', label: 'On Order' },
    ready_to_receive: { icon: Package, color: 'blue', label: 'Ready to Receive' },
    unassigned_inventory: { icon: MapPin, color: 'cyan', label: 'Needs Location', isInventory: true },
    ready_to_install: { icon: Wrench, color: 'emerald', label: 'Ready to Install' },
    installed_uncovered: { icon: AlertTriangle, color: 'orange', label: 'Uncovered Installs' },
    overdrawn_pools: { icon: AlertCircle, color: 'red', label: 'Overdrawn Pools', isPool: true },
  };

  const currentQueueKey = activeQueue;
  const currentQueue = queues[currentQueueKey];
  const currentConfig = queueConfig[currentQueueKey];

  // Apply local filters (search/project only - no lifecycle recalculation)
  const filteredItems = useMemo(() => {
    let items = currentQueue?.items || [];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      items = items.filter(item => {
        if (currentConfig?.isPool) {
          return item.pool_name?.toLowerCase().includes(term) ||
                 item.project_name?.toLowerCase().includes(term);
        }
        if (currentConfig?.isInventory) {
          return item.part_name?.toLowerCase().includes(term);
        }
        return item.part_name?.toLowerCase().includes(term) ||
               item.project_name?.toLowerCase().includes(term);
      });
    }

    if (projectFilter !== 'all') {
      items = items.filter(item => item.project_id === projectFilter);
    }

    return items;
  }, [currentQueue, currentConfig, searchTerm, projectFilter]);

  const handleQueueChange = (queue) => {
    setActiveQueue(queue);
    const url = new URL(window.location.href);
    url.searchParams.set('queue', queue);
    window.history.replaceState({}, '', url.toString());
  };

  const renderCommitmentRow = (item) => {
    return (
      <TableRow key={item.commitment_id} className="hover:bg-gray-800/30">
        <TableCell>
          <div 
            className="text-white text-sm font-medium cursor-pointer hover:text-red-400"
            onClick={() => navigate(createPageUrl(`ProjectSupplyManager?project_id=${item.project_id}`))}
          >
            {item.project_name}
          </div>
        </TableCell>
        <TableCell>
          <div>
            <p className="text-white text-sm">{item.part_name}</p>
            <p className="text-xs text-gray-500">{item.vendor_name}</p>
          </div>
        </TableCell>
        <TableCell className="text-center">
          <span className="text-white">{item.qty_committed}</span>
        </TableCell>
        <TableCell className="text-center">
          <span className="text-purple-400">{item.qty_ordered}</span>
        </TableCell>
        <TableCell className="text-center">
          <span className="text-blue-400">{item.qty_received}</span>
        </TableCell>
        <TableCell className="text-center">
          <span className="text-green-400">{item.qty_installed}</span>
        </TableCell>
        <TableCell className="text-right">
          <span className={item.exposure_gap > 0 ? 'text-red-400' : 'text-green-400'}>
            ${item.exposure_gap.toFixed(0)}
          </span>
        </TableCell>
        <TableCell className="text-right">
          <span className={item.pool_balance >= 0 ? 'text-green-400' : 'text-red-400'}>
            ${item.pool_balance.toFixed(0)}
          </span>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            {item.is_funding_blocked && (
              <Badge variant="outline" className="border-red-600 text-red-400 text-xs">Blocked</Badge>
            )}
            {item.is_prepay_blocked && (
              <Badge variant="outline" className="border-orange-600 text-orange-400 text-xs">Prepay</Badge>
            )}
            {item.is_orderable && (
              <Badge variant="outline" className="border-green-600 text-green-400 text-xs">Ready</Badge>
            )}
          </div>
        </TableCell>
        <TableCell>
          <Button
            size="sm"
            variant="outline"
            className="border-gray-700 text-gray-300 h-7"
            onClick={() => navigate(createPageUrl(`ProjectSupplyManager?project_id=${item.project_id}`))}
          >
            <ArrowRight className="w-3 h-3" />
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  const renderPoolRow = (pool) => {
    return (
      <TableRow key={pool.pool_id} className="hover:bg-gray-800/30">
        <TableCell>
          <div 
            className="text-white text-sm font-medium cursor-pointer hover:text-red-400"
            onClick={() => navigate(createPageUrl(`ProjectSupplyManager?project_id=${pool.project_id}&tab=fund`))}
          >
            {pool.project_name}
          </div>
        </TableCell>
        <TableCell>
          <span className="text-white">{pool.pool_name}</span>
        </TableCell>
        <TableCell className="text-right">
          <span className="text-red-400 font-bold">${pool.balance.toFixed(0)}</span>
        </TableCell>
        <TableCell className="text-right">
          <span className="text-yellow-400">${pool.deficit.toFixed(0)}</span>
        </TableCell>
        <TableCell>
          <Button
            size="sm"
            variant="outline"
            className="border-gray-700 text-gray-300 h-7"
            onClick={() => navigate(createPageUrl(`ProjectSupplyManager?project_id=${pool.project_id}&tab=fund`))}
          >
            <ArrowRight className="w-3 h-3" />
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  const renderInventoryRow = (item) => {
    return (
      <TableRow key={item.inventory_id} className="hover:bg-gray-800/30">
        <TableCell>
          <span className="text-white">{item.part_name}</span>
        </TableCell>
        <TableCell className="text-center">
          <span className="text-cyan-400 font-bold">{item.quantity}</span>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="border-cyan-600 text-cyan-400 text-xs">
            No Location
          </Badge>
        </TableCell>
      </TableRow>
    );
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
                <h1 className="text-2xl md:text-3xl font-bold text-white">
                  WORK QUEUES
                </h1>
                <p className="text-sm text-gray-400">Operational supply chain queues</p>
              </div>
            </div>
            <Button
              onClick={() => refetch()}
              variant="outline"
              size="sm"
              className="border-gray-700 text-white gap-2"
              disabled={isLoading || isRefetching}
            >
              <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Queue Summary Cards - render precomputed counts */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-red-500" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(queueConfig).map(([key, config]) => {
                  const Icon = config.icon;
                  const isActive = activeQueue === key;
                  const count = summary[key] || 0;
                  
                  return (
                    <Card 
                      key={key}
                      className={`bg-black/40 cursor-pointer transition-all ${
                        isActive ? `border-${config.color}-600 ring-1 ring-${config.color}-600/50` : 'border-gray-800 hover:border-gray-700'
                      }`}
                      onClick={() => handleQueueChange(key)}
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-${config.color}-900/30`}>
                          <Icon className={`w-5 h-5 text-${config.color}-400`} />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">{config.label}</p>
                          <p className={`text-xl font-bold text-${config.color}-400`}>
                            {count}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Filters */}
              <Card className="bg-black/40 border-gray-800">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px] max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <Input
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 bg-gray-900/50 border-gray-700 text-white"
                      />
                    </div>

                    <Select value={projectFilter} onValueChange={setProjectFilter}>
                      <SelectTrigger className="w-48 bg-gray-900/50 border-gray-700 text-white">
                        <FolderKanban className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="All Projects" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Projects</SelectItem>
                        {projects.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Queue Table */}
              <Card className="bg-black/40 border-gray-800">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-white flex items-center gap-2">
                    {currentConfig && (
                      <>
                        <currentConfig.icon className={`w-5 h-5 text-${currentConfig.color}-400`} />
                        {currentConfig.label}
                        <Badge className="ml-2 bg-gray-700">{filteredItems.length}</Badge>
                      </>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {currentConfig?.isPool ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-800 hover:bg-transparent">
                          <TableHead className="text-gray-400">Project</TableHead>
                          <TableHead className="text-gray-400">Pool</TableHead>
                          <TableHead className="text-gray-400 text-right">Balance</TableHead>
                          <TableHead className="text-gray-400 text-right">Deficit</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
                              No items in this queue
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredItems.map(pool => renderPoolRow(pool))
                        )}
                      </TableBody>
                    </Table>
                  ) : currentConfig?.isInventory ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-800 hover:bg-transparent">
                          <TableHead className="text-gray-400">Part</TableHead>
                          <TableHead className="text-gray-400 text-center">Quantity</TableHead>
                          <TableHead className="text-gray-400">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-8 text-gray-500">
                              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
                              No items in this queue
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredItems.map(item => renderInventoryRow(item))
                        )}
                      </TableBody>
                    </Table>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-800 hover:bg-transparent">
                          <TableHead className="text-gray-400">Project</TableHead>
                          <TableHead className="text-gray-400">Part</TableHead>
                          <TableHead className="text-gray-400 text-center">Qty</TableHead>
                          <TableHead className="text-gray-400 text-center">Ordered</TableHead>
                          <TableHead className="text-gray-400 text-center">Received</TableHead>
                          <TableHead className="text-gray-400 text-center">Installed</TableHead>
                          <TableHead className="text-gray-400 text-right">Exposure</TableHead>
                          <TableHead className="text-gray-400 text-right">Pool</TableHead>
                          <TableHead className="text-gray-400">Status</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
                              No items in this queue
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredItems.map(item => renderCommitmentRow(item))
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </MobileSafeAreaContainer>
  );
}