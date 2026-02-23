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
import { isInvoiceReady, getEffectiveRetailPrice } from "./invoiceReadinessHelper";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import CreditSummaryStrip from "./CreditSummaryStrip";
import ApplyCreditModal from "./ApplyCreditModal";

// ============================================
// CONSTANTS
// ============================================

/**
 * CANONICAL_INVOICE_TABS - Financial-only billing states
 * 
 * FORWARD MODEL ONLY - Uses canonical billing status:
 * - UNBILLED (Ready to Bill) - Gray
 * - INVOICED (Awaiting Payment) - Purple  
 * - PAID - Green
 * 
 * NO LIFECYCLE LEAKAGE:
 * - Does NOT use: commitment_status, coverage_status, inventory, to_order
 * - Does NOT use: Ready to Order, In Progress, Installed Bill (supply lifecycle)
 */
const CANONICAL_INVOICE_TABS = {
  UNBILLED: {
    key: 'unbilled',
    label: 'Ready to Bill',
    shortLabel: 'Unbilled',
    icon: DollarSign,
    color: 'text-gray-400',
    bgColor: 'bg-gray-600',
    allowSelection: true,
    selectionAction: 'invoice',
  },
  INVOICED: {
    key: 'invoiced',
    label: 'Awaiting Payment',
    shortLabel: 'Invoiced',
    icon: Clock,
    color: 'text-purple-400',
    bgColor: 'bg-purple-600',
    allowSelection: false,
  },
  PAID: {
    key: 'paid',
    label: 'Paid',
    shortLabel: 'Paid',
    icon: CheckCircle2,
    color: 'text-green-400',
    bgColor: 'bg-green-600',
    allowSelection: false,
  },
};

// DEPRECATED: Legacy lifecycle tabs - kept for reference only
const LIFECYCLE_TABS = CANONICAL_INVOICE_TABS;

const BATCH_MODES = {
  MANUAL: { label: 'Manual', icon: ListChecks, description: 'Single batch' },
  BY_PROJECT: { label: 'By Project', icon: FolderOpen, description: 'Per project' },
  BY_CLIENT: { label: 'By Client', icon: Users, description: 'Per client' },
};

// PHASE 9E: ORDERING_SAFETY_CONFIG REMOVED
// Pool-based billing has been permanently removed.
// Forward model uses Invoice status: Uninvoiced / Invoiced / Paid

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

/**
 * CanonicalKPIHeader - Financial-only KPIs (no lifecycle)
 * 
 * PHASE 7: Shows only canonical billing states:
 * - Unbilled (Gray)
 * - Invoiced/Awaiting Payment (Purple)
 * - Paid (Green)
 */
function CanonicalKPIHeader({ kpis }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Unbilled - Gray */}
      <Card className="bg-gray-900/40 border-gray-700">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-400 uppercase">Ready to Bill</span>
          </div>
          <p className="text-xl font-bold text-gray-400">{kpis.unbilled_count || 0}</p>
          <p className="text-xs text-gray-500">{formatCurrencyUSD(kpis.unbilled_total || 0)}</p>
        </CardContent>
      </Card>
      
      {/* Invoiced - Purple */}
      <Card className="bg-purple-900/20 border-purple-800/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-gray-400 uppercase">Awaiting Payment</span>
          </div>
          <p className="text-xl font-bold text-purple-400">{kpis.invoiced_count || 0}</p>
          <p className="text-xs text-gray-500">{formatCurrencyUSD(kpis.invoiced_total || 0)}</p>
        </CardContent>
      </Card>
      
      {/* Paid - Green */}
      <Card className="bg-green-900/20 border-green-800/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-xs text-gray-400 uppercase">Paid</span>
          </div>
          <p className="text-xl font-bold text-green-400">{kpis.paid_count || 0}</p>
          <p className="text-xs text-gray-500">{formatCurrencyUSD(kpis.paid_total || 0)}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// DEPRECATED: Legacy KPI header - kept for reference
function LifecycleKPIHeader({ kpis }) {
  // Forward to canonical header
  return <CanonicalKPIHeader kpis={kpis} />;
}

// ============================================
// LIFECYCLE TABLE
// ============================================

/**
 * PHASE 6: Canonical billing status derivation
 * Returns: "unbilled" | "invoiced" | "paid"
 */
function getCanonicalBillingStatus(item) {
  // Check batch status first (most authoritative)
  if (item.batch_status === 'paid' || item.invoice_status === 'paid' || item.billing_status === 'paid') {
    return 'paid';
  }
  if (item.batch_id || item.invoice_batch_id || item.batch_status === 'invoiced' || item.batch_status === 'sent' || item.billing_status === 'invoiced') {
    return 'invoiced';
  }
  return 'unbilled';
}

