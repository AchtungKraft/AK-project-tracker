import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { 
  DollarSign, 
  Clock,
  ShoppingCart,
  Truck,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Search,
  RefreshCw,
  Loader2,
  FileText,
  Eye,
  X,
  FolderOpen,
  Users,
  ListChecks,
  Zap,
  Settings2,
  Archive,
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import LifecycleProgressStack from "@/components/lifecycle/LifecycleProgressStack";
import UniversalLifecycleBadge, { OrderingSafetyBadge } from "@/components/lifecycle/UniversalLifecycleBadge";
import LifecycleTimelineDrawer from "@/components/lifecycle/LifecycleTimelineDrawer";

// ============================================
// CONSTANTS
// ============================================

const ACTION_TAB_CONFIG = {
  invoice_client: {
    key: 'invoice_client',
    label: 'Invoice Client',
    shortLabel: 'Invoice',
    icon: DollarSign,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-600',
    allowSelection: true,
    selectionAction: 'invoice',
  },
  await_payment: {
    key: 'await_payment',
    label: 'Awaiting Payment',
    shortLabel: 'Payment',
    icon: Clock,
    color: 'text-orange-400',
    bgColor: 'bg-orange-600',
    allowSelection: false,
  },
  create_order: {
    key: 'create_order',
    label: 'Ready To Order',
    shortLabel: 'Order',
    icon: ShoppingCart,
    color: 'text-green-400',
    bgColor: 'bg-green-600',
    allowSelection: true,
    selectionAction: 'purchase',
  },
  track_delivery: {
    key: 'track_delivery',
    label: 'Orders In Progress',
    shortLabel: 'In Progress',
    icon: Truck,
    color: 'text-blue-400',
    bgColor: 'bg-blue-600',
    allowSelection: false,
  },
  schedule_install: {
    key: 'schedule_install',
    label: 'Ready To Install',
    shortLabel: 'Install',
    icon: Wrench,
    color: 'text-purple-400',
    bgColor: 'bg-purple-600',
    allowSelection: false,
  },
  fix_data: {
    key: 'fix_data',
    label: 'Fix Missing Data',
    shortLabel: 'Fix',
    icon: AlertTriangle,
    color: 'text-red-400',
    bgColor: 'bg-red-600',
    allowSelection: false,
  },
  complete: {
    key: 'complete',
    label: 'Complete',
    shortLabel: 'Done',
    icon: CheckCircle2,
    color: 'text-green-400',
    bgColor: 'bg-green-700',
    allowSelection: false,
  },
};

const BATCH_MODES = {
  MANUAL: { label: 'Single Batch', icon: ListChecks },
  BY_PROJECT: { label: 'By Project', icon: FolderOpen },
  BY_CLIENT: { label: 'By Client', icon: Users },
};

// ============================================
// KPI CARDS
// ============================================

function KPICard({ icon: Icon, label, count, value, color, onClick, isActive }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-3 rounded-lg border transition-all text-left w-full",
        isActive ? `${color}/30 border-current` : "bg-gray-800/50 border-gray-700 hover:bg-gray-800"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("w-4 h-4", color.replace('bg-', 'text-'))} />
        <span className="text-xs text-gray-400 uppercase truncate">{label}</span>
      </div>
      <p className={cn("text-xl font-bold", color.replace('bg-', 'text-'))}>{count}</p>
      {value !== undefined && (
        <p className="text-xs text-gray-500">${value.toFixed(0)}</p>
      )}
    </button>
  );
}

