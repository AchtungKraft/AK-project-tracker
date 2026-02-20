import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp,
  TrendingDown,
  Package,
  Truck,
  FileText,
  Lock,
  Clock,
  Calendar
} from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInDays, parseISO } from "date-fns";
// LEGACY ONLY: Pool components not rendered for forward model
import PoolPanel from "./PoolPanel";
import CoverageBadge from "./CoverageBadge";
// Phase 6.1: PO Cost Review Card for forward model
import POCostReviewCard from "./POCostReviewCard";
// Phase 6.2: QB Export Status Cards
import { QBNeedsExportCard, QBExportFailedCard } from "./QBExportStatusCards";
// Phase 8: Forward Invoice Dashboard for forward model projects
import ForwardInvoiceDashboard from "./ForwardInvoiceDashboard";

/**
 * InvoiceAgingSummary - Shows aging buckets for outstanding invoices
 * Forward model only - derives from InvoiceBatch.due_date
 */
function InvoiceAgingSummary({ invoiceBatches }) {
  const agingData = useMemo(() => {
    const today = new Date();
    const unpaidBatches = invoiceBatches.filter(b => 
      b.status !== 'paid' && b.status !== 'voided' && b.status !== 'draft'
    );
    
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let oldestOverdueDays = 0;
    let oldestInvoice = null;
    
    // Aging buckets
    const buckets = {
      current: 0,      // Not yet due
      '1-30': 0,       // 1-30 days overdue
      '31-60': 0,      // 31-60 days overdue
      '61-90': 0,      // 61-90 days overdue
      '90+': 0,        // Over 90 days overdue
    };
    
    for (const batch of unpaidBatches) {
      const amount = batch.total_amount || 0;
      totalOutstanding += amount;
      
      // Calculate days overdue
      const dueDate = batch.due_date ? parseISO(batch.due_date) : null;
      if (dueDate) {
        const daysOverdue = differenceInDays(today, dueDate);
        
        if (daysOverdue <= 0) {
          buckets.current += amount;
        } else {
          totalOverdue += amount;
          
          // Track oldest overdue
          if (daysOverdue > oldestOverdueDays) {
            oldestOverdueDays = daysOverdue;
            oldestInvoice = batch;
          }
          
          // Bucket assignment
          if (daysOverdue <= 30) {
            buckets['1-30'] += amount;
          } else if (daysOverdue <= 60) {
            buckets['31-60'] += amount;
          } else if (daysOverdue <= 90) {
            buckets['61-90'] += amount;
          } else {
            buckets['90+'] += amount;
          }
        }
      } else {
        // No due date = treat as current
        buckets.current += amount;
      }
    }
    
    return {
      totalOutstanding,
      totalOverdue,
      oldestOverdueDays,
      oldestInvoice,
      buckets,
      unpaidCount: unpaidBatches.length,
    };
  }, [invoiceBatches]);
  
  if (agingData.unpaidCount === 0) return null;
  
  return (
    <Card className="bg-gray-900/50 border-gray-700">
      <CardHeader className="border-b border-gray-700/50 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-400" />
            Invoice Aging
            <Badge className="bg-blue-600 text-white text-xs ml-2">Forward Model</Badge>
          </CardTitle>
          <Badge variant="outline" className="border-gray-600 text-gray-400">
            {agingData.unpaidCount} outstanding
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {/* Summary Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <MetricCard
            label="Total Outstanding"
            value={agingData.totalOutstanding}
            color="text-yellow-400"
          />
          <MetricCard
            label="Total Overdue"
            value={agingData.totalOverdue}
            color={agingData.totalOverdue > 0 ? "text-red-400" : "text-green-400"}
            icon={agingData.totalOverdue > 0 ? AlertTriangle : CheckCircle2}
          />
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Oldest Outstanding</p>
            {agingData.oldestOverdueDays > 0 ? (
              <p className="text-lg font-semibold text-red-400">
                {agingData.oldestOverdueDays} days
              </p>
            ) : (
              <p className="text-lg font-semibold text-green-400">Current</p>
            )}
          </div>
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Collection Rate</p>
            <p className="text-lg font-semibold text-blue-400">
              {agingData.totalOutstanding > 0 
                ? ((1 - (agingData.totalOverdue / agingData.totalOutstanding)) * 100).toFixed(0)
                : 100}%
            </p>
          </div>
        </div>

        {/* Aging Buckets */}
        <div className="grid grid-cols-5 gap-2">
          <AgingBucket label="Current" amount={agingData.buckets.current} color="green" />
          <AgingBucket label="1-30 Days" amount={agingData.buckets['1-30']} color="yellow" />
          <AgingBucket label="31-60 Days" amount={agingData.buckets['31-60']} color="orange" />
          <AgingBucket label="61-90 Days" amount={agingData.buckets['61-90']} color="red" />
          <AgingBucket label="90+ Days" amount={agingData.buckets['90+']} color="red" severe />
        </div>
        
        {/* Alert for severely overdue */}
        {agingData.oldestOverdueDays > 60 && agingData.oldestInvoice && (
          <div className="mt-3 p-3 bg-red-900/20 border border-red-600/30 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5" />
              <div>
                <p className="text-red-400 text-sm font-medium">Severely Overdue Invoice</p>
                <p className="text-red-400/70 text-xs">
                  Invoice {agingData.oldestInvoice.invoice_number || agingData.oldestInvoice.batch_name} 
                  is {agingData.oldestOverdueDays} days overdue
                  (${(agingData.oldestInvoice.total_amount || 0).toLocaleString()})
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgingBucket({ label, amount, color, severe = false }) {
  const colorClasses = {
    green: 'bg-green-900/30 border-green-700/50 text-green-400',
    yellow: 'bg-yellow-900/30 border-yellow-700/50 text-yellow-400',
    orange: 'bg-orange-900/30 border-orange-700/50 text-orange-400',
    red: severe 
      ? 'bg-red-900/50 border-red-600/50 text-red-400' 
      : 'bg-red-900/30 border-red-700/50 text-red-400',
  };
  
  return (
    <div className={cn(
      "p-2 rounded-lg border text-center",
      colorClasses[color]
    )}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={cn("text-sm font-medium", amount > 0 ? '' : 'text-gray-500')}>
        ${amount.toLocaleString()}
      </p>
    </div>
  );
}

/**
 * FINANCIAL MODEL ROUTING:
 * - forward: Shows Cost Summary (PO-based) + Revenue Summary (InvoiceBatch-based) + Client Invoices
 * - legacy: Shows Pool Panel, Retail Exposure, Pool Summary, Pool Charges, Coverage Badges
 * 
 * FORWARD MODEL EXCLUDES: billing_status, exposure_gap, covered_retail_total, BillingPool, VendorInvoice
 */

/**
 * ProjectFinancialDashboard
 * 
 * Displays comprehensive financial status using PRECOMPUTED fields only.
 * No live aggregation queries - all values from entity fields.
 * 
 * Sections:
 * 1. Retail Exposure Summary
 * 2. Pool Summary Table
 * 3. Pool Charges Breakdown
 * 4. Commitment Financial Table
 * 5. Procurement Cost Table
 */
export default function ProjectFinancialDashboard({ projectId }) {
  // Fetch project to determine financial model
  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const projects = await base44.entities.Project.filter({ id: projectId });
      return projects[0];
    },
    enabled: !!projectId,
  });

  const isForwardModel = project?.financial_model_version === 'forward';

  // FORWARD MODEL: Fetch revenue summary from backend
  const { data: revenueSummary, isLoading: loadingRevenue, error: revenueError } = useQuery({
    queryKey: ['projectRevenueSummary', projectId],
    queryFn: async () => {
      const res = await base44.functions.invoke('getProjectRevenueSummary', { project_id: projectId });
      // Handle 404 or error responses gracefully
      if (res.data?.code === 'PROJECT_NOT_FOUND' || res.data?.code === 'MISSING_PROJECT_ID') {
        return { data: null, notFound: true };
      }
      return res;
    },
    enabled: !!projectId && isForwardModel,
  });

  // FORWARD MODEL: Fetch cost summary from backend (PO lines as cost authority)
  const { data: costSummary, isLoading: loadingCost } = useQuery({
    queryKey: ['projectCostSummary', projectId],
    queryFn: async () => {
      const res = await base44.functions.invoke('getProjectCostSummary', { project_id: projectId });
      if (res.data?.code === 'PROJECT_NOT_FOUND' || res.data?.code === 'LEGACY_MODEL_NOT_SUPPORTED') {
        return { data: null };
      }
      return res;
    },
    enabled: !!projectId && isForwardModel,
  });

  // Fetch all data in parallel - no aggregation, just reads
  const { data: commitments = [], isLoading: loadingCommitments } = useQuery({
    queryKey: ['partCommitments', projectId],
    queryFn: () => base44.entities.PartCommitment.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  // LEGACY MODEL ONLY: Fetch pool data
  const { data: pools = [], isLoading: loadingPools } = useQuery({
    queryKey: ['billingPools', projectId],
    queryFn: () => base44.entities.BillingPool.filter({ project_id: projectId }),
    enabled: !!projectId && !isForwardModel,
  });

  const { data: charges = [], isLoading: loadingCharges } = useQuery({
    queryKey: ['poolCharges', projectId],
    queryFn: () => base44.entities.PoolCharge.filter({ project_id: projectId }),
    enabled: !!projectId && !isForwardModel,
  });

  const { data: lineItems = [], isLoading: loadingLineItems } = useQuery({
    queryKey: ['purchaseLineItems', projectId],
    queryFn: async () => {
      const commitmentIds = commitments.map(c => c.id);
      if (commitmentIds.length === 0) return [];
      const all = await base44.entities.PartPurchaseLineItem.list();
      return all.filter(li => commitmentIds.includes(li.commitment_id));
    },
    enabled: commitments.length > 0,
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const partsMap = useMemo(() => 
    Object.fromEntries(parts.map(p => [p.id, p])), 
    [parts]
  );

  const poolsMap = useMemo(() => 
    Object.fromEntries(pools.map(p => [p.id, p])), 
    [pools]
  );

  // ============================================
  // FORWARD MODEL: Use revenue summary from backend
  // Does NOT read: exposure_gap, billing_status, pool balances
  // ============================================
  const forwardRevenueSummary = useMemo(() => {
    if (!isForwardModel) return null;
    // Handle 404/not found gracefully
    if (revenueSummary?.notFound || !revenueSummary?.data) return null;
    const data = revenueSummary.data;
    return {
      totalBillable: data.total_billable ?? 0,
      totalInvoiced: data.total_invoiced ?? 0,
      totalCollected: data.total_collected ?? 0,
      remainingToInvoice: data.remaining_to_invoice ?? 0,
      outstandingReceivable: data.outstanding_receivable ?? 0,
      commitmentCount: data.commitment_count ?? 0,
      uninvoicedCount: data.uninvoiced_count ?? 0,
      invoicedCount: data.invoiced_count ?? 0,
      paidCount: data.paid_count ?? 0,
      invoiceCoveragePct: data.invoice_coverage_pct ?? 0,
      collectionRatePct: data.collection_rate_pct ?? 0,
      invoiceBatches: data.invoice_batches ?? [],
    };
  }, [isForwardModel, revenueSummary]);
  
  // Handle project not found for forward model
  const projectNotFound = isForwardModel && revenueSummary?.notFound;

  // LEGACY MODEL: Read precomputed totals from commitment fields
  // NULL SAFETY: All pool-related fields use (value ?? 0)
  const exposureSummary = useMemo(() => {
    if (isForwardModel) return null; // Skip for forward model
    const active = commitments.filter(c => !['cancelled', 'closed'].includes(c.commitment_status));
    return {
      totalPlannedRetail: active.reduce((sum, c) => sum + (c.planned_retail_total ?? 0), 0),
      totalCoveredRetail: active.reduce((sum, c) => sum + (c.covered_retail_total ?? 0), 0),
      totalExposureGap: active.reduce((sum, c) => sum + Math.max(0, c.exposure_gap ?? 0), 0),
      totalInvoicedRetail: active.reduce((sum, c) => sum + (c.invoiced_retail_total ?? 0), 0),
      commitmentCount: active.length,
      coveredCount: active.filter(c => (c.exposure_gap ?? 0) <= 0).length,
      partialCount: active.filter(c => (c.exposure_gap ?? 0) > 0 && (c.covered_retail_total ?? 0) > 0).length,
      uncoveredCount: active.filter(c => (c.exposure_gap ?? 0) > 0 && (c.covered_retail_total ?? 0) === 0).length,
    };
  }, [commitments, isForwardModel]);

  // LEGACY MODEL: Pool summary from precomputed fields
  // NULL SAFETY: All pool fields use (value ?? 0)
  const poolSummary = useMemo(() => {
    if (isForwardModel) return null; // Skip for forward model
    return {
      totalInvoiced: pools.reduce((sum, p) => sum + (p.invoiced_amount ?? 0), 0),
      totalPaid: pools.reduce((sum, p) => sum + (p.paid_amount ?? 0), 0),
      totalAllocated: pools.reduce((sum, p) => sum + (p.allocated_total ?? 0), 0),
      totalCharges: pools.reduce((sum, p) => sum + (p.charges_total ?? 0), 0),
      totalBalance: pools.reduce((sum, p) => sum + (p.balance ?? 0), 0),
      overdrawnCount: pools.filter(p => p.status === 'overdrawn').length,
    };
  }, [pools, isForwardModel]);

  // LEGACY MODEL: Charges by type from precomputed fields
  const chargesByType = useMemo(() => {
    if (isForwardModel) return {}; // Skip for forward model
    const grouped = {};
    charges.filter(c => !c.is_reversed).forEach(charge => {
      const type = charge.charge_type || 'other';
      if (!grouped[type]) {
        grouped[type] = { count: 0, total: 0 };
      }
      grouped[type].count++;
      grouped[type].total += charge.amount || 0;
    });
    return grouped;
  }, [charges, isForwardModel]);

  // FORWARD MODEL: Cost summary from backend (PO lines as sole cost authority)
  // Uses Order.freight_cost and Order.tariff_cost (header level)
  const forwardCostSummary = useMemo(() => {
    if (!isForwardModel) return null;
    if (!costSummary?.data) return null;
    const data = costSummary.data;
    return {
      // Parts cost (from PO lines)
      orderedPartsCost: data.ordered_parts_cost ?? data.ordered_cost ?? 0,
      receivedPartsCost: data.received_parts_cost ?? data.received_cost ?? 0,
      unreceivedPartsCost: data.unreceived_parts_cost ?? data.unreceived_cost ?? 0,
      // Legacy aliases for backward compat
      orderedCost: data.ordered_parts_cost ?? data.ordered_cost ?? 0,
      receivedCost: data.received_parts_cost ?? data.received_cost ?? 0,
      unreceivedCost: data.unreceived_parts_cost ?? data.unreceived_cost ?? 0,
      // Freight + Tariff (from Order header)
      totalFreight: data.total_freight ?? 0,
      totalTariff: data.total_tariff ?? 0,
      // Landed total
      totalLandedCost: data.total_landed_cost ?? 0,
      // Status
      receivedPct: data.received_pct ?? 0,
      lockedCostCount: data.locked_cost_count ?? 0,
      costReviewCount: data.cost_review_count ?? 0,
      lineItemCount: data.line_item_count ?? 0,
      orderCount: data.order_count ?? 0,
      costAuthority: data.cost_authority,
      freightTariffSource: data.freight_tariff_source,
    };
  }, [isForwardModel, costSummary]);

  // LEGACY MODEL: Procurement costs from precomputed line item fields
  const procurementSummary = useMemo(() => {
    if (isForwardModel) return null; // Forward model uses forwardCostSummary
    const activeLines = lineItems.filter(li => li.status !== 'Cancelled');
    return {
      totalOrderedCost: activeLines.reduce((sum, li) => sum + (li.line_total || 0), 0),
      totalFreightCost: activeLines.reduce((sum, li) => sum + (li.freight_cost || 0), 0),
      totalTariffCost: activeLines.reduce((sum, li) => sum + (li.tariff_cost || 0), 0),
      lockedCostCount: activeLines.filter(li => li.cost_locked_at).length,
      totalLineItems: activeLines.length,
    };
  }, [lineItems, isForwardModel]);

  const isLoading = loadingProject || loadingCommitments || 
    (isForwardModel ? (loadingRevenue || loadingCost) : (loadingPools || loadingCharges)) || 
    loadingLineItems;

  if (isLoading) {
    return (
      <Card className="bg-gray-900/50 border-gray-700">
        <CardContent className="p-8 text-center text-gray-500">
          Loading financial data...
        </CardContent>
      </Card>
    );
  }

  // Handle project not found gracefully
  if (projectNotFound) {
    return (
      <Card className="bg-gray-900/50 border-gray-700">
        <CardContent className="p-8 text-center text-gray-500">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
          Project not found or financial data unavailable.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ============================================ */}
      {/* FORWARD MODEL: Invoice Dashboard (Replaces Pool UI) */}
      {/* ============================================ */}
      {isForwardModel ? (
        <ForwardInvoiceDashboard 
          projectId={projectId} 
          onCreateInvoice={() => {
            // Navigate to invoice creation or open modal
            toast.info('Invoice creation modal - wire to createInvoiceBatch');
          }}
        />
      ) : (
        <>
          {/* LEGACY MODEL: Retail Exposure Summary & Pool UI below */}
        </>
      )}

      {/* ============================================ */}
      {/* FORWARD MODEL: Revenue Summary (Invoice-based) */}
      {/* ============================================ */}
      {isForwardModel && forwardRevenueSummary && (
        <Card className="bg-gray-900/50 border-gray-700">
          <CardHeader className="border-b border-gray-700/50 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                Revenue Summary
                <Badge className="bg-blue-600 text-white text-xs ml-2">Forward Model</Badge>
              </CardTitle>
              <Badge variant="outline" className="border-gray-600 text-gray-400">
                {forwardRevenueSummary.commitmentCount} commitments
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <MetricCard
                label="Total Billable"
                value={forwardRevenueSummary.totalBillable}
                color="text-blue-400"
              />
              <MetricCard
                label="Invoiced"
                value={forwardRevenueSummary.totalInvoiced}
                color="text-purple-400"
              />
              <MetricCard
                label="Collected"
                value={forwardRevenueSummary.totalCollected}
                color="text-green-400"
              />
              <MetricCard
                label="Remaining to Invoice"
                value={forwardRevenueSummary.remainingToInvoice}
                color={forwardRevenueSummary.remainingToInvoice > 0 ? "text-yellow-400" : "text-green-400"}
                icon={forwardRevenueSummary.remainingToInvoice > 0 ? AlertTriangle : CheckCircle2}
              />
            </div>

            {/* Invoice Status Distribution */}
            <div className="flex items-center gap-4 p-3 bg-gray-800/30 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span className="text-gray-300">{forwardRevenueSummary.uninvoicedCount} Uninvoiced</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" />
                <span className="text-gray-300">{forwardRevenueSummary.invoicedCount} Invoiced</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-gray-300">{forwardRevenueSummary.paidCount} Paid</span>
              </div>
              <div className="ml-auto">
                <span className="text-gray-400 text-sm">
                  Coverage: {forwardRevenueSummary.invoiceCoveragePct.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Outstanding Receivable */}
            {forwardRevenueSummary.outstandingReceivable > 0 && (
              <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-yellow-400 text-sm">Outstanding Receivable</span>
                  <span className="text-yellow-400 font-medium">
                    ${forwardRevenueSummary.outstandingReceivable.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ============================================ */}
      {/* FORWARD MODEL: Invoice Aging Summary */}
      {/* ============================================ */}
      {isForwardModel && forwardRevenueSummary?.invoiceBatches?.length > 0 && (
        <InvoiceAgingSummary invoiceBatches={forwardRevenueSummary.invoiceBatches} />
      )}

      {/* ============================================ */}
      {/* FORWARD MODEL: PO Lines Needing Cost Review */}
      {/* Phase 6.1: Surface for $0 / missing cost PO lines */}
      {/* ============================================ */}
      {isForwardModel && (
        <POCostReviewCard projectId={projectId} />
      )}

      {/* ============================================ */}
      {/* FORWARD MODEL: QB Export Status Cards */}
      {/* Phase 6.2: Show invoices needing export + failed exports */}
      {/* ============================================ */}
      {isForwardModel && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <QBNeedsExportCard projectId={projectId} />
          <QBExportFailedCard projectId={projectId} />
        </div>
      )}

      {/* ============================================ */}
      {/* FORWARD MODEL: Cost Summary (PO Line Authority) */}
      {/* Does NOT read: commitment.unit_cost_snapshot, commitment.planned_cost_total, Part.cost */}
      {/* Freight/Tariff from Order header, not line items */}
      {/* ============================================ */}
      {isForwardModel && forwardCostSummary && (
        <Card className="bg-gray-900/50 border-gray-700">
          <CardHeader className="border-b border-gray-700/50 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-orange-400" />
                Cost Summary
                <Badge className="bg-blue-600 text-white text-xs ml-2">Forward Model</Badge>
                <Badge variant="outline" className="border-orange-600 text-orange-400 text-xs ml-1">
                  <Lock className="w-3 h-3 mr-1" />
                  PO Authority
                </Badge>
              </CardTitle>
              <Badge variant="outline" className="border-gray-600 text-gray-400">
                {forwardCostSummary.lineItemCount} lines / {forwardCostSummary.orderCount} POs
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {/* Parts Cost Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <MetricCard
                label="Ordered Parts Cost"
                value={forwardCostSummary.orderedPartsCost}
                color="text-blue-400"
              />
              <MetricCard
                label="Received Parts Cost"
                value={forwardCostSummary.receivedPartsCost}
                color="text-green-400"
              />
              <MetricCard
                label="Unreceived Parts Cost"
                value={forwardCostSummary.unreceivedPartsCost}
                color={forwardCostSummary.unreceivedPartsCost > 0 ? "text-yellow-400" : "text-green-400"}
              />
            </div>
            
            {/* Freight + Tariff + Landed Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <MetricCard
                label="Freight"
                value={forwardCostSummary.totalFreight}
                color="text-orange-400"
              />
              <MetricCard
                label="Tariff/Duty"
                value={forwardCostSummary.totalTariff}
                color="text-red-400"
              />
              <MetricCard
                label="Total Landed Cost"
                value={forwardCostSummary.totalLandedCost}
                color="text-purple-400"
              />
            </div>

            {/* Status Row */}
            <div className="flex flex-wrap items-center gap-4 p-3 bg-gray-800/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-400" />
                <span className="text-gray-300">{forwardCostSummary.receivedPct.toFixed(1)}% Received</span>
              </div>
              {forwardCostSummary.lockedCostCount > 0 && (
                <div className="flex items-center gap-1">
                  <Lock className="w-4 h-4 text-green-400" />
                  <span className="text-gray-400 text-sm">
                    {forwardCostSummary.lockedCostCount} locked
                  </span>
                </div>
              )}
              {forwardCostSummary.costReviewCount > 0 && (
                <div className="flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <span className="text-yellow-400 text-sm">
                    {forwardCostSummary.costReviewCount} need cost review
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================ */}
      {/* LEGACY MODEL ONLY: Retail Exposure Summary (Pool-based) */}
      {/* NOT rendered for forward model - uses exposure_gap, covered_retail_total */}
      {/* ============================================ */}
      {!isForwardModel && exposureSummary && (
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader className="border-b border-gray-700/50 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              Retail Exposure Summary
              <Badge className="bg-gray-600 text-white text-xs ml-2">Legacy</Badge>
            </CardTitle>
            <Badge variant="outline" className="border-gray-600 text-gray-400">
              {exposureSummary.commitmentCount} commitments
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <MetricCard
              label="Planned Retail"
              value={exposureSummary.totalPlannedRetail}
              color="text-blue-400"
            />
            <MetricCard
              label="Covered Retail"
              value={exposureSummary.totalCoveredRetail}
              color="text-green-400"
            />
            <MetricCard
              label="Invoiced Retail"
              value={exposureSummary.totalInvoicedRetail}
              color="text-purple-400"
            />
            <MetricCard
              label="Exposure Gap"
              value={exposureSummary.totalExposureGap}
              color={exposureSummary.totalExposureGap > 0 ? "text-red-400" : "text-green-400"}
              icon={exposureSummary.totalExposureGap > 0 ? AlertTriangle : CheckCircle2}
            />
          </div>

          {/* Coverage Distribution */}
          <div className="flex items-center gap-4 p-3 bg-gray-800/30 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-gray-300">{exposureSummary.coveredCount} Covered</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="text-gray-300">{exposureSummary.partialCount} Partial</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-gray-300">{exposureSummary.uncoveredCount} Uncovered</span>
            </div>
            <div className="ml-auto">
              <span className="text-gray-400 text-sm">
                Coverage: {exposureSummary.totalPlannedRetail > 0 
                  ? ((exposureSummary.totalCoveredRetail / exposureSummary.totalPlannedRetail) * 100).toFixed(1)
                  : 0}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ============================================ */}
      {/* FORWARD MODEL: Invoice Batches Table */}
      {/* ============================================ */}
      {isForwardModel && forwardRevenueSummary?.invoiceBatches?.length > 0 && (
        <Card className="bg-gray-900/50 border-gray-700">
          <CardHeader className="border-b border-gray-700/50 pb-3">
            <CardTitle className="text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-400" />
              Client Invoices
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700 hover:bg-transparent">
                  <TableHead className="text-gray-400">Invoice</TableHead>
                  <TableHead className="text-gray-400">Date</TableHead>
                  <TableHead className="text-gray-400 text-right">Amount</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400">Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forwardRevenueSummary.invoiceBatches.map(batch => (
                  <TableRow key={batch.id} className="border-gray-700/50">
                    <TableCell className="text-white font-medium">
                      {batch.invoice_number || batch.batch_name}
                    </TableCell>
                    <TableCell className="text-gray-400">
                      {batch.invoice_date || '-'}
                    </TableCell>
                    <TableCell className="text-right text-green-400">
                      ${(batch.total_amount ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(
                        batch.status === 'paid' ? 'bg-green-600' :
                        batch.status === 'sent' || batch.status === 'invoiced' ? 'bg-purple-600' :
                        'bg-gray-600'
                      )}>
                        {batch.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {batch.payment_received_at ? new Date(batch.payment_received_at).toLocaleDateString() : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ============================================ */}
      {/* LEGACY MODEL: Pool Summary Table */}
      {/* ============================================ */}
      {!isForwardModel && poolSummary && (
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader className="border-b border-gray-700/50 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-400" />
              Pool Summary
              <Badge className="bg-gray-600 text-white text-xs ml-2">Legacy</Badge>
            </CardTitle>
            {poolSummary.overdrawnCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" />
                {poolSummary.overdrawnCount} Overdrawn
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {pools.length === 0 ? (
            <div className="p-4 text-center text-gray-500">No billing pools configured</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-700 hover:bg-transparent">
                    <TableHead className="text-gray-400">Pool</TableHead>
                    <TableHead className="text-gray-400 text-right">Invoiced</TableHead>
                    <TableHead className="text-gray-400 text-right">Paid</TableHead>
                    <TableHead className="text-gray-400 text-right">Allocated</TableHead>
                    <TableHead className="text-gray-400 text-right">Charges</TableHead>
                    <TableHead className="text-gray-400 text-right">Balance</TableHead>
                    <TableHead className="text-gray-400">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pools.map(pool => (
                    <TableRow key={pool.id} className="border-gray-700/50">
                      <TableCell className="text-white font-medium">{pool.pool_name}</TableCell>
                      <TableCell className="text-right text-blue-400">${(pool.invoiced_amount ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-green-400">${(pool.paid_amount ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-purple-400">${(pool.allocated_total ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-orange-400">${(pool.charges_total ?? 0).toFixed(2)}</TableCell>
                      <TableCell className={cn(
                        "text-right font-medium",
                        (pool.balance ?? 0) < 0 ? "text-red-400" : "text-green-400"
                      )}>
                        ${(pool.balance ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <PoolStatusBadge status={pool.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals Row */}
                  <TableRow className="border-gray-700 bg-gray-800/30 font-medium">
                    <TableCell className="text-white">TOTAL</TableCell>
                    <TableCell className="text-right text-blue-400">${poolSummary.totalInvoiced.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-green-400">${poolSummary.totalPaid.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-purple-400">${poolSummary.totalAllocated.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-orange-400">${poolSummary.totalCharges.toFixed(2)}</TableCell>
                    <TableCell className={cn(
                      "text-right",
                      poolSummary.totalBalance < 0 ? "text-red-400" : "text-green-400"
                    )}>
                      ${poolSummary.totalBalance.toFixed(2)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
      )}

      {/* ============================================ */}
      {/* LEGACY MODEL: Pool Charges Breakdown */}
      {/* ============================================ */}
      {!isForwardModel && (
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader className="border-b border-gray-700/50 pb-3">
          <CardTitle className="text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-orange-400" />
            Pool Charges Breakdown
            <Badge className="bg-gray-600 text-white text-xs ml-2">Legacy</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {Object.keys(chargesByType).length === 0 ? (
            <div className="text-center text-gray-500">No charges recorded</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(chargesByType).map(([type, data]) => (
                <div key={type} className="p-3 bg-gray-800/50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-400 text-sm capitalize">{type.replace('_', ' ')}</span>
                    <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
                      {data.count}
                    </Badge>
                  </div>
                  <p className="text-lg font-bold text-orange-400">${data.total.toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      <Tabs defaultValue="commitments" className="w-full">
        <TabsList className="bg-gray-800 border-gray-700">
          <TabsTrigger value="commitments" className="data-[state=active]:bg-gray-700">
            Commitments ({commitments.length})
          </TabsTrigger>
          <TabsTrigger value="procurement" className="data-[state=active]:bg-gray-700">
            Procurement ({lineItems.length})
          </TabsTrigger>
        </TabsList>

        {/* Section 4: Commitment Financial Table */}
        {/* FORWARD MODEL: Shows Part, Qty, Unit Retail, Total Retail, Status */}
        {/* LEGACY MODEL: Shows Part, Qty, Unit Retail, Planned, Covered, Exposure, Coverage, Status */}
        <TabsContent value="commitments">
          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="p-0">
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-gray-900">
                    <TableRow className="border-gray-700 hover:bg-transparent">
                      <TableHead className="text-gray-400">Part</TableHead>
                      <TableHead className="text-gray-400 text-center">Qty</TableHead>
                      <TableHead className="text-gray-400 text-right">Unit Retail</TableHead>
                      <TableHead className="text-gray-400 text-right">Total Retail</TableHead>
                      {/* LEGACY ONLY: Exposure columns */}
                      {!isForwardModel && (
                        <>
                          <TableHead className="text-gray-400 text-right">Covered</TableHead>
                          <TableHead className="text-gray-400 text-right">Exposure</TableHead>
                          <TableHead className="text-gray-400">Coverage</TableHead>
                        </>
                      )}
                      <TableHead className="text-gray-400">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commitments
                      .filter(c => c.commitment_status !== 'cancelled')
                      .map(commitment => {
                        const part = partsMap[commitment.part_id];
                        const lineItem = lineItems.find(li => li.commitment_id === commitment.id);
                        // LEGACY ONLY: exposure_gap field
                        const exposureGap = !isForwardModel ? (commitment.exposure_gap || 0) : 0;
                        
                        return (
                          <TableRow key={commitment.id} className="border-gray-700/50">
                            <TableCell>
                              <div>
                                <p className="text-white text-sm">{part?.part_name || 'Unknown'}</p>
                                {part?.vendor_part_number && (
                                  <p className="text-xs text-gray-500">{part.vendor_part_number}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-white">
                              {commitment.qty_committed}
                            </TableCell>
                            <TableCell className="text-right text-gray-300">
                              ${(commitment.unit_retail_snapshot || 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-blue-400">
                              ${(commitment.planned_retail_total || 0).toFixed(2)}
                            </TableCell>
                            {/* LEGACY ONLY: Coverage/Exposure columns */}
                            {!isForwardModel && (
                              <>
                                <TableCell className="text-right text-green-400">
                                  ${(commitment.covered_retail_total || 0).toFixed(2)}
                                </TableCell>
                                <TableCell className={cn(
                                  "text-right",
                                  exposureGap > 0 ? "text-red-400" : "text-green-400"
                                )}>
                                  ${exposureGap.toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  <CoverageBadge commitment={commitment} poLine={lineItem} compact />
                                </TableCell>
                              </>
                            )}
                            <TableCell>
                              <CommitmentStatusBadge status={commitment.commitment_status} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Section 5: Procurement Cost Table */}
        {/* FORWARD: Uses forwardCostSummary; LEGACY: Uses procurementSummary */}
        <TabsContent value="procurement">
          <Card className="bg-gray-900/50 border-gray-700">
            <CardHeader className="border-b border-gray-700/50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm">
                  {isForwardModel && forwardCostSummary ? (
                    <>
                      <span className="text-gray-400">
                        Ordered: <span className="text-blue-400 font-medium">${forwardCostSummary.orderedPartsCost.toFixed(2)}</span>
                      </span>
                      <span className="text-gray-400">
                        Freight: <span className="text-orange-400 font-medium">${forwardCostSummary.totalFreight.toFixed(2)}</span>
                      </span>
                      <span className="text-gray-400">
                        Tariff: <span className="text-red-400 font-medium">${forwardCostSummary.totalTariff.toFixed(2)}</span>
                      </span>
                    </>
                  ) : procurementSummary && (
                    <>
                      <span className="text-gray-400">
                        Ordered: <span className="text-blue-400 font-medium">${procurementSummary.totalOrderedCost.toFixed(2)}</span>
                      </span>
                      <span className="text-gray-400">
                        Freight: <span className="text-orange-400 font-medium">${procurementSummary.totalFreightCost.toFixed(2)}</span>
                      </span>
                      <span className="text-gray-400">
                        Tariff: <span className="text-red-400 font-medium">${procurementSummary.totalTariffCost.toFixed(2)}</span>
                      </span>
                    </>
                  )}
                </div>
                <Badge variant="outline" className="border-purple-600 text-purple-400">
                  <Lock className="w-3 h-3 mr-1" />
                  {isForwardModel ? (forwardCostSummary?.lockedCostCount || 0) : (procurementSummary?.lockedCostCount || 0)} Locked
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-gray-900">
                    <TableRow className="border-gray-700 hover:bg-transparent">
                      <TableHead className="text-gray-400">Part</TableHead>
                      <TableHead className="text-gray-400 text-center">Qty</TableHead>
                      <TableHead className="text-gray-400 text-right">Unit Price</TableHead>
                      <TableHead className="text-gray-400 text-right">Line Total</TableHead>
                      <TableHead className="text-gray-400 text-right">Freight</TableHead>
                      <TableHead className="text-gray-400 text-right">Tariff</TableHead>
                      <TableHead className="text-gray-400 text-right">Landed Cost</TableHead>
                      <TableHead className="text-gray-400">Lock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems
                      .filter(li => li.status !== 'Cancelled')
                      .map(li => {
                        const part = partsMap[li.part_id];
                        const landedCost = (li.line_total || 0) + (li.freight_cost || 0) + (li.tariff_cost || 0);
                        
                        return (
                          <TableRow key={li.id} className="border-gray-700/50">
                            <TableCell>
                              <p className="text-white text-sm">{part?.part_name || 'Unknown'}</p>
                            </TableCell>
                            <TableCell className="text-center text-white">
                              {li.qty_ordered}
                            </TableCell>
                            <TableCell className="text-right text-gray-300">
                              ${(li.unit_price || 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-blue-400">
                              ${(li.line_total || 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-orange-400">
                              ${(li.freight_cost || 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-red-400">
                              ${(li.tariff_cost || 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-green-400 font-medium">
                              ${landedCost.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              {li.cost_locked_at ? (
                                <Lock className="w-4 h-4 text-purple-400" />
                              ) : (
                                <span className="text-gray-500">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
    draft: { label: 'Draft', color: 'bg-gray-600' },
    invoiced: { label: 'Invoiced', color: 'bg-blue-600' },
    paid: { label: 'Paid', color: 'bg-green-600' },
    closed: { label: 'Closed', color: 'bg-gray-500' },
    overdrawn: { label: 'Overdrawn', color: 'bg-red-600' },
  }[status] || { label: status, color: 'bg-gray-600' };

  return <Badge className={cn(config.color, "text-white text-xs")}>{config.label}</Badge>;
}

function CommitmentStatusBadge({ status }) {
  const config = {
    planned: { label: 'Planned', color: 'bg-gray-600' },
    ordered: { label: 'Ordered', color: 'bg-purple-600' },
    partially_received: { label: 'Partial Recv', color: 'bg-orange-600' },
    received: { label: 'Received', color: 'bg-blue-600' },
    allocated: { label: 'Allocated', color: 'bg-cyan-600' },
    installed: { label: 'Installed', color: 'bg-green-600' },
    closed: { label: 'Closed', color: 'bg-gray-500' },
    cancelled: { label: 'Cancelled', color: 'bg-red-600' },
  }[status] || { label: status, color: 'bg-gray-600' };

  return <Badge className={cn(config.color, "text-white text-xs")}>{config.label}</Badge>;
}