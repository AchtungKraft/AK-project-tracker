/**
 * INVOICEBATCH IS REMOVED. Do not import or use InvoiceBatch* components or functions.
 * Use ProjectInvoice + CreateProjectInvoiceModal.
 */
import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  Zap,
  Settings2,
  Archive,
  Play,
  ChevronRight,
  Activity,
  FileWarning,
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import LifecycleProgressStack from "@/components/lifecycle/LifecycleProgressStack";
import UniversalLifecycleBadge, { OrderingSafetyBadge } from "@/components/lifecycle/UniversalLifecycleBadge";
import LifecycleTimelineDrawer from "@/components/lifecycle/LifecycleTimelineDrawer";
import CoverageDiagnosticsDrawer from "@/components/lifecycle/CoverageDiagnosticsDrawer";
import { useLifecycleAction, ACTION_TYPES, actionRequiresModal, getModalForAction } from "@/components/lifecycle/useLifecycleState";
import CreateProjectInvoiceModal from "@/components/financial/CreateProjectInvoiceModal";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

// DEV guardrail
if (process.env.NODE_ENV === "development") {
  window.__INVOICEBATCH_REMOVED__ = true;
}

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

// BATCH_MODES removed - single ProjectInvoice flow only

// ============================================
// COVERAGE HEALTH KPI
// ============================================