function KPIHeader({ kpis, activeTab, onTabClick }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
      <KPICard
        icon={DollarSign}
        label="Needs Billing"
        count={kpis.needs_billing_count || 0}
        value={kpis.needs_billing_value}
        color="bg-yellow-500"
        onClick={() => onTabClick('invoice_client')}
        isActive={activeTab === 'invoice_client'}
      />
      <KPICard
        icon={Clock}
        label="Awaiting Pay"
        count={kpis.awaiting_payment_count || 0}
        value={kpis.awaiting_payment_value}
        color="bg-orange-500"
        onClick={() => onTabClick('await_payment')}
        isActive={activeTab === 'await_payment'}
      />
      <KPICard
        icon={ShoppingCart}
        label="Ready to Order"
        count={kpis.ready_to_order_count || 0}
        value={kpis.ready_to_order_cost}
        color="bg-green-500"
        onClick={() => onTabClick('create_order')}
        isActive={activeTab === 'create_order'}
      />
      <KPICard
        icon={Truck}
        label="In Progress"
        count={kpis.orders_in_progress_count || 0}
        color="bg-blue-500"
        onClick={() => onTabClick('track_delivery')}
        isActive={activeTab === 'track_delivery'}
      />
      <KPICard
        icon={Wrench}
        label="Ready Install"
        count={kpis.ready_to_install_count || 0}
        color="bg-purple-500"
        onClick={() => onTabClick('schedule_install')}
        isActive={activeTab === 'schedule_install'}
      />
      <KPICard
        icon={AlertTriangle}
        label="Blocked"
        count={kpis.blocked_count || 0}
        color="bg-red-500"
        onClick={() => onTabClick('fix_data')}
        isActive={activeTab === 'fix_data'}
      />
    </div>
  );
}

// ============================================
// ACTION TABLE
// ============================================

