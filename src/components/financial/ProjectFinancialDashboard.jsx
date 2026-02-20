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
  Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import PoolPanel from "./PoolPanel";
import CoverageBadge from "./CoverageBadge";

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
  const { data: revenueSummary, isLoading: loadingRevenue } = useQuery({
    queryKey: ['projectRevenueSummary', projectId],
    queryFn: () => base44.functions.invoke('getProjectRevenueSummary', { project_id: projectId }),
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
    if (!isForwardModel || !revenueSummary?.data) return null;
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

  // Procurement costs from precomputed line item fields (both models)
  const procurementSummary = useMemo(() => {
    const activeLines = lineItems.filter(li => li.status !== 'Cancelled');
    return {
      totalOrderedCost: activeLines.reduce((sum, li) => sum + (li.line_total || 0), 0),
      totalFreightCost: activeLines.reduce((sum, li) => sum + (li.freight_cost || 0), 0),
      totalTariffCost: activeLines.reduce((sum, li) => sum + (li.tariff_cost || 0), 0),
      lockedCostCount: activeLines.filter(li => li.cost_locked_at).length,
      totalLineItems: activeLines.length,
    };
  }, [lineItems]);

  const isLoading = loadingProject || loadingCommitments || 
    (isForwardModel ? loadingRevenue : (loadingPools || loadingCharges)) || 
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

  return (
    <div className="space-y-6">
      {/* Section 1: Retail Exposure Summary */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader className="border-b border-gray-700/50 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              Retail Exposure Summary
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

      {/* Section 2: Pool Summary Table */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader className="border-b border-gray-700/50 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-400" />
              Pool Summary
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
                      <TableCell className="text-right text-blue-400">${(pool.invoiced_amount || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-green-400">${(pool.paid_amount || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-purple-400">${(pool.allocated_total || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-orange-400">${(pool.charges_total || 0).toFixed(2)}</TableCell>
                      <TableCell className={cn(
                        "text-right font-medium",
                        (pool.balance || 0) < 0 ? "text-red-400" : "text-green-400"
                      )}>
                        ${(pool.balance || 0).toFixed(2)}
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

      {/* Section 3: Pool Charges Breakdown */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader className="border-b border-gray-700/50 pb-3">
          <CardTitle className="text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-orange-400" />
            Pool Charges Breakdown
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
                      <TableHead className="text-gray-400 text-right">Planned</TableHead>
                      <TableHead className="text-gray-400 text-right">Covered</TableHead>
                      <TableHead className="text-gray-400 text-right">Exposure</TableHead>
                      <TableHead className="text-gray-400">Coverage</TableHead>
                      <TableHead className="text-gray-400">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commitments
                      .filter(c => c.commitment_status !== 'cancelled')
                      .map(commitment => {
                        const part = partsMap[commitment.part_id];
                        const exposureGap = commitment.exposure_gap || 0;
                        const lineItem = lineItems.find(li => li.commitment_id === commitment.id);
                        
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
        <TabsContent value="procurement">
          <Card className="bg-gray-900/50 border-gray-700">
            <CardHeader className="border-b border-gray-700/50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-400">
                    Ordered: <span className="text-blue-400 font-medium">${procurementSummary.totalOrderedCost.toFixed(2)}</span>
                  </span>
                  <span className="text-gray-400">
                    Freight: <span className="text-orange-400 font-medium">${procurementSummary.totalFreightCost.toFixed(2)}</span>
                  </span>
                  <span className="text-gray-400">
                    Tariff: <span className="text-red-400 font-medium">${procurementSummary.totalTariffCost.toFixed(2)}</span>
                  </span>
                </div>
                <Badge variant="outline" className="border-purple-600 text-purple-400">
                  <Lock className="w-3 h-3 mr-1" />
                  {procurementSummary.lockedCostCount} Locked
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