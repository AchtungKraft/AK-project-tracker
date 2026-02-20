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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DollarSign, 
  Package,
  CheckCircle2,
  Search,
  RefreshCw,
  Loader2,
  FileText,
  Upload,
  X,
  AlertTriangle,
  Clock,
  Truck,
  ShoppingCart,
  CircleDollarSign,
  AlertCircle,
  FolderOpen,
  Users,
  ListChecks,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ============================================
// CONSTANTS
// ============================================

/**
 * LIFECYCLE_TABS - Workflow stages for invoicing
 * 
 * FORWARD MODEL:
 * - Invoice status derived from: Uninvoiced / Invoiced / Paid (InvoiceBatch linkage)
 * - Does NOT use: billing_status, exposure_gap, covered_retail_total, ordering_safety
 * 
 * LEGACY MODEL:
 * - Uses ORDERING_SAFETY_CONFIG (RED/YELLOW/GREEN) for pool-based billing safety
 * - Uses client_billing_status badge
 */
const LIFECYCLE_TABS = {
  ASSIGNED_NEEDS_BILLING: {
    key: 'assigned_needs_billing',
    label: 'Needs Billing',
    shortLabel: 'Billing',
    icon: DollarSign,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-600',
    allowSelection: true,
    selectionAction: 'invoice',
  },
  BILLED_NOT_PAID: {
    key: 'billed_not_paid',
    label: 'Awaiting Payment',
    shortLabel: 'Payment',
    icon: Clock,
    color: 'text-orange-400',
    bgColor: 'bg-orange-600',
    allowSelection: false,
  },
  PAID_READY_TO_ORDER: {
    key: 'paid_ready_to_order',
    label: 'Ready To Order',
    shortLabel: 'Order',
    icon: ShoppingCart,
    color: 'text-green-400',
    bgColor: 'bg-green-600',
    allowSelection: true,
    selectionAction: 'purchase',
  },
  ORDERED_WAITING_RECEIPT: {
    key: 'ordered_waiting_receipt',
    label: 'Orders In Progress',
    shortLabel: 'In Progress',
    icon: Truck,
    color: 'text-blue-400',
    bgColor: 'bg-blue-600',
    allowSelection: false,
  },
  INSTALLED_READY_TO_BILL: {
    key: 'installed_ready_to_bill',
    label: 'Installed Billing',
    shortLabel: 'Installed',
    icon: Wrench,
    color: 'text-purple-400',
    bgColor: 'bg-purple-600',
    allowSelection: true,
    selectionAction: 'invoice',
  },
};

const BATCH_MODES = {
  MANUAL: { label: 'Manual', icon: ListChecks, description: 'Single batch' },
  BY_PROJECT: { label: 'By Project', icon: FolderOpen, description: 'Per project' },
  BY_CLIENT: { label: 'By Client', icon: Users, description: 'Per client' },
};

// LEGACY MODEL ONLY: Ordering safety for pool-based billing
// Forward model does NOT use this - readiness is based on: has retail price + not already invoiced
const ORDERING_SAFETY_CONFIG = {
  RED: { label: 'Not Billed', color: 'bg-red-600', textColor: 'text-red-400' },
  YELLOW: { label: 'Awaiting Payment', color: 'bg-yellow-600', textColor: 'text-yellow-400' },
  GREEN: { label: 'Paid', color: 'bg-green-600', textColor: 'text-green-400' },
};

const FINANCIAL_ROLE_LABELS = {
  VENDOR_MARGIN: 'Vendor Margin',
  INTERNAL_MANUFACTURING: 'Internal Mfg',
  LABOR_ONLY: 'Labor Only',
  ASSET_RECOVERY: 'Asset Recovery',
  NON_BILLABLE: 'Non-Billable',
};

// ============================================
// KPI HEADER
// ============================================

