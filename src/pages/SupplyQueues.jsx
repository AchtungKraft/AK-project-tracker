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
  ShoppingCart, Package, Truck, CheckCircle2, AlertTriangle, DollarSign,
  ArrowLeft, ArrowRight, RefreshCw, Search, Wallet, Wrench, AlertCircle,
  Clock, MapPin, FolderKanban
} from "lucide-react";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import { getAllowedCommitmentActions } from "@/components/lifecycle/getAllowedCommitmentActions";

/**
 * SupplyQueues - Global Work Queues (Screen 3)
 * Route: /supply/queues
 * 
 * Operational queues:
 * - Need Funding (blocked by prepay/coverage)
 * - Ready to Order
 * - On Order
 * - Ready to Receive
 * - Unassigned Location
 * - Ready to Install
 * - Installed but Uncovered
 * - Overdrawn Pools
 */
export default function SupplyQueues() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const initialQueue = urlParams.get('queue') || 'need_funding';

  const [activeQueue, setActiveQueue] = useState(initialQueue);
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Data Fetching
  const { data: commitments = [] } = useQuery({
    queryKey: ['partCommitments'],
    queryFn: () => base44.entities.PartCommitment.list()
  });

  const { data: pools = [] } = useQuery({
    queryKey: ['billingPools'],
    queryFn: () => base44.entities.BillingPool.list()
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  const { data: installedParts = [] } = useQuery({
    queryKey: ['installedParts'],
    queryFn: () => base44.entities.InstalledPart.list()
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list()
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list()
  });

  // Enrich commitments
  const enrichedCommitments = useMemo(() => {
    return commitments.filter(c => c.commitment_status !== 'cancelled').map(c => {
      const part = parts.find(p => p.id === c.part_id);
      const project = projects.find(p => p.id === c.project_id);
      const projectPools = pools.filter(p => p.project_id === c.project_id);
      const poolBalance = projectPools.reduce((sum, p) => sum + (p.balance || 0), 0);
      const allowed = getAllowedCommitmentActions(c);

      return { ...c, part, project, poolBalance, allowed };
    });
  }, [commitments, parts, projects, pools]);

  // Queue definitions
  const queues = useMemo(() => {
    const needFunding = enrichedCommitments.filter(c => {
      const needsCoverage = (c.exposure_gap || 0) > 0 && c.poolBalance < (c.exposure_gap || 0);
      const needsPrepay = c.requires_prepay && !c.prepay_satisfied_at;
      return c.commitment_status === 'planned' && (needsCoverage || needsPrepay);
    });

    const readyToOrder = enrichedCommitments.filter(c => {
      if (c.commitment_status !== 'planned') return false;
      const needsCoverage = (c.exposure_gap || 0) > 0 && c.poolBalance < (c.exposure_gap || 0);
      const needsPrepay = c.requires_prepay && !c.prepay_satisfied_at;
      return !needsCoverage && !needsPrepay;
    });

    const onOrder = enrichedCommitments.filter(c => 
      ['ordered', 'partially_received'].includes(c.commitment_status)
    );

    const readyToReceive = enrichedCommitments.filter(c => {
      const unreceived = (c.qty_ordered || 0) - (c.qty_received || 0);
      return c.commitment_status === 'ordered' && unreceived > 0;
    });

    const unassignedLocation = enrichedCommitments.filter(c => {
      // Received but not allocated (no location assigned)
      return c.commitment_status === 'received' && 
             (c.qty_received || 0) > (c.qty_allocated || 0);
    });

    const readyToInstall = enrichedCommitments.filter(c => {
      const installable = (c.qty_allocated || 0) - (c.qty_installed || 0);
      return ['received', 'allocated'].includes(c.commitment_status) && installable > 0;
    });

    const installedUncovered = enrichedCommitments.filter(c => 
      c.commitment_status === 'installed' && (c.exposure_gap || 0) > 0
    );

    const overdrawnPools = pools.filter(p => 
      p.status === 'overdrawn' || (p.balance || 0) < 0
    ).map(pool => {
      const project = projects.find(p => p.id === pool.project_id);
      return { ...pool, project };
    });

    return {
      need_funding: { items: needFunding, label: 'Need Funding', icon: Wallet, color: 'red' },
      ready_order: { items: readyToOrder, label: 'Ready to Order', icon: ShoppingCart, color: 'green' },
      on_order: { items: onOrder, label: 'On Order', icon: Truck, color: 'purple' },
      ready_receive: { items: readyToReceive, label: 'Ready to Receive', icon: Package, color: 'blue' },
      unassigned_location: { items: unassignedLocation, label: 'Needs Location', icon: MapPin, color: 'cyan' },
      ready_install: { items: readyToInstall, label: 'Ready to Install', icon: Wrench, color: 'emerald' },
      installed_uncovered: { items: installedUncovered, label: 'Uncovered Installs', icon: AlertTriangle, color: 'orange' },
      overdrawn_pools: { items: overdrawnPools, label: 'Overdrawn Pools', icon: AlertCircle, color: 'red', isPool: true },
    };
  }, [enrichedCommitments, pools, projects]);

  const currentQueue = queues[activeQueue];

  // Apply filters
  const filteredItems = useMemo(() => {
    let items = currentQueue?.items || [];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      items = items.filter(item => {
        if (currentQueue?.isPool) {
          return item.pool_name?.toLowerCase().includes(term) ||
                 item.project?.name?.toLowerCase().includes(term);
        }
        return item.part?.part_name?.toLowerCase().includes(term) ||
               item.project?.name?.toLowerCase().includes(term);
      });
    }

    if (projectFilter !== 'all') {
      items = items.filter(item => item.project?.id === projectFilter);
    }

    return items;
  }, [currentQueue, searchTerm, projectFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setIsRefreshing(false);
  };

  const handleQueueChange = (queue) => {
    setActiveQueue(queue);
    const url = new URL(window.location.href);
    url.searchParams.set('queue', queue);
    window.history.replaceState({}, '', url.toString());
  };

  const renderCommitmentRow = (commitment) => {
    const { part, project, allowed } = commitment;

    return (
      <TableRow key={commitment.id} className="hover:bg-gray-800/30">
        <TableCell>
          <div 
            className="text-white text-sm font-medium cursor-pointer hover:text-red-400"
            onClick={() => navigate(createPageUrl(`ProjectSupplyManager?project_id=${project?.id}`))}
          >
            {project?.name || 'Unknown'}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            {part?.featured_photo && (
              <div className="w-8 h-8 bg-gray-800 rounded overflow-hidden flex-shrink-0">
                <img src={part.featured_photo} alt="" className="w-full h-full object-contain" />
              </div>
            )}
            <div>
              <p className="text-white text-sm">{part?.part_name || 'Unknown'}</p>
              <p className="text-xs text-gray-500">{part?.vendor_part_number}</p>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-center">
          <span className="text-white">{commitment.qty_committed || 0}</span>
        </TableCell>
        <TableCell className="text-center">
          <span className="text-purple-400">{commitment.qty_ordered || 0}</span>
        </TableCell>
        <TableCell className="text-center">
          <span className="text-blue-400">{commitment.qty_received || 0}</span>
        </TableCell>
        <TableCell className="text-center">
          <span className="text-green-400">{commitment.qty_installed || 0}</span>
        </TableCell>
        <TableCell className="text-right">
          <span className={commitment.exposure_gap > 0 ? 'text-red-400' : 'text-green-400'}>
            ${(commitment.exposure_gap || 0).toFixed(0)}
          </span>
        </TableCell>
        <TableCell className="text-right">
          <span className={commitment.poolBalance >= 0 ? 'text-green-400' : 'text-red-400'}>
            ${(commitment.poolBalance || 0).toFixed(0)}
          </span>
        </TableCell>
        <TableCell>
          <Button
            size="sm"
            variant="outline"
            className="border-gray-700 text-gray-300 h-7"
            onClick={() => navigate(createPageUrl(`ProjectSupplyManager?project_id=${project?.id}`))}
          >
            <ArrowRight className="w-3 h-3" />
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  const renderPoolRow = (pool) => {
    return (
      <TableRow key={pool.id} className="hover:bg-gray-800/30">
        <TableCell>
          <div 
            className="text-white text-sm font-medium cursor-pointer hover:text-red-400"
            onClick={() => navigate(createPageUrl(`ProjectSupplyManager?project_id=${pool.project?.id}&tab=fund`))}
          >
            {pool.project?.name || 'Unknown'}
          </div>
        </TableCell>
        <TableCell>
          <span className="text-white">{pool.pool_name}</span>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="border-red-600 text-red-400">
            {pool.status}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <span className="text-white">${(pool.invoiced_amount || 0).toFixed(0)}</span>
        </TableCell>
        <TableCell className="text-right">
          <span className="text-green-400">${(pool.paid_amount || 0).toFixed(0)}</span>
        </TableCell>
        <TableCell className="text-right">
          <span className="text-blue-400">${(pool.allocated_total || 0).toFixed(0)}</span>
        </TableCell>
        <TableCell className="text-right">
          <span className="text-red-400 font-bold">${(pool.balance || 0).toFixed(0)}</span>
        </TableCell>
        <TableCell>
          <Button
            size="sm"
            variant="outline"
            className="border-gray-700 text-gray-300 h-7"
            onClick={() => navigate(createPageUrl(`ProjectSupplyManager?project_id=${pool.project?.id}&tab=fund`))}
          >
            <ArrowRight className="w-3 h-3" />
          </Button>
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
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              className="border-gray-700 text-white gap-2"
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Queue Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(queues).map(([key, queue]) => {
              const Icon = queue.icon;
              const isActive = activeQueue === key;
              return (
                <Card 
                  key={key}
                  className={`bg-black/40 cursor-pointer transition-all ${
                    isActive ? `border-${queue.color}-600` : 'border-gray-800 hover:border-gray-700'
                  }`}
                  onClick={() => handleQueueChange(key)}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-${queue.color}-900/30`}>
                      <Icon className={`w-5 h-5 text-${queue.color}-400`} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{queue.label}</p>
                      <p className={`text-xl font-bold text-${queue.color}-400`}>
                        {queue.items.length}
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
                {currentQueue && (
                  <>
                    <currentQueue.icon className={`w-5 h-5 text-${currentQueue.color}-400`} />
                    {currentQueue.label}
                    <Badge className="ml-2 bg-gray-700">{filteredItems.length}</Badge>
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {currentQueue?.isPool ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableHead className="text-gray-400">Project</TableHead>
                      <TableHead className="text-gray-400">Pool</TableHead>
                      <TableHead className="text-gray-400">Status</TableHead>
                      <TableHead className="text-gray-400 text-right">Invoiced</TableHead>
                      <TableHead className="text-gray-400 text-right">Paid</TableHead>
                      <TableHead className="text-gray-400 text-right">Allocated</TableHead>
                      <TableHead className="text-gray-400 text-right">Balance</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                          No items in this queue
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredItems.map(pool => renderPoolRow(pool))
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
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
                          No items in this queue
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredItems.map(commitment => renderCommitmentRow(commitment))
                    )}
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