function ActionTable({ items, tabConfig, selectedIds, onToggleSelection, onRowClick }) {
  const allowSelection = tabConfig.allowSelection;

  if (!items || items.length === 0) {
    return (
      <div className="p-8 text-center">
        <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
        <p className="text-green-400 font-medium">No items in this queue</p>
        <p className="text-xs text-gray-500 mt-1">All caught up!</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-gray-700 hover:bg-transparent">
          {allowSelection && (
            <TableHead className="w-10">
              <Checkbox 
                checked={items.length > 0 && items.every(i => selectedIds.has(i.id))}
                onCheckedChange={(checked) => {
                  items.forEach(i => onToggleSelection(i.id, checked));
                }}
              />
            </TableHead>
          )}
          <TableHead className="text-gray-400 text-xs">Project / Part</TableHead>
          <TableHead className="text-gray-400 text-xs text-center">Progress</TableHead>
          <TableHead className="text-gray-400 text-xs text-center">Safety</TableHead>
          <TableHead className="text-gray-400 text-xs text-right">Qty</TableHead>
          <TableHead className="text-gray-400 text-xs text-right">Value</TableHead>
          <TableHead className="text-gray-400 text-xs">Owner</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(item => (
          <TableRow 
            key={item.id}
            className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer"
            onClick={() => onRowClick(item)}
          >
            {allowSelection && (
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox 
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={(checked) => onToggleSelection(item.id, checked)}
                  disabled={item.unit_retail <= 0}
                />
              </TableCell>
            )}
            <TableCell>
              <div className="space-y-1">
                <Link 
                  to={`${createPageUrl('ProjectDetail')}?id=${item.project_id}`}
                  className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.project_name}
                </Link>
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm">{item.part_name}</span>
                  {item.part_type_missing && (
                    <Badge className="bg-amber-600/30 text-amber-400 text-xs">⚠</Badge>
                  )}
                </div>
                {item.part_number && (
                  <p className="text-xs text-gray-500">{item.part_number}</p>
                )}
              </div>
            </TableCell>
            <TableCell>
              <LifecycleProgressStack
                clientBillingStatus={item.client_billing_status}
                procurementStatus={item.procurement_status}
                installStatus={item.install_status}
                compact
              />
            </TableCell>
            <TableCell className="text-center">
              <OrderingSafetyBadge safety={item.ordering_safety} size="sm" />
            </TableCell>
            <TableCell className="text-right text-gray-300 text-sm">
              {item.assigned_qty}
            </TableCell>
            <TableCell className="text-right">
              {item.unit_retail > 0 ? (
                <span className="text-green-400 font-medium">${item.line_total?.toFixed(0)}</span>
              ) : (
                <Badge className="bg-red-600/30 text-red-400 text-xs">No Price</Badge>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="text-xs border-gray-600">
                {item.action_owner}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ============================================
// BATCH BUILDER PANEL
// ============================================

function BatchBuilderPanel({ selectedItems, batchMode, setBatchMode, onCreateBatch, onClearSelection, isCreating, actionType }) {
  const selectedCount = selectedItems.length;
  const totalAmount = selectedItems.reduce((sum, item) => sum + (item.line_total || 0), 0);
  
  if (selectedCount === 0) return null;

  const isInvoiceAction = actionType === 'invoice';

  return (
    <Card className={cn(
      "sticky bottom-4 border",
      isInvoiceAction ? "bg-gradient-to-r from-green-900/30 to-emerald-900/30 border-green-700/50" :
      "bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border-blue-700/50"
    )}>
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Badge className={cn("text-lg px-3 py-1", isInvoiceAction ? "bg-green-600" : "bg-blue-600")}>
                {selectedCount}
              </Badge>
              <span className="text-white font-medium">Items Selected</span>
              <span className={cn("font-bold text-lg", isInvoiceAction ? "text-green-400" : "text-blue-400")}>
                ${totalAmount.toFixed(2)}
              </span>
            </div>
            
            {isInvoiceAction && (
              <RadioGroup value={batchMode} onValueChange={setBatchMode} className="flex gap-4 mt-3">
                {Object.entries(BATCH_MODES).map(([mode, config]) => {
                  const Icon = config.icon;
                  return (
                    <div key={mode} className="flex items-center gap-2">
                      <RadioGroupItem value={mode} id={`batch-${mode}`} />
                      <Label htmlFor={`batch-${mode}`} className="flex items-center gap-1 text-gray-300 cursor-pointer">
                        <Icon className="w-4 h-4" />
                        {config.label}
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClearSelection} className="border-gray-600">
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
            <Button 
              onClick={onCreateBatch} 
              disabled={isCreating}
              className={cn(isInvoiceAction ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700")}
            >
              {isCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : (
                isInvoiceAction ? <FileText className="w-4 h-4 mr-2" /> : <ShoppingCart className="w-4 h-4 mr-2" />
              )}
              {isInvoiceAction ? 'Create Invoice Batch' : 'Create PO'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// MAIN PAGE
// ============================================

// ============================================
// COVERAGE DIAGNOSTICS DRAWER
// ============================================

function CoverageDiagnosticsDrawer({ isOpen, onClose }) {
  const { data: diagnostics, isLoading, refetch } = useQuery({
    queryKey: ['coverageDiagnostics'],
    queryFn: async () => {
      const response = await base44.functions.invoke('diagnoseActionWorkbenchCoverage', {
        options: { limit: 50 }
      });
      return response.data;
    },
    enabled: isOpen,
  });

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl bg-gray-900 border-gray-700">
        <SheetHeader>
          <SheetTitle className="text-white flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Coverage Diagnostics
          </SheetTitle>
        </SheetHeader>
        
        <div className="mt-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : diagnostics ? (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardContent className="p-3">
                    <p className="text-xs text-gray-400">Total Commitments</p>
                    <p className="text-xl font-bold text-white">{diagnostics.kpis?.total_commitments || 0}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardContent className="p-3">
                    <p className="text-xs text-gray-400">Eligible</p>
                    <p className="text-xl font-bold text-green-400">{diagnostics.kpis?.total_eligible || 0}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardContent className="p-3">
                    <p className="text-xs text-gray-400">Missing</p>
                    <p className="text-xl font-bold text-red-400">{diagnostics.kpis?.total_missing || 0}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardContent className="p-3">
                    <p className="text-xs text-gray-400">Coverage %</p>
                    <p className="text-xl font-bold text-blue-400">{diagnostics.kpis?.coverage_percentage || 0}%</p>
                  </CardContent>
                </Card>
              </div>

              {/* Reason Breakdown */}
              {diagnostics.reason_counts && Object.keys(diagnostics.reason_counts).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Exclusion Reasons</h4>
                  <div className="space-y-1">
                    {Object.entries(diagnostics.reason_counts).map(([reason, count]) => (
                      <div key={reason} className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
                        <span className="text-sm text-gray-300">{reason.replace(/_/g, ' ')}</span>
                        <Badge variant="outline" className="text-xs">{count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Breakdown */}
              {diagnostics.action_breakdown && Object.keys(diagnostics.action_breakdown).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Action Distribution</h4>
                  <div className="space-y-1">
                    {Object.entries(diagnostics.action_breakdown).map(([action, count]) => (
                      <div key={action} className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
                        <span className="text-sm text-gray-300">{action}</span>
                        <Badge className="bg-blue-600 text-xs">{count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Items Sample */}
              {diagnostics.missing_commitments?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Missing Items (Sample)</h4>
                  <ScrollArea className="h-48">
                    <div className="space-y-2">
                      {diagnostics.missing_commitments.map((item, idx) => (
                        <div key={idx} className="p-2 bg-gray-800/50 rounded text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-white font-medium">{item.part_name}</span>
                            <Badge className="bg-red-600/30 text-red-400">{item.reason?.replace(/_/g, ' ')}</Badge>
                          </div>
                          <p className="text-gray-500 mt-1">{item.project_name}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              <Button variant="outline" size="sm" onClick={() => refetch()} className="w-full border-gray-700">
                <RefreshCw className="w-4 h-4 mr-2" />
                Re-run Diagnostics
              </Button>
            </>
          ) : (
            <p className="text-gray-500 text-center py-8">No diagnostic data available</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================
// MAIN PAGE
// ============================================

export default function PartsActionWorkbench() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('invoice_client');
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchMode, setBatchMode] = useState('MANUAL');
  const [selectedItem, setSelectedItem] = useState(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  // Fetch action queue data
  const { data: queueData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['lifecycleActionQueue', projectFilter, showClosed, showArchived],
    queryFn: async () => {
      const filters = {
        include_closed: showClosed,
        include_archived: showArchived,
      };
      if (projectFilter !== 'all') filters.project_id = projectFilter;
      
      const response = await base44.functions.invoke('getLifecycleActionQueue', { filters });
      return response.data;
    },
    staleTime: 30000,
  });

  // Fetch projects for filter
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  // Create batch mutation
  const createBatchMutation = useMutation({
    mutationFn: async (items) => {
      const response = await base44.functions.invoke('createInvoiceBatch', {
        items,
        batch_mode: batchMode,
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Created ${data.batches_created} batch(es) with ${data.lines_created} lines`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['lifecycleActionQueue'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create batch');
    },
  });

  // Get action groups and current tab config
  const actionGroups = queueData?.action_groups || [];
  const currentGroup = actionGroups.find(g => g.key === activeTab);
  const currentTabConfig = ACTION_TAB_CONFIG[activeTab] || ACTION_TAB_CONFIG.invoice_client;

  // Filter items for current tab
  const currentItems = useMemo(() => {
    let items = currentGroup?.commitments || [];
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      items = items.filter(i => 
        i.part_name?.toLowerCase().includes(search) ||
        i.project_name?.toLowerCase().includes(search) ||
        i.part_number?.toLowerCase().includes(search)
      );
    }
    
    return items;
  }, [currentGroup, searchTerm]);

  const selectedItems = currentItems.filter(item => selectedIds.has(item.id));
  const kpis = queueData?.kpis || {};

  const toggleSelection = (id, checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedIds(new Set());
  };

  const handleRowClick = (item) => {
    setSelectedItem(item);
    setTimelineOpen(true);
  };

  const handleCreateBatch = () => {
    if (selectedItems.length === 0) return;
    createBatchMutation.mutate(selectedItems);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            Parts Action Workbench
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Unified workflow for billing, ordering, and installation
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggles */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-lg">
            <Switch
              id="show-closed"
              checked={showClosed}
              onCheckedChange={setShowClosed}
              className="scale-75"
            />
            <Label htmlFor="show-closed" className="text-xs text-gray-400 cursor-pointer">
              Closed
            </Label>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-lg">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
              className="scale-75"
            />
            <Label htmlFor="show-archived" className="text-xs text-gray-400 cursor-pointer">
              <Archive className="w-3 h-3 inline mr-1" />
              Archived
            </Label>
          </div>
          
          {/* Diagnostics Button */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setDiagnosticsOpen(true)}
            className="border-gray-700"
          >
            <Settings2 className="w-4 h-4" />
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()} 
            disabled={isFetching}
            className="border-gray-700"
          >
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* KPI Header */}
      <KPIHeader kpis={kpis} activeTab={activeTab} onTabClick={handleTabChange} />

      {/* Main Content */}
      <Card className="bg-black/40 border-gray-800">
        <CardHeader className="border-b border-gray-800 p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Search parts or projects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-900/50 border-gray-700 h-9"
                />
              </div>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-48 bg-gray-900/50 border-gray-700 h-9">
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
            
            <div className="text-sm text-gray-400">
              {kpis.total_commitments || 0} total commitments
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="w-full bg-gray-900/50 border-b border-gray-700 p-1 rounded-none justify-start overflow-x-auto">
              {Object.values(ACTION_TAB_CONFIG).filter(tab => {
                const group = actionGroups.find(g => g.key === tab.key);
                return group && group.count > 0;
              }).map(tab => {
                const group = actionGroups.find(g => g.key === tab.key);
                const Icon = tab.icon;
                return (
                  <TabsTrigger 
                    key={tab.key}
                    value={tab.key}
                    className={cn(
                      "data-[state=active]:bg-gray-800 gap-2 min-w-fit",
                      `data-[state=active]:${tab.color}`
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{tab.shortLabel}</span>
                    {group?.count > 0 && (
                      <Badge className={cn("text-xs", tab.bgColor)}>{group.count}</Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {isLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-gray-500" />
                <p className="text-gray-400">Loading action queue...</p>
              </div>
            ) : (
              Object.values(ACTION_TAB_CONFIG).map(tab => (
                <TabsContent key={tab.key} value={tab.key} className="m-0">
                  <ScrollArea className="h-[500px]">
                    <ActionTable 
                      items={currentItems}
                      tabConfig={tab}
                      selectedIds={selectedIds}
                      onToggleSelection={toggleSelection}
                      onRowClick={handleRowClick}
                    />
                  </ScrollArea>
                </TabsContent>
              ))
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Batch Builder Panel */}
      {currentTabConfig.allowSelection && (
        <BatchBuilderPanel
          selectedItems={selectedItems}
          batchMode={batchMode}
          setBatchMode={setBatchMode}
          onCreateBatch={handleCreateBatch}
          onClearSelection={() => setSelectedIds(new Set())}
          isCreating={createBatchMutation.isPending}
          actionType={currentTabConfig.selectionAction}
        />
      )}

      {/* Timeline Drawer */}
      <LifecycleTimelineDrawer
        isOpen={timelineOpen}
        onClose={() => setTimelineOpen(false)}
        commitmentId={selectedItem?.commitment_id}
        lifecycleState={selectedItem}
      />

      {/* Coverage Diagnostics Drawer */}
      <CoverageDiagnosticsDrawer
        isOpen={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
      />
    </div>
  );
}