function LifecycleKPIHeader({ kpis }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Card className="bg-yellow-900/20 border-yellow-800/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-gray-400 uppercase">Needs Billing</span>
          </div>
          <p className="text-xl font-bold text-yellow-400">{kpis.needs_billing_count || 0}</p>
          <p className="text-xs text-gray-500">${(kpis.needs_billing_revenue || 0).toFixed(0)}</p>
        </CardContent>
      </Card>
      <Card className="bg-orange-900/20 border-orange-800/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-gray-400 uppercase">Awaiting Pay</span>
          </div>
          <p className="text-xl font-bold text-orange-400">{kpis.awaiting_payment_count || 0}</p>
          <p className="text-xs text-gray-500">${(kpis.awaiting_payment_revenue || 0).toFixed(0)}</p>
        </CardContent>
      </Card>
      <Card className="bg-green-900/20 border-green-800/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="w-4 h-4 text-green-400" />
            <span className="text-xs text-gray-400 uppercase">Ready to Order</span>
          </div>
          <p className="text-xl font-bold text-green-400">{kpis.ready_to_order_count || 0}</p>
          <p className="text-xs text-gray-500">${(kpis.ready_to_order_cost || 0).toFixed(0)} cost</p>
        </CardContent>
      </Card>
      <Card className="bg-blue-900/20 border-blue-800/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-gray-400 uppercase">In Progress</span>
          </div>
          <p className="text-xl font-bold text-blue-400">{kpis.orders_in_progress_count || 0}</p>
        </CardContent>
      </Card>
      <Card className="bg-purple-900/20 border-purple-800/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-gray-400 uppercase">Installed Bill</span>
          </div>
          <p className="text-xl font-bold text-purple-400">{kpis.installed_billing_count || 0}</p>
          <p className="text-xs text-gray-500">${(kpis.installed_billing_revenue || 0).toFixed(0)}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// LIFECYCLE TABLE
// ============================================

/**
 * Derive forward-model invoice status from item data
 * Returns: "Uninvoiced" | "Invoiced" | "Paid"
 */
function getForwardInvoiceStatus(item) {
  if (item.batch_status === 'paid' || item.invoice_status === 'paid') return 'Paid';
  if (item.batch_id || item.invoice_batch_id || item.batch_status === 'invoiced' || item.batch_status === 'sent') return 'Invoiced';
  return 'Uninvoiced';
}

/**
 * Check if an item is from a forward-model project
 */
function isItemForwardModel(item) {
  return item.financial_model_version === 'forward' || item.project_financial_model === 'forward';
}

function LifecycleTable({ items, tabConfig, selectedIds, onToggleSelection, onRowClick }) {
  const allowSelection = tabConfig.allowSelection;
  
  // Check if any items are from legacy model (to show/hide Safety column header)
  const hasLegacyItems = items.some(item => !isItemForwardModel(item));

  if (!items || items.length === 0) {
    return (
      <div className="p-8 text-center">
        <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
        <p className="text-green-400 font-medium">No items in this category</p>
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
          <TableHead className="text-gray-400 text-xs">Project</TableHead>
          <TableHead className="text-gray-400 text-xs">Part</TableHead>
          {/* LEGACY ONLY: Safety column for pool-based billing - show if any legacy items exist */}
          {hasLegacyItems && (
            <TableHead className="text-gray-400 text-xs text-center">Safety</TableHead>
          )}
          <TableHead className="text-gray-400 text-xs text-right">Qty</TableHead>
          <TableHead className="text-gray-400 text-xs text-right">Unit</TableHead>
          <TableHead className="text-gray-400 text-xs text-right">Total</TableHead>
          <TableHead className="text-gray-400 text-xs">Status</TableHead>
          <TableHead className="text-gray-400 text-xs">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(item => {
          const itemIsForward = isItemForwardModel(item);
          return (
          <TableRow 
            key={item.id}
            className={cn(
              "border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer",
              item.is_queued && "opacity-50"
            )}
            onClick={() => onRowClick(item)}
          >
            {allowSelection && (
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox 
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={(checked) => onToggleSelection(item.id, checked)}
                  disabled={item.is_queued || item.unit_retail <= 0}
                />
              </TableCell>
            )}
            <TableCell>
              <Link 
                to={`${createPageUrl('ProjectDetail')}?id=${item.project_id}`}
                className="text-blue-400 hover:text-blue-300 text-sm"
                onClick={(e) => e.stopPropagation()}
              >
                {item.project_name}
              </Link>
              {item.client_name && (
                <p className="text-xs text-gray-500">{item.client_name}</p>
              )}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-white text-sm">{item.part_name}</p>
                  {item.part_number && (
                    <p className="text-xs text-gray-500">{item.part_number}</p>
                  )}
                </div>
                {item.part_type_missing && (
                  <Badge className="bg-amber-600/30 text-amber-400 text-xs shrink-0">
                    ⚠ Missing Type
                  </Badge>
                )}
                {/* Forward model indicator */}
                {itemIsForward && (
                  <Badge className="bg-blue-600/30 text-blue-400 text-xs shrink-0">F</Badge>
                )}
              </div>
            </TableCell>
            {/* LEGACY ONLY: Safety badge for pool-based billing */}
            {hasLegacyItems && (
              <TableCell className="text-center">
                {itemIsForward ? (
                  <span className="text-gray-500">—</span>
                ) : (
                  <Badge className={cn("text-xs", ORDERING_SAFETY_CONFIG[item.ordering_safety]?.color || 'bg-gray-600')}>
                    {item.ordering_safety}
                  </Badge>
                )}
              </TableCell>
            )}
            <TableCell className="text-right text-gray-300">{item.assigned_qty}</TableCell>
            <TableCell className="text-right text-gray-300">
              {item.unit_retail > 0 ? `$${item.unit_retail.toFixed(2)}` : (
                <Badge className="bg-red-600/30 text-red-400 text-xs">Missing</Badge>
              )}
            </TableCell>
            <TableCell className="text-right text-green-400 font-medium">
              ${(item.line_total || 0).toFixed(2)}
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                {/* FORWARD: Show invoice status; LEGACY: Show billing status */}
                {itemIsForward ? (
                  <Badge className={cn(
                    "text-xs",
                    getForwardInvoiceStatus(item) === 'Paid' ? 'bg-green-600' :
                    getForwardInvoiceStatus(item) === 'Invoiced' ? 'bg-purple-600' :
                    'bg-gray-700'
                  )}>
                    {getForwardInvoiceStatus(item)}
                  </Badge>
                ) : (
                  <Badge className="bg-gray-700 text-xs">{item.client_billing_status}</Badge>
                )}
                {item.vendor_order_status === 'ORDERED' && (
                  <Badge className="bg-blue-600/30 text-blue-400 text-xs">Ordered</Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              <span className="text-xs text-gray-400">{item.recommended_action}</span>
            </TableCell>
          </TableRow>
          );
        })}
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
  
  // Calculate ready vs blocked counts
  const readyCount = selectedItems.filter(item => (item.unit_retail || item.unit_price || 0) > 0).length;
  const blockedCount = selectedCount - readyCount;
  
  if (selectedCount === 0) return null;

  const isInvoiceAction = actionType === 'invoice';
  const isPurchaseAction = actionType === 'purchase';
  const canCreate = readyCount > 0;

  return (
    <Card className={cn(
      "sticky bottom-4 border",
      isInvoiceAction && "bg-gradient-to-r from-green-900/30 to-emerald-900/30 border-green-700/50",
      isPurchaseAction && "bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border-blue-700/50"
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
              
              {/* Readiness indicator */}
              <div className="flex items-center gap-2 ml-4 text-sm">
                <span className="text-green-400">✓ Ready: {readyCount}</span>
                {blockedCount > 0 && (
                  <span className="text-red-400">✗ Blocked: {blockedCount}</span>
                )}
              </div>
            </div>
            
            {isInvoiceAction && (
              <RadioGroup value={batchMode} onValueChange={setBatchMode} className="flex gap-4 mt-3">
                {Object.entries(BATCH_MODES).map(([mode, config]) => {
                  const Icon = config.icon;
                  return (
                    <div key={mode} className="flex items-center gap-2">
                      <RadioGroupItem value={mode} id={mode} />
                      <Label htmlFor={mode} className="flex items-center gap-1 text-gray-300 cursor-pointer">
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
              disabled={isCreating || !canCreate}
              className={cn(
                isInvoiceAction ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700",
                !canCreate && "opacity-50 cursor-not-allowed"
              )}
            >
              {isCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : (
                isInvoiceAction ? <FileText className="w-4 h-4 mr-2" /> : <ShoppingCart className="w-4 h-4 mr-2" />
              )}
              {isInvoiceAction ? `Create Invoice Batch (${readyCount})` : 'Create Purchase Order'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// BATCH HISTORY PANEL
// ============================================

function BatchHistoryPanel({ onBatchClick }) {
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['invoiceBatches'],
    queryFn: () => base44.entities.InvoiceBatch.list('-created_date', 15),
  });

  const statusColors = {
    draft: 'bg-gray-600',
    exported: 'bg-blue-600',
    invoiced: 'bg-green-600',
    voided: 'bg-red-600',
  };

  if (isLoading) {
    return <div className="p-4 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-500" /></div>;
  }

  if (batches.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No batches yet</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-48">
      <div className="space-y-2 p-2">
        {batches.map(batch => (
          <button
            key={batch.id}
            onClick={() => onBatchClick(batch)}
            className="w-full text-left p-2 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-white font-medium text-xs truncate">{batch.batch_name}</span>
              <Badge className={cn("text-xs", statusColors[batch.status] || 'bg-gray-600')}>
                {batch.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{batch.line_count || 0} items</span>
              <span>${(batch.total_amount || 0).toFixed(0)}</span>
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}

// ============================================
// BATCH DETAIL MODAL
// ============================================

function BatchDetailModal({ batch, isOpen, onClose }) {
  const queryClient = useQueryClient();
  
  const { data: lines = [], isLoading } = useQuery({
    queryKey: ['batchLines', batch?.id],
    queryFn: () => base44.entities.InvoiceBatchLine.filter({ batch_id: batch.id }),
    enabled: isOpen && !!batch?.id,
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('exportInvoiceBatchToQuickBooks', { batch_id: batch.id });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Batch exported successfully');
      queryClient.invalidateQueries({ queryKey: ['invoiceBatches'] });
      queryClient.invalidateQueries({ queryKey: ['batchLines', batch?.id] });
    },
    onError: (error) => {
      toast.error(error.message || 'Export failed');
    },
  });

  if (!batch) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {batch.batch_name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 p-3 bg-gray-800/50 rounded-lg">
            <div>
              <p className="text-xs text-gray-400">Status</p>
              <Badge className="mt-1">{batch.status}</Badge>
            </div>
            <div>
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-white font-bold">${(batch.total_amount || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">QB Export ID</p>
              <p className="text-white text-sm">{batch.qb_export_id || '-'}</p>
            </div>
          </div>
          
          {isLoading ? (
            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          ) : (
            <ScrollArea className="h-48">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-700">
                    <TableHead className="text-gray-400">Description</TableHead>
                    <TableHead className="text-gray-400 text-right">Qty</TableHead>
                    <TableHead className="text-gray-400 text-right">Total</TableHead>
                    <TableHead className="text-gray-400">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map(line => (
                    <TableRow key={line.id} className="border-gray-800">
                      <TableCell className="text-white text-sm">{line.description}</TableCell>
                      <TableCell className="text-right text-gray-300">{line.qty}</TableCell>
                      <TableCell className="text-right text-green-400">${(line.line_total || 0).toFixed(2)}</TableCell>
                      <TableCell><Badge className="text-xs">{line.qb_status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {batch.status === 'draft' && (
            <Button 
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {exportMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Export to QuickBooks
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function InvoiceWorkbench({ onRowClick }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('assigned_needs_billing');
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [financialRoleFilter, setFinancialRoleFilter] = useState('all');
  const [orderingSafetyFilter, setOrderingSafetyFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchMode, setBatchMode] = useState('MANUAL');
  const [selectedBatch, setSelectedBatch] = useState(null);

  // Fetch lifecycle data
  const { data: lifecycleData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['billingProcurementStates', projectFilter, financialRoleFilter, orderingSafetyFilter],
    queryFn: async () => {
      const filters = {};
      if (projectFilter !== 'all') filters.project_id = projectFilter;
      if (financialRoleFilter !== 'all') filters.financial_role = financialRoleFilter;
      if (orderingSafetyFilter !== 'all') filters.ordering_safety = orderingSafetyFilter;
      
      const response = await base44.functions.invoke('getBillingAndProcurementStates', { filters });
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
      console.log("Create Invoice Batch clicked");
      console.log("Selected items:", items.length);
      
      const response = await base44.functions.invoke('createInvoiceBatch', {
        items,
        batch_mode: batchMode,
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message || `Created ${data.batches_created} batch(es) with ${data.lines_created} lines`);
        
        // Show warning if some items were blocked
        if (data.blocked_items?.length > 0) {
          toast.warning(`${data.blocked_items.length} item(s) could not be invoiced`, {
            description: data.blocked_items.slice(0, 3).map(b => `${b.part_name}: ${b.reasons.join(', ')}`).join('\n'),
          });
        }
        
        setSelectedIds(new Set());
        queryClient.invalidateQueries({ queryKey: ['billingProcurementStates'] });
        queryClient.invalidateQueries({ queryKey: ['invoiceBatches'] });
        queryClient.invalidateQueries({ queryKey: ['lifecycleActionQueue'] });
      } else {
        toast.error(data.message || 'Batch creation failed');
      }
    },
    onError: (error) => {
      console.error("Create batch error:", error);
      const errorData = error.response?.data || error;
      
      if (errorData.blocked_items?.length > 0) {
        toast.error(errorData.message || 'Some items cannot be invoiced', {
          description: errorData.blocked_items.slice(0, 3).map(b => 
            `${b.part_name}: ${b.reasons?.join(', ') || 'Unknown reason'}`
          ).join('\n'),
        });
      } else {
        toast.error(errorData.message || error.message || 'Failed to create batch');
      }
    },
  });

  // Get current tab config
  const currentTabConfig = Object.values(LIFECYCLE_TABS).find(t => t.key === activeTab) || LIFECYCLE_TABS.ASSIGNED_NEEDS_BILLING;

  // Filter items for current tab
  const currentItems = useMemo(() => {
    if (!lifecycleData) return [];
    let items = lifecycleData[activeTab] || [];
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      items = items.filter(i => 
        i.part_name?.toLowerCase().includes(search) ||
        i.project_name?.toLowerCase().includes(search)
      );
    }
    
    return items;
  }, [lifecycleData, activeTab, searchTerm]);

  const selectedItems = currentItems.filter(item => selectedIds.has(item.id));

  const toggleSelection = (id, checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleCreateBatch = () => {
    if (selectedItems.length === 0) {
      toast.error('No items selected', {
        description: 'Please select at least one item to create an invoice batch.',
      });
      return;
    }
    
    // Check for items with missing pricing
    const blockedCount = selectedItems.filter(item => 
      (item.unit_retail || item.unit_price || 0) <= 0
    ).length;
    
    if (blockedCount === selectedItems.length) {
      toast.error('All selected items have missing pricing', {
        description: 'Cannot create invoice batch without retail prices.',
      });
      return;
    }
    
    createBatchMutation.mutate(selectedItems);
  };

  // Clear selection when changing tabs
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedIds(new Set());
  };

  const kpis = lifecycleData?.kpis || {};

  return (
    <div className="space-y-4">
      {/* KPI Header */}
      <LifecycleKPIHeader kpis={kpis} />

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Lifecycle Tabs & Table */}
        <div className="lg:col-span-3">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader className="border-b border-gray-800 p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="text-white flex items-center gap-2">
                  <CircleDollarSign className="w-5 h-5 text-green-400" />
                  Parts Lifecycle Workflow
                </CardTitle>
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
              
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 h-9"
                  />
                </div>
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 h-9">
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={financialRoleFilter} onValueChange={setFinancialRoleFilter}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 h-9">
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="VENDOR_MARGIN">Vendor Margin</SelectItem>
                    <SelectItem value="INTERNAL_MANUFACTURING">Internal Mfg</SelectItem>
                    <SelectItem value="LABOR_ONLY">Labor Only</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={orderingSafetyFilter} onValueChange={setOrderingSafetyFilter}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 h-9">
                    <SelectValue placeholder="All Safety" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Safety Levels</SelectItem>
                    <SelectItem value="RED">🔴 Not Billed</SelectItem>
                    <SelectItem value="YELLOW">🟡 Awaiting Pay</SelectItem>
                    <SelectItem value="GREEN">🟢 Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            
            <CardContent className="p-0">
              <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList className="w-full bg-gray-900/50 border-b border-gray-700 p-1 rounded-none justify-start overflow-x-auto">
                  {Object.values(LIFECYCLE_TABS).map(tab => {
                    const Icon = tab.icon;
                    const count = lifecycleData?.[tab.key]?.length || 0;
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
                        {count > 0 && (
                          <Badge className={cn("text-xs", tab.bgColor)}>{count}</Badge>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {isLoading ? (
                  <div className="p-8 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-gray-500" />
                    <p className="text-gray-400">Loading lifecycle data...</p>
                  </div>
                ) : (
                  Object.values(LIFECYCLE_TABS).map(tab => (
                    <TabsContent key={tab.key} value={tab.key} className="m-0">
                      <LifecycleTable 
                        items={currentItems}
                        tabConfig={tab}
                        selectedIds={selectedIds}
                        onToggleSelection={toggleSelection}
                        onRowClick={onRowClick}
                      />
                    </TabsContent>
                  ))
                )}
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader className="border-b border-gray-800 p-3">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Recent Batches
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <BatchHistoryPanel onBatchClick={setSelectedBatch} />
            </CardContent>
          </Card>

          {/* Legend - LEGACY ONLY: Ordering Safety explanation */}
          <Card className="bg-black/40 border-gray-800">
            <CardHeader className="border-b border-gray-800 p-3">
              <CardTitle className="text-white text-sm">Ordering Safety (Legacy)</CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
              {Object.entries(ORDERING_SAFETY_CONFIG).map(([key, config]) => (
                <div key={key} className="flex items-center gap-2">
                  <Badge className={cn("text-xs w-16 justify-center", config.color)}>{key}</Badge>
                  <span className="text-xs text-gray-400">{config.label}</span>
                </div>
              ))}
              <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-700">
                Safety only applies to legacy pool-based billing.
                Forward model uses Invoice status.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

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

      {/* Batch Detail Modal */}
      <BatchDetailModal
        batch={selectedBatch}
        isOpen={!!selectedBatch}
        onClose={() => setSelectedBatch(null)}
      />
    </div>
  );
}