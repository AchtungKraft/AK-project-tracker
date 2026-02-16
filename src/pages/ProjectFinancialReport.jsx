import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Download,
  ArrowLeft,
  RotateCcw,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

/**
 * ProjectFinancialReport - Read-only precomputed financial report
 * 
 * USES ONLY PRECOMPUTED FIELDS - NO LIVE AGGREGATION
 * 
 * Sections:
 * 1. Executive Summary
 * 2. Pools & Ledger Summary
 * 3. Commitment Exposure Table
 * 4. Charges Breakdown
 * 5. Procurement Summary
 * 6. Scope Reductions & Reversals
 */
export default function ProjectFinancialReport() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');
  const [exportingTable, setExportingTable] = useState(null);

  // Fetch project
  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const projects = await base44.entities.Project.filter({ id: projectId });
      return projects[0];
    },
    enabled: !!projectId,
  });

  // Fetch all data in parallel - precomputed fields only
  const { data: commitments = [], isLoading: loadingCommitments } = useQuery({
    queryKey: ['partCommitments', projectId],
    queryFn: () => base44.entities.PartCommitment.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: pools = [], isLoading: loadingPools } = useQuery({
    queryKey: ['billingPools', projectId],
    queryFn: () => base44.entities.BillingPool.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: charges = [], isLoading: loadingCharges } = useQuery({
    queryKey: ['poolCharges', projectId],
    queryFn: () => base44.entities.PoolCharge.filter({ project_id: projectId }),
    enabled: !!projectId,
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

  const { data: installedParts = [] } = useQuery({
    queryKey: ['installedParts', projectId],
    queryFn: () => base44.entities.InstalledPart.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: lifecycleEvents = [] } = useQuery({
    queryKey: ['lifecycleEvents', projectId],
    queryFn: async () => {
      const all = await base44.entities.LifecycleEvent.list('-created_date', 200);
      return all.filter(e => e.project_id === projectId);
    },
    enabled: !!projectId,
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const partsMap = useMemo(() => 
    Object.fromEntries(parts.map(p => [p.id, p])), 
    [parts]
  );

  // Calculate summaries from PRECOMPUTED fields only
  const executiveSummary = useMemo(() => {
    const active = commitments.filter(c => !['cancelled', 'closed'].includes(c.commitment_status));
    const cancelled = commitments.filter(c => c.commitment_status === 'cancelled');
    
    return {
      totalPlannedRetail: active.reduce((sum, c) => sum + (c.planned_retail_total || 0), 0),
      totalCoveredRetail: active.reduce((sum, c) => sum + (c.covered_retail_total || 0), 0),
      totalExposureGap: active.reduce((sum, c) => sum + Math.max(0, c.exposure_gap || 0), 0),
      totalInvoicedRetail: active.reduce((sum, c) => sum + (c.invoiced_retail_total || 0), 0),
      commitmentCount: active.length,
      cancelledCount: cancelled.length,
      installedCount: active.filter(c => c.commitment_status === 'installed').length,
      coveragePercent: active.reduce((sum, c) => sum + (c.planned_retail_total || 0), 0) > 0
        ? (active.reduce((sum, c) => sum + (c.covered_retail_total || 0), 0) / 
           active.reduce((sum, c) => sum + (c.planned_retail_total || 0), 0) * 100).toFixed(1)
        : 0,
    };
  }, [commitments]);

  const poolSummary = useMemo(() => ({
    totalInvoiced: pools.reduce((sum, p) => sum + (p.invoiced_amount || 0), 0),
    totalPaid: pools.reduce((sum, p) => sum + (p.paid_amount || 0), 0),
    totalAllocated: pools.reduce((sum, p) => sum + (p.allocated_total || 0), 0),
    totalCharges: pools.reduce((sum, p) => sum + (p.charges_total || 0), 0),
    totalBalance: pools.reduce((sum, p) => sum + (p.balance || 0), 0),
    overdrawnPools: pools.filter(p => p.status === 'overdrawn'),
  }), [pools]);

  const chargesByType = useMemo(() => {
    const grouped = {};
    charges.filter(c => !c.is_reversed).forEach(charge => {
      const type = charge.charge_type || 'other';
      if (!grouped[type]) {
        grouped[type] = { count: 0, total: 0, items: [] };
      }
      grouped[type].count++;
      grouped[type].total += charge.amount || 0;
      grouped[type].items.push(charge);
    });
    return grouped;
  }, [charges]);

  const procurementSummary = useMemo(() => {
    const activeLines = lineItems.filter(li => li.status !== 'Cancelled');
    const deltaOrders = activeLines.filter(li => li.is_delta_order);
    return {
      totalOrderedCost: activeLines.reduce((sum, li) => sum + (li.line_total || 0), 0),
      totalFreightCost: activeLines.reduce((sum, li) => sum + (li.freight_cost || 0), 0),
      totalTariffCost: activeLines.reduce((sum, li) => sum + (li.tariff_cost || 0), 0),
      lockedCostCount: activeLines.filter(li => li.cost_locked_at).length,
      totalLineItems: activeLines.length,
      deltaOrderCount: deltaOrders.length,
      deltaOrderTotal: deltaOrders.reduce((sum, li) => sum + (li.line_total || 0), 0),
    };
  }, [lineItems]);

  const reversalsAndReductions = useMemo(() => {
    const cancelledCommitments = commitments.filter(c => c.commitment_status === 'cancelled');
    const reversedInstalls = installedParts.filter(ip => ip.is_reversed);
    const reversedCharges = charges.filter(c => c.is_reversed);
    
    return {
      cancelledCommitments,
      reversedInstalls,
      reversedCharges,
      cancelledValue: cancelledCommitments.reduce((sum, c) => sum + (c.planned_retail_total || 0), 0),
      reversedInstallValue: reversedInstalls.reduce((sum, ip) => sum + (ip.extended_cost || 0), 0),
      reversedChargeValue: reversedCharges.reduce((sum, c) => sum + (c.amount || 0), 0),
    };
  }, [commitments, installedParts, charges]);

  // CSV Export functions
  const exportToCSV = (data, filename, headers) => {
    setExportingTable(filename);
    try {
      const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(h => {
          const val = row[h.toLowerCase().replace(/ /g, '_')] ?? row[h] ?? '';
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
        }).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExportingTable(null);
    }
  };

  const exportCommitments = () => {
    const data = commitments.filter(c => c.commitment_status !== 'cancelled').map(c => {
      const part = partsMap[c.part_id];
      return {
        part_name: part?.part_name || 'Unknown',
        part_number: part?.vendor_part_number || '',
        qty_committed: c.qty_committed,
        unit_retail: c.unit_retail_snapshot || 0,
        planned_retail: c.planned_retail_total || 0,
        covered_retail: c.covered_retail_total || 0,
        exposure_gap: c.exposure_gap || 0,
        status: c.commitment_status,
        billing_status: c.billing_status,
      };
    });
    exportToCSV(data, 'commitment_exposure', [
      'part_name', 'part_number', 'qty_committed', 'unit_retail', 
      'planned_retail', 'covered_retail', 'exposure_gap', 'status', 'billing_status'
    ]);
  };

  const exportCharges = () => {
    const data = charges.filter(c => !c.is_reversed).map(c => ({
      charge_type: c.charge_type,
      description: c.description || '',
      amount: c.amount,
      created_date: c.created_date ? format(new Date(c.created_date), 'yyyy-MM-dd') : '',
      source: c.related_vendor_invoice_id ? 'Vendor Invoice' : 'Manual',
    }));
    exportToCSV(data, 'pool_charges', ['charge_type', 'description', 'amount', 'created_date', 'source']);
  };

  const exportProcurement = () => {
    const data = lineItems.filter(li => li.status !== 'Cancelled').map(li => {
      const part = partsMap[li.part_id];
      return {
        part_name: part?.part_name || 'Unknown',
        qty_ordered: li.qty_ordered,
        unit_price: li.unit_price || 0,
        line_total: li.line_total || 0,
        freight_cost: li.freight_cost || 0,
        tariff_cost: li.tariff_cost || 0,
        landed_cost: (li.line_total || 0) + (li.freight_cost || 0) + (li.tariff_cost || 0),
        cost_locked: li.cost_locked_at ? 'Yes' : 'No',
        is_delta: li.is_delta_order ? 'Yes' : 'No',
        status: li.status,
      };
    });
    exportToCSV(data, 'procurement', [
      'part_name', 'qty_ordered', 'unit_price', 'line_total', 
      'freight_cost', 'tariff_cost', 'landed_cost', 'cost_locked', 'is_delta', 'status'
    ]);
  };

  const isLoading = loadingProject || loadingCommitments || loadingPools || loadingCharges || loadingLineItems;

  if (!projectId) {
    return (
      <div className="p-8 text-center text-gray-500">
        No project ID provided
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl('ProjectDetail') + `?id=${projectId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Financial Report</h1>
            <p className="text-gray-400">{project?.name || 'Project'}</p>
          </div>
        </div>
        <div className="text-sm text-gray-400">
          Generated: {format(new Date(), 'MMMM d, yyyy h:mm a')}
        </div>
      </div>

      {/* Section 1: Executive Summary */}
      <Card className="bg-gradient-to-r from-gray-900 to-gray-800 border-gray-700">
        <CardHeader className="border-b border-gray-700/50">
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <SummaryCard
              label="Total Retail Exposure"
              value={executiveSummary.totalPlannedRetail}
              sublabel={`${executiveSummary.commitmentCount} commitments`}
              color="text-blue-400"
            />
            <SummaryCard
              label="Covered by Pool"
              value={executiveSummary.totalCoveredRetail}
              sublabel={`${executiveSummary.coveragePercent}% coverage`}
              color="text-green-400"
            />
            <SummaryCard
              label="Exposure Gap"
              value={executiveSummary.totalExposureGap}
              sublabel={executiveSummary.totalExposureGap > 0 ? "Unbilled exposure" : "Fully covered"}
              color={executiveSummary.totalExposureGap > 0 ? "text-red-400" : "text-green-400"}
              icon={executiveSummary.totalExposureGap > 0 ? AlertTriangle : CheckCircle2}
            />
            <SummaryCard
              label="Pool Balance"
              value={poolSummary.totalBalance}
              sublabel={poolSummary.overdrawnPools.length > 0 ? `${poolSummary.overdrawnPools.length} overdrawn` : "Healthy"}
              color={poolSummary.totalBalance < 0 ? "text-red-400" : "text-green-400"}
              icon={poolSummary.totalBalance < 0 ? TrendingDown : TrendingUp}
            />
          </div>

          {/* Warning banner for overdrawn pools */}
          {poolSummary.overdrawnPools.length > 0 && (
            <div className="mt-4 p-4 bg-red-900/30 border border-red-700/50 rounded-lg flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
              <div>
                <p className="text-red-300 font-medium">Overdrawn Pools Detected</p>
                <p className="text-red-400/70 text-sm">
                  {poolSummary.overdrawnPools.map(p => p.pool_name).join(', ')} 
                  - Total overdraw: ${Math.abs(poolSummary.overdrawnPools.reduce((sum, p) => sum + (p.balance || 0), 0)).toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Pools & Ledger Summary */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader className="border-b border-gray-700/50">
          <CardTitle className="text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-400" />
            Pools & Ledger Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pools.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No billing pools</div>
          ) : (
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
          )}
        </CardContent>
      </Card>

      {/* Section 3: Commitment Exposure Table */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader className="border-b border-gray-700/50 flex flex-row items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-400" />
            Commitment Exposure Table
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCommitments}
            disabled={exportingTable === 'commitment_exposure'}
            className="border-gray-600"
          >
            {exportingTable === 'commitment_exposure' ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Export CSV
          </Button>
        </CardHeader>
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
                  <TableHead className="text-gray-400">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commitments
                  .filter(c => c.commitment_status !== 'cancelled')
                  .map(commitment => {
                    const part = partsMap[commitment.part_id];
                    const exposureGap = commitment.exposure_gap || 0;
                    
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
                          "text-right font-medium",
                          exposureGap > 0 ? "text-red-400" : "text-green-400"
                        )}>
                          ${exposureGap.toFixed(2)}
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

      {/* Section 4: Charges Breakdown */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader className="border-b border-gray-700/50 flex flex-row items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-orange-400" />
            Charges Breakdown
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCharges}
            disabled={exportingTable === 'pool_charges'}
            className="border-gray-600"
          >
            {exportingTable === 'pool_charges' ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          {Object.keys(chargesByType).length === 0 ? (
            <div className="text-center text-gray-500 py-4">No charges recorded</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(chargesByType).map(([type, data]) => (
                <div key={type} className="p-4 bg-gray-800/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 capitalize">{type.replace('_', ' ')}</span>
                    <Badge variant="outline" className="border-gray-600 text-gray-400">
                      {data.count}
                    </Badge>
                  </div>
                  <p className="text-2xl font-bold text-orange-400">${data.total.toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 5: Procurement Summary */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader className="border-b border-gray-700/50 flex flex-row items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Procurement Summary
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={exportProcurement}
            disabled={exportingTable === 'procurement'}
            className="border-gray-600"
          >
            {exportingTable === 'procurement' ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <MetricCard label="Total Ordered" value={procurementSummary.totalOrderedCost} color="text-blue-400" />
            <MetricCard label="Freight Costs" value={procurementSummary.totalFreightCost} color="text-orange-400" />
            <MetricCard label="Tariff/Duty" value={procurementSummary.totalTariffCost} color="text-red-400" />
            <MetricCard 
              label="Total Landed" 
              value={procurementSummary.totalOrderedCost + procurementSummary.totalFreightCost + procurementSummary.totalTariffCost} 
              color="text-green-400" 
            />
          </div>

          <div className="flex items-center gap-6 p-3 bg-gray-800/30 rounded-lg">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-purple-400" />
              <span className="text-gray-300">{procurementSummary.lockedCostCount} / {procurementSummary.totalLineItems} costs locked</span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-400" />
              <span className="text-gray-300">{procurementSummary.deltaOrderCount} delta orders (${procurementSummary.deltaOrderTotal.toFixed(2)})</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 6: Scope Reductions & Reversals */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader className="border-b border-gray-700/50">
          <CardTitle className="text-white flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-red-400" />
            Scope Reductions & Reversals
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-4 bg-red-900/20 border border-red-700/30 rounded-lg">
              <p className="text-red-400/70 text-sm mb-1">Cancelled Commitments</p>
              <p className="text-2xl font-bold text-red-400">{reversalsAndReductions.cancelledCommitments.length}</p>
              <p className="text-sm text-red-400/70 mt-1">
                ${reversalsAndReductions.cancelledValue.toFixed(2)} retail value
              </p>
            </div>
            <div className="p-4 bg-orange-900/20 border border-orange-700/30 rounded-lg">
              <p className="text-orange-400/70 text-sm mb-1">Reversed Installations</p>
              <p className="text-2xl font-bold text-orange-400">{reversalsAndReductions.reversedInstalls.length}</p>
              <p className="text-sm text-orange-400/70 mt-1">
                ${reversalsAndReductions.reversedInstallValue.toFixed(2)} cost
              </p>
            </div>
            <div className="p-4 bg-yellow-900/20 border border-yellow-700/30 rounded-lg">
              <p className="text-yellow-400/70 text-sm mb-1">Reversed Charges</p>
              <p className="text-2xl font-bold text-yellow-400">{reversalsAndReductions.reversedCharges.length}</p>
              <p className="text-sm text-yellow-400/70 mt-1">
                ${reversalsAndReductions.reversedChargeValue.toFixed(2)} returned
              </p>
            </div>
          </div>

          {reversalsAndReductions.cancelledCommitments.length > 0 && (
            <div className="mt-4">
              <p className="text-gray-400 text-sm mb-2">Cancelled Commitments:</p>
              <div className="space-y-2">
                {reversalsAndReductions.cancelledCommitments.slice(0, 5).map(c => {
                  const part = partsMap[c.part_id];
                  return (
                    <div key={c.id} className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
                      <span className="text-white text-sm">{part?.part_name || 'Unknown'}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-400 text-sm">{c.cancelled_reason || 'No reason'}</span>
                        <span className="text-red-400 text-sm">${(c.planned_retail_total || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
                {reversalsAndReductions.cancelledCommitments.length > 5 && (
                  <p className="text-gray-500 text-sm">
                    +{reversalsAndReductions.cancelledCommitments.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Helper Components
function SummaryCard({ label, value, sublabel, color, icon: Icon }) {
  return (
    <div className="p-4 bg-gray-800/50 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400">{label}</span>
        {Icon && <Icon className={cn("w-5 h-5", color)} />}
      </div>
      <p className={cn("text-2xl font-bold", color)}>${value.toFixed(2)}</p>
      <p className="text-gray-500 text-sm mt-1">{sublabel}</p>
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div className="p-3 bg-gray-800/50 rounded-lg">
      <p className="text-gray-400 text-sm mb-1">{label}</p>
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
    partially_received: { label: 'Partial', color: 'bg-orange-600' },
    received: { label: 'Received', color: 'bg-blue-600' },
    allocated: { label: 'Allocated', color: 'bg-cyan-600' },
    installed: { label: 'Installed', color: 'bg-green-600' },
    closed: { label: 'Closed', color: 'bg-gray-500' },
    cancelled: { label: 'Cancelled', color: 'bg-red-600' },
  }[status] || { label: status, color: 'bg-gray-600' };

  return <Badge className={cn(config.color, "text-white text-xs")}>{config.label}</Badge>;
}