function CoverageHealthKPI({ onOpenDiagnostics }) {
  const { data: diagnostics, isLoading } = useQuery({
    queryKey: ['coverageDiagnostics'],
    queryFn: async () => {
      const response = await base44.functions.invoke('diagnoseActionWorkbenchCoverage', {
        options: { limit: 10 }
      });
      return response.data;
    },
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const coveragePct = diagnostics?.kpis?.coverage_percentage || 0;
  const totalCommitments = diagnostics?.kpis?.total_commitments || 0;
  const eligible = diagnostics?.kpis?.total_eligible || 0;
  const excluded = diagnostics?.kpis?.total_missing || 0;

  const coverageColor = coveragePct >= 100 ? 'text-green-400 bg-green-600/20' : 
                        coveragePct >= 95 ? 'text-yellow-400 bg-yellow-600/20' : 
                        'text-red-400 bg-red-600/20';
  const StatusIcon = coveragePct >= 95 ? CheckCircle2 : AlertTriangle;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onOpenDiagnostics}
            className={cn(
              "flex items-center gap-3 px-4 py-2 rounded-lg border transition-all",
              coverageColor.split(' ')[1],
              "border-gray-700 hover:border-gray-600"
            )}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            ) : (
              <>
                <StatusIcon className={cn("w-5 h-5", coverageColor.split(' ')[0])} />
                <div className="text-left">
                  <p className="text-xs text-gray-400">Coverage</p>
                  <p className={cn("text-lg font-bold", coverageColor.split(' ')[0])}>
                    {coveragePct}%
                  </p>
                </div>
                <div className="text-xs text-gray-500 border-l border-gray-700 pl-3 ml-2">
                  <p>{eligible} eligible</p>
                  <p>{excluded} excluded</p>
                </div>
              </>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="bg-gray-800 border-gray-700">
          <p className="text-xs">Click to open Coverage Diagnostics</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

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
// INLINE ACTION BUTTON
// ============================================

function InlineActionButton({ item, onExecute, isExecuting }) {
  const actionType = item.action_type;
  if (!actionType) return null;

  const actionConfig = {
    INVOICE_CLIENT: { icon: DollarSign, label: 'Invoice', color: 'bg-yellow-600 hover:bg-yellow-700' },
    RECORD_PAYMENT: { icon: CheckCircle2, label: 'Record Pay', color: 'bg-orange-600 hover:bg-orange-700' },
    CREATE_ORDER: { icon: ShoppingCart, label: 'Create PO', color: 'bg-green-600 hover:bg-green-700' },
    RECEIVE_PART: { icon: Truck, label: 'Receive', color: 'bg-blue-600 hover:bg-blue-700' },
    INSTALL_PART: { icon: Wrench, label: 'Install', color: 'bg-purple-600 hover:bg-purple-700' },
    FIX_DATA: { icon: AlertTriangle, label: 'Fix', color: 'bg-red-600 hover:bg-red-700' },
  };

  const config = actionConfig[actionType] || { icon: Play, label: 'Action', color: 'bg-gray-600' };
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            className={cn("h-7 px-2 gap-1", config.color)}
            onClick={(e) => {
              e.stopPropagation();
              onExecute(item, actionType);
            }}
            disabled={isExecuting}
          >
            {isExecuting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Icon className="w-3 h-3" />
            )}
            <span className="text-xs hidden sm:inline">{config.label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="bg-gray-800 border-gray-700">
          <p className="text-xs">{item.next_step_label || item.recommended_action}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================
// ACTION TABLE
// ============================================

function ActionTable({ items, tabConfig, selectedIds, onToggleSelection, onRowClick, onExecuteAction, executingIds }) {
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

  // CANONICAL: All selection and keying uses commitment_id exclusively
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-gray-700 hover:bg-transparent">
          {allowSelection && (
            <TableHead className="w-10">
              <Checkbox 
                checked={items.length > 0 && items.every(i => selectedIds.has(i.commitment_id))}
                onCheckedChange={(checked) => {
                  items.forEach(i => onToggleSelection(i.commitment_id, checked));
                }}
              />
            </TableHead>
          )}
          <TableHead className="text-gray-400 text-xs">Project / Part</TableHead>
          <TableHead className="text-gray-400 text-xs text-center">Progress</TableHead>
          <TableHead className="text-gray-400 text-xs text-center">Safety</TableHead>
          <TableHead className="text-gray-400 text-xs text-right">Qty</TableHead>
          <TableHead className="text-gray-400 text-xs text-right">Value</TableHead>
          <TableHead className="text-gray-400 text-xs">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(item => {
          // FAIL-FAST: Log error if canonical fields missing
          if (!item.commitment_id) {
            console.error('[CANONICAL VIOLATION] Missing commitment_id:', item);
          }
          
          return (
            <TableRow 
              key={item.commitment_id}
              className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer"
              onClick={() => onRowClick(item)}
            >
              {allowSelection && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox 
                    checked={selectedIds.has(item.commitment_id)}
                    onCheckedChange={(checked) => onToggleSelection(item.commitment_id, checked)}
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
                  {item.next_step_label && item.next_step_label !== 'Lifecycle Complete' && (
                    <p className="text-xs text-yellow-400 font-medium">→ {item.next_step_label}</p>
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
                {item.required_total || 0}
              </TableCell>
              <TableCell className="text-right">
                {item.unit_retail > 0 ? (
                  <span className="text-green-400 font-medium">${(item.line_total || 0).toFixed(0)}</span>
                ) : (
                  <Badge className="bg-red-600/30 text-red-400 text-xs">No Price</Badge>
                )}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <InlineActionButton 
                  item={item} 
                  onExecute={onExecuteAction}
                  isExecuting={executingIds?.has(item.commitment_id)}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ============================================
// INVOICE SELECTION PANEL (forward model - single ProjectInvoice flow)
// ============================================

function InvoiceSelectionPanel({ selectedItems, onCreateInvoice, onClearSelection, projectFilter }) {
  const selectedCount = selectedItems.length;
  const totalAmount = selectedItems.reduce((sum, item) => sum + (item.line_total || 0), 0);
  
  // Calculate ready vs blocked counts  
  const readyCount = selectedItems.filter(item => (item.unit_retail || 0) > 0).length;
  const blockedCount = selectedCount - readyCount;
  
  if (selectedCount === 0) return null;

  const canCreate = readyCount > 0 && projectFilter !== 'all';

  return (
    <Card className="sticky bottom-4 border bg-gradient-to-r from-green-900/30 to-emerald-900/30 border-green-700/50">
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Badge className="text-lg px-3 py-1 bg-green-600">
                {selectedCount}
              </Badge>
              <span className="text-white font-medium">Items Selected</span>
              <span className="font-bold text-lg text-green-400">
                ${totalAmount.toFixed(2)}
              </span>
              
              {/* Readiness indicator */}
              <div className="flex items-center gap-2 ml-2 text-sm">
                <span className="text-green-400">✓ Ready: {readyCount}</span>
                {blockedCount > 0 && (
                  <span className="text-red-400">✗ Blocked: {blockedCount}</span>
                )}
              </div>
            </div>
            
            {projectFilter === 'all' && (
              <p className="text-xs text-amber-400 mt-1">
                Select a specific project to create an invoice
              </p>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClearSelection} className="border-gray-600">
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
            <Button 
              onClick={onCreateInvoice} 
              disabled={!canCreate}
              className={cn(
                "bg-green-600 hover:bg-green-700",
                !canCreate && "opacity-50 cursor-not-allowed"
              )}
            >
              <FileText className="w-4 h-4 mr-2" />
              Create Invoice ({readyCount})
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

export default function PartsActionWorkbench() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('invoice_client');
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedItem, setSelectedItem] = useState(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showNonBillable, setShowNonBillable] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [executingIds, setExecutingIds] = useState(new Set());
  // Forward model: single ProjectInvoice flow via CreateProjectInvoiceModal
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);

  // Lifecycle action hook
  const { executeActionAsync, isExecuting } = useLifecycleAction();

  // Fetch action queue data
  const { data: queueData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['lifecycleActionQueue', projectFilter, showClosed, showArchived, showNonBillable],
    queryFn: async () => {
      const filters = {
        include_closed: showClosed,
        include_archived: showArchived,
        include_non_billable: showNonBillable,
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
  
  // CANONICAL: Fetch billingProcurementStates for invoiceable parts when project is selected
  const { data: billingData } = useQuery({
    queryKey: ['billingProcurementStates', projectFilter],
    queryFn: async () => {
      if (projectFilter === 'all') return null;
      const response = await base44.functions.invoke('getBillingAndProcurementStates', {
        filters: { project_id: projectFilter }
      });
      return response.data;
    },
    enabled: projectFilter !== 'all',
    staleTime: 0,
  });

  // Get action groups and current tab config
  const actionGroups = queueData?.action_groups || [];
  const currentGroup = actionGroups.find(g => g.key === activeTab);
  const currentTabConfig = ACTION_TAB_CONFIG[activeTab] || ACTION_TAB_CONFIG.invoice_client;

  // DEV ONLY: Runtime schema validation
  if (process.env.NODE_ENV === 'development' && currentGroup?.commitments?.length > 0) {
    const sample = currentGroup.commitments[0];
    console.log('[DEV] PartsActionWorkbench - Sample commitment shape:', sample);
    
    // FAIL-FAST: Check canonical fields
    const required = ['commitment_id', 'required_total', 'unit_retail', 'line_total'];
    const missing = required.filter(f => sample[f] === undefined);
    if (missing.length > 0) {
      console.error('[CANONICAL VIOLATION] Missing required fields in action queue:', missing);
    }
  }

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

  // CANONICAL: selectedItems filtered by commitment_id
  const selectedItems = currentItems.filter(item => selectedIds.has(item.commitment_id));
  const kpis = queueData?.kpis || {};

  // CANONICAL: Toggle selection using commitment_id only
  const toggleSelection = (commitmentId, checked) => {
    if (!commitmentId) {
      console.error('[CANONICAL VIOLATION] toggleSelection called with undefined commitmentId');
      return;
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(commitmentId);
      else next.delete(commitmentId);
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

  // Forward model: Open CreateProjectInvoiceModal with selected items
  const handleOpenCreateInvoice = () => {
    if (selectedItems.length === 0) {
      toast.error('No items selected', {
        description: 'Please select at least one item to create an invoice.',
      });
      return;
    }
    
    if (projectFilter === 'all') {
      toast.error('Project required', {
        description: 'Please select a specific project to create an invoice.',
      });
      return;
    }
    
    // Log event
    base44.analytics.track({
      eventName: 'invoice_modal_opened',
      properties: { items_count: selectedItems.length, project_id: projectFilter }
    });
    
    setShowCreateInvoiceModal(true);
  };
  
  // Map selected items to modal format using billingProcurementStates data
  const initialSelectedItems = useMemo(() => {
    if (!billingData?.commitments) return [];
    
    // Filter billingData commitments to match selected IDs
    return billingData.commitments
      .filter(c => selectedIds.has(c.commitment_id))
      .map(c => ({
        part_commitment_id: c.commitment_id,
        commitment_id: c.commitment_id,
        part_name: c.part_name,
        qty: c.qty_remaining_to_bill || c.required_total || 0,
        unit_price: c.unit_retail_snapshot || c.unit_retail || 0,
        gross_exposure: c.gross_exposure || 0,
        credit_applied: c.credit_applied || 0,
        net_exposure: c.net_exposure || 0,
        vendor_id: c.vendor_id,
        vendor_name: c.vendor_name,
        category_id: c.category_id,
        category_name: c.category_name,
        project_id: c.project_id,
        part_id: c.part_id,
      }));
  }, [billingData, selectedIds]);
  
  const handleInvoiceSuccess = async () => {
    // CANONICAL: Use forceAppRefresh for deterministic refresh
    await forceAppRefresh(queryClient, { projectIds: [projectFilter] });
    setShowCreateInvoiceModal(false);
    setSelectedIds(new Set());
    toast.success('Invoice created successfully');
  };
  
  const handleExecuteAction = async (item, actionType) => {
    const commitmentId = item.commitment_id;
    
    // Check if action requires a modal
    if (actionRequiresModal(actionType)) {
      // Open timeline drawer for now - modals can be wired later
      setSelectedItem(item);
      setTimelineOpen(true);
      toast.info(`${item.next_step_label || 'Action'} - Use the appropriate modal to complete`);
      return;
    }

    // Direct execution for non-modal actions
    setExecutingIds(prev => new Set(prev).add(commitmentId));
    
    try {
      const result = await executeActionAsync({
        commitmentId,
        actionType,
        actionData: {},
      });
      
      if (result.success) {
        toast.success(result.message || 'Action completed');
        refetch();
      } else {
        toast.error(result.error || 'Action failed');
      }
    } catch (error) {
      toast.error(error.message || 'Action execution failed');
    } finally {
      setExecutingIds(prev => {
        const next = new Set(prev);
        next.delete(commitmentId);
        return next;
      });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Page Header with Coverage Health */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Zap className="w-6 h-6 text-yellow-400" />
                Parts Action Workbench
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Single operational command center
              </p>
            </div>
            
            {/* Coverage Health KPI */}
            <CoverageHealthKPI onOpenDiagnostics={() => setDiagnosticsOpen(true)} />
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()} 
            disabled={isFetching}
            className="border-gray-700"
          >
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2 hidden sm:inline">Refresh</span>
          </Button>
        </div>
        
        {/* Filter Toggles Row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 uppercase">Filters:</span>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-lg">
            <Switch
              id="show-closed"
              checked={showClosed}
              onCheckedChange={setShowClosed}
              className="scale-75"
            />
            <Label htmlFor="show-closed" className="text-xs text-gray-400 cursor-pointer">
              <CheckCircle2 className="w-3 h-3 inline mr-1" />
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
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-lg">
            <Switch
              id="show-non-billable"
              checked={showNonBillable}
              onCheckedChange={setShowNonBillable}
              className="scale-75"
            />
            <Label htmlFor="show-non-billable" className="text-xs text-gray-400 cursor-pointer">
              <DollarSign className="w-3 h-3 inline mr-1" />
              Non-Billable
            </Label>
          </div>
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
                      onExecuteAction={handleExecuteAction}
                      executingIds={executingIds}
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

      {/* Invoice Batch Preview Modal */}
      <InvoiceBatchPreviewModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        selectedItems={selectedItems}
        blockedItems={selectedItems.filter(item => (item.unit_retail || 0) <= 0).map(item => ({
          commitment_id: item.commitment_id,
          part_name: item.part_name,
          project_name: item.project_name,
          reasons: ['Missing retail pricing'],
          lifecycle_stage: item.lifecycle_overall_stage,
        }))}
        batchMode={batchMode}
        onConfirm={handleConfirmBatch}
        onFixItem={handleFixItem}
        isCreating={createBatchMutation.isPending}
      />

      {/* Invoice Batch Success Drawer */}
      <InvoiceBatchSuccessDrawer
        isOpen={successDrawerOpen}
        onClose={() => setSuccessDrawerOpen(false)}
        batchData={lastBatchResult}
        onExportToQB={handleExportToQB}
        onViewBatch={handleViewBatch}
        onReturnToWorkbench={() => setSuccessDrawerOpen(false)}
      />
    </div>
  );
}