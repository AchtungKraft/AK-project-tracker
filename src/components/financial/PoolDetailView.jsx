import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowLeft,
  RotateCcw,
  FileText,
  Package,
  Clock,
  X,
  Loader2,
  Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { CommitmentActions } from "./financialMutationGuard";

/**
 * PoolDetailView - Detailed view of a billing pool with audit trail
 * 
 * Displays:
 * - Pool header with status/balance
 * - Funding source (linked invoice)
 * - Allocations table with reversal controls
 * - Charges table with reversal controls
 * - Audit/lifecycle events
 */
export default function PoolDetailView({ poolId, onClose }) {
  const queryClient = useQueryClient();
  const [showReversalModal, setShowReversalModal] = useState(null);
  const [reversalReason, setReversalReason] = useState('');

  // Fetch pool
  const { data: pool, isLoading: loadingPool } = useQuery({
    queryKey: ['billingPool', poolId],
    queryFn: async () => {
      const pools = await base44.entities.BillingPool.filter({ id: poolId });
      return pools[0];
    },
    enabled: !!poolId,
  });

  // Fetch allocations
  const { data: allocations = [], isLoading: loadingAllocations } = useQuery({
    queryKey: ['poolAllocations', poolId],
    queryFn: () => base44.entities.PoolAllocation.filter({ pool_id: poolId }),
    enabled: !!poolId,
  });

  // Fetch charges
  const { data: charges = [], isLoading: loadingCharges } = useQuery({
    queryKey: ['poolCharges', poolId],
    queryFn: () => base44.entities.PoolCharge.filter({ pool_id: poolId }),
    enabled: !!poolId,
  });

  // Fetch linked invoice batch
  const { data: invoiceBatch } = useQuery({
    queryKey: ['invoiceBatch', pool?.invoice_batch_id],
    queryFn: async () => {
      if (!pool?.invoice_batch_id) return null;
      const batches = await base44.entities.InvoiceBatch.filter({ id: pool.invoice_batch_id });
      return batches[0];
    },
    enabled: !!pool?.invoice_batch_id,
  });

  // Fetch lifecycle events
  const { data: lifecycleEvents = [] } = useQuery({
    queryKey: ['lifecycleEvents', 'pool', poolId],
    queryFn: async () => {
      // Get events related to pool or its allocations
      const allEvents = await base44.entities.LifecycleEvent.list('-created_date', 100);
      const commitmentIds = allocations.map(a => a.commitment_id);
      return allEvents.filter(e => 
        commitmentIds.includes(e.commitment_id) && 
        ['BILLING_STATUS_CHANGED', 'CLIENT_INVOICED', 'CLIENT_PAID'].includes(e.event_type)
      );
    },
    enabled: allocations.length > 0,
  });

  // Fetch commitments for allocation display
  const commitmentIds = useMemo(() => 
    [...new Set(allocations.map(a => a.commitment_id))],
    [allocations]
  );

  const { data: commitments = [] } = useQuery({
    queryKey: ['commitments', commitmentIds],
    queryFn: async () => {
      if (commitmentIds.length === 0) return [];
      const all = await base44.entities.PartCommitment.list();
      return all.filter(c => commitmentIds.includes(c.id));
    },
    enabled: commitmentIds.length > 0,
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const commitmentsMap = useMemo(() => 
    Object.fromEntries(commitments.map(c => [c.id, c])),
    [commitments]
  );

  const partsMap = useMemo(() => 
    Object.fromEntries(parts.map(p => [p.id, p])),
    [parts]
  );

  // Reverse allocation mutation - goes through CommitmentService
  const reverseAllocationMutation = useMutation({
    mutationFn: async ({ allocation_id, reason }) => {
      return await CommitmentActions.reversePoolAllocation({ allocation_id, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poolAllocations'] });
      queryClient.invalidateQueries({ queryKey: ['billingPool'] });
      queryClient.invalidateQueries({ queryKey: ['partCommitments'] });
      toast.success('Allocation reversed successfully');
      setShowReversalModal(null);
      setReversalReason('');
    },
    onError: (error) => {
      toast.error(`Failed to reverse allocation: ${error.message}`);
    }
  });

  // Reverse charge mutation - goes through CommitmentService
  const reverseChargeMutation = useMutation({
    mutationFn: async ({ charge_id, reason }) => {
      return await CommitmentActions.reversePoolCharge({ charge_id, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poolCharges'] });
      queryClient.invalidateQueries({ queryKey: ['billingPool'] });
      toast.success('Charge reversed successfully');
      setShowReversalModal(null);
      setReversalReason('');
    },
    onError: (error) => {
      toast.error(`Failed to reverse charge: ${error.message}`);
    }
  });

  // Recalculate pool mutation
  const recalculateMutation = useMutation({
    mutationFn: async () => {
      return await CommitmentActions.recalculatePoolBalance({ pool_id: poolId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billingPool'] });
      toast.success('Pool recalculated');
    },
    onError: (error) => {
      toast.error(`Recalculation failed: ${error.message}`);
    }
  });

  const handleReversal = () => {
    if (!reversalReason.trim()) {
      toast.error('Please provide a reason for the reversal');
      return;
    }

    if (showReversalModal.type === 'allocation') {
      reverseAllocationMutation.mutate({ 
        allocation_id: showReversalModal.id, 
        reason: reversalReason 
      });
    } else if (showReversalModal.type === 'charge') {
      reverseChargeMutation.mutate({ 
        charge_id: showReversalModal.id, 
        reason: reversalReason 
      });
    }
  };

  const isLoading = loadingPool || loadingAllocations || loadingCharges;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!pool) {
    return (
      <div className="text-center text-gray-500 p-8">
        Pool not found
      </div>
    );
  }

  const invoiced = pool.invoiced_amount || 0;
  const allocated = pool.allocated_total || 0;
  const chargesTotal = pool.charges_total || 0;
  const balance = pool.balance ?? (invoiced - allocated - chargesTotal);
  const paid = pool.paid_amount || 0;
  const isOverdrawn = balance < 0;

  const activeAllocations = allocations.filter(a => !a.is_reversed);
  const reversedAllocations = allocations.filter(a => a.is_reversed);
  const activeCharges = charges.filter(c => !c.is_reversed);
  const reversedCharges = charges.filter(c => c.is_reversed);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <div className="flex items-center gap-3">
              <DollarSign className={cn("w-6 h-6", isOverdrawn ? "text-red-400" : "text-green-400")} />
              <h1 className="text-2xl font-bold text-white">{pool.pool_name}</h1>
              <PoolStatusBadge status={pool.status} />
            </div>
            {pool.qb_invoice_number && (
              <p className="text-sm text-gray-400 mt-1">
                QB Invoice: {pool.qb_invoice_number}
                {pool.qb_exported_at && ` · Exported ${format(new Date(pool.qb_exported_at), 'MMM d, yyyy')}`}
              </p>
            )}
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => recalculateMutation.mutate()}
          disabled={recalculateMutation.isPending}
          className="border-gray-600"
        >
          {recalculateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Recalculate
        </Button>
      </div>

      {/* Overdrawn Warning */}
      {isOverdrawn && (
        <div className="flex items-center gap-3 p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
          <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
          <div>
            <p className="text-red-300 font-medium">Pool Overdrawn</p>
            <p className="text-red-400/70 text-sm">
              Allocations and charges exceed available funds by ${Math.abs(balance).toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Financial Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard label="Invoiced" value={invoiced} color="text-blue-400" />
        <MetricCard label="Paid" value={paid} color="text-green-400" />
        <MetricCard label="Allocated" value={allocated} color="text-purple-400" />
        <MetricCard label="Charges" value={chargesTotal} color="text-orange-400" />
        <MetricCard 
          label="Balance" 
          value={balance} 
          color={isOverdrawn ? "text-red-400" : "text-green-400"} 
          icon={isOverdrawn ? TrendingDown : TrendingUp}
        />
      </div>

      <Tabs defaultValue="allocations" className="w-full">
        <TabsList className="bg-gray-800 border-gray-700">
          <TabsTrigger value="allocations" className="data-[state=active]:bg-gray-700">
            Allocations ({activeAllocations.length})
          </TabsTrigger>
          <TabsTrigger value="charges" className="data-[state=active]:bg-gray-700">
            Charges ({activeCharges.length})
          </TabsTrigger>
          <TabsTrigger value="funding" className="data-[state=active]:bg-gray-700">
            Funding
          </TabsTrigger>
          <TabsTrigger value="audit" className="data-[state=active]:bg-gray-700">
            Audit Trail
          </TabsTrigger>
        </TabsList>

        {/* Allocations Tab */}
        <TabsContent value="allocations">
          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="p-0">
              {allocations.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No allocations</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-700 hover:bg-transparent">
                      <TableHead className="text-gray-400">Commitment</TableHead>
                      <TableHead className="text-gray-400">Part</TableHead>
                      <TableHead className="text-gray-400 text-right">Amount</TableHead>
                      <TableHead className="text-gray-400">Type</TableHead>
                      <TableHead className="text-gray-400">Created</TableHead>
                      <TableHead className="text-gray-400">Status</TableHead>
                      <TableHead className="text-gray-400 w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map(alloc => {
                      const commitment = commitmentsMap[alloc.commitment_id];
                      const part = commitment ? partsMap[commitment.part_id] : null;

                      return (
                        <TableRow 
                          key={alloc.id} 
                          className={cn(
                            "border-gray-700/50",
                            alloc.is_reversed && "opacity-50"
                          )}
                        >
                          <TableCell className="text-white text-sm">
                            {commitment?.id?.slice(0, 8) || 'Unknown'}...
                          </TableCell>
                          <TableCell className="text-gray-300">
                            {part?.part_name || 'Unknown Part'}
                          </TableCell>
                          <TableCell className="text-right text-purple-400 font-medium">
                            ${(alloc.amount_allocated || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
                              {alloc.allocation_type || 'manual'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-400 text-sm">
                            {alloc.created_date ? format(new Date(alloc.created_date), 'MMM d, yyyy') : '-'}
                          </TableCell>
                          <TableCell>
                            {alloc.is_reversed ? (
                              <Badge variant="outline" className="border-red-600 text-red-400 gap-1">
                                <RotateCcw className="w-3 h-3" />
                                Reversed
                              </Badge>
                            ) : (
                              <Badge className="bg-green-600 text-white">Active</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {!alloc.is_reversed && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowReversalModal({ type: 'allocation', id: alloc.id, amount: alloc.amount_allocated })}
                                className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Charges Tab */}
        <TabsContent value="charges">
          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="p-0">
              {charges.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No charges</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-700 hover:bg-transparent">
                      <TableHead className="text-gray-400">Type</TableHead>
                      <TableHead className="text-gray-400">Description</TableHead>
                      <TableHead className="text-gray-400 text-right">Amount</TableHead>
                      <TableHead className="text-gray-400">Source</TableHead>
                      <TableHead className="text-gray-400">Created</TableHead>
                      <TableHead className="text-gray-400">Status</TableHead>
                      <TableHead className="text-gray-400 w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {charges.map(charge => (
                      <TableRow 
                        key={charge.id} 
                        className={cn(
                          "border-gray-700/50",
                          charge.is_reversed && "opacity-50"
                        )}
                      >
                        <TableCell>
                          <Badge variant="outline" className="border-orange-600 text-orange-400 capitalize">
                            {charge.charge_type?.replace('_', ' ') || 'Other'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-300">
                          {charge.description || '-'}
                        </TableCell>
                        <TableCell className="text-right text-orange-400 font-medium">
                          ${(charge.amount || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-gray-400 text-sm">
                          {charge.related_vendor_invoice_id ? 'Vendor Invoice' : 
                           charge.related_po_line_id ? 'PO Line' : 
                           'Manual'}
                        </TableCell>
                        <TableCell className="text-gray-400 text-sm">
                          {charge.created_date ? format(new Date(charge.created_date), 'MMM d, yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          {charge.is_reversed ? (
                            <Badge variant="outline" className="border-red-600 text-red-400 gap-1">
                              <RotateCcw className="w-3 h-3" />
                              Reversed
                            </Badge>
                          ) : (
                            <Badge className="bg-green-600 text-white">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!charge.is_reversed && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowReversalModal({ type: 'charge', id: charge.id, amount: charge.amount })}
                              className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Funding Tab */}
        <TabsContent value="funding">
          <Card className="bg-gray-900/50 border-gray-700">
            <CardHeader className="border-b border-gray-700/50">
              <CardTitle className="text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Funding Source
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {invoiceBatch ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">Batch Name</p>
                      <p className="text-white font-medium">{invoiceBatch.batch_name}</p>
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">QB Invoice #</p>
                      <p className="text-white font-medium">{invoiceBatch.qb_invoice_number || '-'}</p>
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">Status</p>
                      <Badge className={cn(
                        invoiceBatch.status === 'paid' ? 'bg-green-600' :
                        invoiceBatch.status === 'invoiced' ? 'bg-blue-600' :
                        'bg-gray-600',
                        'text-white'
                      )}>
                        {invoiceBatch.status}
                      </Badge>
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">Total Amount</p>
                      <p className="text-green-400 font-medium">${(invoiceBatch.total_amount || 0).toFixed(2)}</p>
                    </div>
                  </div>

                  {invoiceBatch.payment_received_at && (
                    <div className="p-3 bg-green-900/20 border border-green-700/50 rounded-lg flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                      <div>
                        <p className="text-green-300 font-medium">Payment Received</p>
                        <p className="text-green-400/70 text-sm">
                          {format(new Date(invoiceBatch.payment_received_at), 'MMMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No linked invoice batch</p>
                  <p className="text-sm mt-1">Pool was created manually or via direct payment</p>
                </div>
              )}

              {/* Pool creation info */}
              <div className="mt-4 pt-4 border-t border-gray-700/50">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Created:</span>
                    <span className="text-white ml-2">
                      {pool.created_date ? format(new Date(pool.created_date), 'MMM d, yyyy h:mm a') : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Pool Version:</span>
                    <span className="text-white ml-2">{pool.pool_version || 1}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Trail Tab */}
        <TabsContent value="audit">
          <Card className="bg-gray-900/50 border-gray-700">
            <CardHeader className="border-b border-gray-700/50">
              <CardTitle className="text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-400" />
                Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {lifecycleEvents.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No related lifecycle events
                </div>
              ) : (
                <div className="divide-y divide-gray-700/50">
                  {lifecycleEvents.map(event => (
                    <div key={event.id} className="p-4 flex items-start gap-4">
                      <div className="p-2 bg-gray-800 rounded-lg">
                        <EventTypeIcon type={event.event_type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-medium">
                            {formatEventType(event.event_type)}
                          </span>
                          <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
                            {event.trigger_source?.replace('_', ' ')}
                          </Badge>
                        </div>
                        {event.notes && (
                          <p className="text-gray-400 text-sm">{event.notes}</p>
                        )}
                        <p className="text-gray-500 text-xs mt-1">
                          {event.created_date ? format(new Date(event.created_date), 'MMM d, yyyy h:mm a') : '-'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reversal Confirmation Modal */}
      {showReversalModal && (
        <Dialog open onOpenChange={() => { setShowReversalModal(null); setReversalReason(''); }}>
          <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-red-400" />
                Reverse {showReversalModal.type === 'allocation' ? 'Allocation' : 'Charge'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
                <p className="text-red-300">
                  You are about to reverse a ${showReversalModal.amount?.toFixed(2)} {showReversalModal.type}.
                </p>
                <p className="text-red-400/70 text-sm mt-1">
                  This action will update pool balances and cannot be undone.
                </p>
              </div>

              <div>
                <Label className="text-gray-300">Reason for reversal *</Label>
                <Textarea
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Explain why this is being reversed..."
                  className="bg-gray-800 border-gray-600 mt-1"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={() => { setShowReversalModal(null); setReversalReason(''); }}
                className="border-gray-600"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleReversal}
                disabled={!reversalReason.trim() || reverseAllocationMutation.isPending || reverseChargeMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {(reverseAllocationMutation.isPending || reverseChargeMutation.isPending) ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-2" />
                )}
                Confirm Reversal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Helper Components
function MetricCard({ label, value, color, icon: Icon }) {
  return (
    <div className="p-3 bg-gray-800/50 rounded-lg">
      <div className="flex items-center justify-between mb-1">
        <span className="text-gray-400 text-sm">{label}</span>
        {Icon && <Icon className={cn("w-4 h-4", color)} />}
      </div>
      <p className={cn("text-xl font-bold", color)}>${value.toFixed(2)}</p>
    </div>
  );
}

function PoolStatusBadge({ status }) {
  const config = {
    draft: { label: 'Draft', color: 'bg-gray-600', icon: null },
    invoiced: { label: 'Invoiced', color: 'bg-blue-600', icon: FileText },
    paid: { label: 'Paid', color: 'bg-green-600', icon: CheckCircle2 },
    closed: { label: 'Closed', color: 'bg-gray-500', icon: Lock },
    overdrawn: { label: 'Overdrawn', color: 'bg-red-600', icon: AlertTriangle },
  }[status] || { label: status, color: 'bg-gray-600', icon: null };

  const Icon = config.icon;

  return (
    <Badge className={cn(config.color, "text-white gap-1")}>
      {Icon && <Icon className="w-3 h-3" />}
      {config.label}
    </Badge>
  );
}

function EventTypeIcon({ type }) {
  const icons = {
    BILLING_STATUS_CHANGED: DollarSign,
    CLIENT_INVOICED: FileText,
    CLIENT_PAID: CheckCircle2,
  };
  const Icon = icons[type] || Clock;
  return <Icon className="w-4 h-4 text-purple-400" />;
}

function formatEventType(type) {
  const labels = {
    BILLING_STATUS_CHANGED: 'Billing Status Changed',
    CLIENT_INVOICED: 'Client Invoiced',
    CLIENT_PAID: 'Client Payment',
  };
  return labels[type] || type.replace(/_/g, ' ');
}