// DEPRECATED: Legacy forward model check - all projects are forward model now
function isItemForwardModel(item) {
  return true; // All projects use forward model
}

// DEPRECATED: Legacy function kept for compatibility
function getForwardInvoiceStatus(item) {
  const status = getCanonicalBillingStatus(item);
  // Map to old display format for any legacy code
  return status === 'unbilled' ? 'Uninvoiced' : 
         status === 'invoiced' ? 'Invoiced' : 'Paid';
}

function LifecycleTable({ items, tabConfig, selectedIds, onToggleSelection, onRowClick }) {
  const allowSelection = tabConfig.allowSelection;
  
  // PHASE 9E: Legacy pool model removed - all items are forward model
  const hasLegacyItems = false;

  if (!items || items.length === 0) {
    return (
      <div className="p-8 text-center">
        <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
        <p className="text-green-400 font-medium">No items in this category</p>
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
          <TableHead className="text-gray-400 text-xs">Project</TableHead>
          <TableHead className="text-gray-400 text-xs">Part</TableHead>
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
          
          // FAIL-FAST: Log error if canonical fields missing
          if (!item.commitment_id) {
            console.error('[CANONICAL VIOLATION] Missing commitment_id in InvoiceWorkbench:', item);
          }
          
          return (
          <TableRow 
            key={item.commitment_id}
            className={cn(
              "border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer",
              item.is_queued && "opacity-50"
            )}
            onClick={() => onRowClick(item)}
          >
            {allowSelection && (
              <TableCell onClick={(e) => e.stopPropagation()}>
                {/* Phase 6.1: Use centralized isInvoiceReady helper */}
                {(() => {
                  const readiness = isInvoiceReady(item);
                  return (
                    <Checkbox 
                      checked={selectedIds.has(item.commitment_id)}
                      onCheckedChange={(checked) => onToggleSelection(item.commitment_id, checked)}
                      disabled={!readiness.ready || item.is_queued}
                      title={!readiness.ready ? readiness.reasons.join(', ') : undefined}
                    />
                  );
                })()}
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

            <TableCell className="text-right text-gray-300">{item.required_total ?? item.assigned_qty ?? 0}</TableCell>
            <TableCell className="text-right text-gray-300">
              {item.unit_retail > 0 ? formatCurrencyUSD(item.unit_retail) : (
                <Badge className="bg-red-600/30 text-red-400 text-xs">Missing</Badge>
              )}
            </TableCell>
            <TableCell className="text-right">
              {/* PHASE 6: Show net exposure if credit applied */}
              {item.credit_applied_line > 0 ? (
                <div className="text-right">
                  <span className="text-gray-500 line-through text-xs">
                    {formatCurrencyUSD(item.gross_line_total || item.line_total || 0)}
                  </span>
                  <span className="text-green-400 font-medium ml-1">
                    {formatCurrencyUSD(item.net_line_total || 0)}
                  </span>
                </div>
              ) : (
                <span className="text-green-400 font-medium">
                  {formatCurrencyUSD(item.line_total || 0)}
                </span>
              )}
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

function BatchBuilderPanel({ 
  selectedItems, 
  batchMode, 
  setBatchMode, 
  onCreateBatch, 
  onClearSelection, 
  isCreating, 
  actionType,
  // Phase 6.2: Draft accumulation props
  draftBatches = [],
  targetDraftBatchId = 'new',
  setTargetDraftBatchId,
}) {
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
                {formatCurrencyUSD(totalAmount)}
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
              <div className="flex flex-wrap items-center gap-4 mt-3">
                <RadioGroup value={batchMode} onValueChange={setBatchMode} className="flex gap-4">
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
                
                {/* Phase 6.2: Draft Invoice Accumulation */}
                {draftBatches.length > 0 && setTargetDraftBatchId && (
                  <div className="flex items-center gap-2 ml-4 pl-4 border-l border-gray-600">
                    <Label className="text-gray-400 text-sm">Target:</Label>
                    <Select value={targetDraftBatchId} onValueChange={setTargetDraftBatchId}>
                      <SelectTrigger className="w-48 h-8 bg-gray-800/50 border-gray-600 text-sm">
                        <SelectValue placeholder="New Invoice" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">➕ Create New Invoice</SelectItem>
                        {draftBatches.map(batch => (
                          <SelectItem key={batch.id} value={batch.id}>
                            📄 {batch.invoice_number || batch.batch_name} ({formatCurrencyUSD(batch.total_amount || 0)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
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
  // PHASE 1: Use ProjectInvoice instead of InvoiceBatch
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['projectInvoicesRecent'],
    queryFn: () => base44.entities.ProjectInvoice.list('-created_date', 15),
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
              <span className="text-white font-medium text-xs truncate">{batch.qb_invoice_number || `Invoice #${batch.id.slice(0,6)}`}</span>
              <Badge className={cn("text-xs", statusColors[batch.status] || 'bg-gray-600')}>
                {batch.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{batch.invoice_type || 'progress'}</span>
              <span>${(batch.total || batch.subtotal || 0).toFixed(0)}</span>
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
  
  // PHASE 1: Use ProjectInvoiceLine instead of InvoiceBatchLine
  const { data: lines = [], isLoading } = useQuery({
    queryKey: ['invoiceLines', batch?.id],
    queryFn: () => base44.entities.ProjectInvoiceLine.filter({ invoice_id: batch.id }),
    enabled: isOpen && !!batch?.id,
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('exportProjectInvoicesToQB', { invoice_id: batch.id });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Invoice exported successfully');
      queryClient.invalidateQueries({ queryKey: ['projectInvoicesRecent'] });
      queryClient.invalidateQueries({ queryKey: ['invoiceLines', batch?.id] });
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

export default function InvoiceWorkbench({ projectId, onClose, onSuccess, onRowClick }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('assigned_needs_billing');
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [financialRoleFilter, setFinancialRoleFilter] = useState('all');
  // PHASE 9E: orderingSafetyFilter removed - legacy pool model no longer supported
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchMode, setBatchMode] = useState('MANUAL');
  const [selectedBatch, setSelectedBatch] = useState(null);
  // Phase 6.2: Draft invoice accumulation
  const [targetDraftBatchId, setTargetDraftBatchId] = useState('new');
  // PHASE 4: Credit allocation modal state
  const [showCreditModal, setShowCreditModal] = useState(false);

  // Fetch lifecycle data
  // Override project filter if projectId prop provided
  React.useEffect(() => {
    if (projectId) {
      setProjectFilter(projectId);
    }
  }, [projectId]);

  const { data: lifecycleData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['billingProcurementStates', projectFilter, financialRoleFilter],
    queryFn: async () => {
      const filters = {};
      if (projectFilter !== 'all') filters.project_id = projectFilter;
      if (financialRoleFilter !== 'all') filters.financial_role = financialRoleFilter;
      
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

  // Phase 1: Fetch existing draft invoices for accumulation
  const { data: draftBatches = [] } = useQuery({
    queryKey: ['draftProjectInvoices', projectFilter],
    queryFn: async () => {
      const filter = { status: 'draft' };
      if (projectFilter !== 'all') filter.project_id = projectFilter;
      return base44.entities.ProjectInvoice.filter(filter, '-created_date');
    },
    staleTime: 30000,
  });

  // PHASE 1: Create invoice using forward system
  const createBatchMutation = useMutation({
    mutationFn: async (items) => {
      console.log("Create Invoice clicked (forward system)");
      console.log("Selected items:", items.length);
      
      // Build lines for createProjectInvoiceDraft
      const lines = items.map(item => ({
        type: 'part',
        part_commitment_id: item.commitment_id,
        description: item.part_name || 'Unknown Part',
        qty: item.assigned_qty || item.required_total || 1,
        unit_price: item.unit_retail || item.unit_price || 0,
      }));
      
      const response = await base44.functions.invoke('createProjectInvoiceDraft', {
        project_id: projectFilter !== 'all' ? projectFilter : items[0]?.project_id,
        invoice_type: 'progress',
        lines,
      });
      return response.data;
    },
    onSuccess: async (data) => {
      if (data.success) {
        toast.success(data.message || `Created ${data.batches_created} batch(es) with ${data.lines_created} lines`);
        
        // Show warning if some items were blocked
        if (data.blocked_items?.length > 0) {
          toast.warning(`${data.blocked_items.length} item(s) could not be invoiced`, {
            description: data.blocked_items.slice(0, 3).map(b => `${b.part_name}: ${b.reasons.join(', ')}`).join('\n'),
          });
        }
        
        setSelectedIds(new Set());
        
        // PHASE 17: Deterministic refresh
        const commitmentIds = selectedItems.map(i => i.commitment_id).filter(Boolean);
        const projectIds = [...new Set(selectedItems.map(i => i.project_id).filter(Boolean))];
        await forceAppRefresh(queryClient, { projectIds, commitmentIds });
        
        // Call onSuccess prop if modal usage
        if (onSuccess) {
          onSuccess(data);
        }
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
  const currentTabConfig = Object.values(LIFECYCLE_TABS).find(t => t.key === activeTab) || LIFECYCLE_TABS.UNBILLED;

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

  // CANONICAL: selectedItems filtered by commitment_id
  const selectedItems = currentItems.filter(item => selectedIds.has(item.commitment_id));

  // CANONICAL: Toggle selection using commitment_id only
  const toggleSelection = (commitmentId, checked) => {
    if (!commitmentId) {
      console.error('[CANONICAL VIOLATION] toggleSelection called with undefined commitmentId');
      return;
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(commitmentId);
      } else {
        next.delete(commitmentId);
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
    
    // CANONICAL: Send only required payload fields to backend
    const payload = selectedItems.map(item => {
      if (!item.commitment_id) {
        console.error('[CANONICAL VIOLATION] Item missing commitment_id:', item);
      }
      
      return {
        commitment_id: item.commitment_id,
        project_id: item.project_id,
        part_id: item.part_id,
        part_name: item.part_name,
        project_name: item.project_name,
        unit_retail: item.unit_retail,
        unit_price: item.unit_retail || item.unit_price,
        line_total: item.line_total,
        required_total: item.required_total || item.assigned_qty || 0,
        assigned_qty: item.required_total || item.assigned_qty || 0,
      };
    });
    
    createBatchMutation.mutate(payload);
  };

  // Clear selection when changing tabs
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedIds(new Set());
  };

  const kpis = lifecycleData?.kpis || {};
  const creditSummary = lifecycleData?.credit_summary || {};
  
  // Get current project summary for credit display
  const currentProjectSummary = useMemo(() => {
    if (projectFilter === 'all' || !lifecycleData?.project_summaries) return null;
    return lifecycleData.project_summaries.find(p => p.project_id === projectFilter);
  }, [lifecycleData?.project_summaries, projectFilter]);
  
  // Selected commitment IDs for credit modal
  const selectedCommitmentIds = useMemo(() => {
    return [...selectedIds];
  }, [selectedIds]);

  // Modal wrapper when used as modal (has onClose prop)
  const isModal = !!onClose;
  const content = (
    <div className="space-y-4">
      {/* KPI Header */}
      <LifecycleKPIHeader kpis={kpis} />
      
      {/* PHASE 4: Credit Summary Strip */}
      {projectFilter !== 'all' && currentProjectSummary && (
        <CreditSummaryStrip
          grossExposure={currentProjectSummary.gross_exposure}
          creditAvailable={currentProjectSummary.credit_available}
          creditApplied={currentProjectSummary.credit_applied_total}
          netExposure={currentProjectSummary.net_exposure}
          selectedCount={selectedIds.size}
          onApplyCredit={() => setShowCreditModal(true)}
          isLoading={isLoading || isFetching}
        />
      )}
      
      {/* Global Credit Summary when viewing all projects */}
      {projectFilter === 'all' && creditSummary.total_credit_available > 0 && (
        <CreditSummaryStrip
          grossExposure={creditSummary.gross_exposure_global}
          creditAvailable={creditSummary.total_credit_available}
          creditApplied={creditSummary.total_credit_applied}
          netExposure={creditSummary.net_exposure_global}
          isLoading={isLoading || isFetching}
        />
      )}

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

          {/* Forward Model Invoice Status Legend */}
          <Card className="bg-black/40 border-gray-800">
            <CardHeader className="border-b border-gray-800 p-3">
              <CardTitle className="text-white text-sm">Invoice Status</CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="text-xs w-20 justify-center bg-gray-700">Uninvoiced</Badge>
                <span className="text-xs text-gray-400">Ready to bill</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="text-xs w-20 justify-center bg-purple-600">Invoiced</Badge>
                <span className="text-xs text-gray-400">Awaiting payment</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="text-xs w-20 justify-center bg-green-600">Paid</Badge>
                <span className="text-xs text-gray-400">Payment received</span>
              </div>
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
          // Phase 6.2: Draft invoice accumulation
          draftBatches={draftBatches}
          targetDraftBatchId={targetDraftBatchId}
          setTargetDraftBatchId={setTargetDraftBatchId}
        />
      )}

      {/* Batch Detail Modal */}
      <BatchDetailModal
        batch={selectedBatch}
        isOpen={!!selectedBatch}
        onClose={() => setSelectedBatch(null)}
      />
      
      {/* PHASE 4: Credit Allocation Modal */}
      <ApplyCreditModal
        open={showCreditModal}
        onClose={() => setShowCreditModal(false)}
        projectId={projectFilter !== 'all' ? projectFilter : null}
        projectName={currentProjectSummary?.project_name || 'Project'}
        selectedCommitmentIds={selectedCommitmentIds}
        creditSummary={currentProjectSummary || creditSummary}
        onSuccess={() => {
          setSelectedIds(new Set());
          refetch();
        }}
      />
    </div>
  );

  // Render as modal if onClose provided
  if (isModal) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-400" />
              Create Invoice
            </DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  // Render as standalone page
  return content;
}