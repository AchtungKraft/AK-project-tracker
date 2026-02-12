import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  DollarSign, 
  Truck, 
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MetricCard - Individual clickable metric display
 */
function MetricCard({ 
  icon: Icon, 
  iconColor, 
  label, 
  value, 
  subValue, 
  progress, 
  progressColor,
  onClick,
  highlight,
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-3 bg-gray-900/50 rounded-lg border transition-all text-left w-full",
        highlight 
          ? "border-yellow-600/50 hover:border-yellow-500" 
          : "border-gray-800 hover:border-gray-700",
        onClick && "cursor-pointer hover:bg-gray-900/70"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("w-4 h-4", iconColor)} />
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-white">{value}</span>
        {subValue && (
          <span className="text-xs text-gray-500">{subValue}</span>
        )}
      </div>
      {progress !== undefined && (
        <Progress 
          value={progress} 
          className={cn("h-1 mt-2", progressColor)} 
        />
      )}
    </button>
  );
}

/**
 * ProjectFinancialSummaryWidget
 * 
 * Displays financial summary metrics for a project.
 * Uses pre-resolved financial status data (from useFinancialStatusBatch).
 * 
 * @param {Object[]} financialStatuses - Array of resolved financial status objects
 * @param {Function} onMetricClick - Callback when user clicks a metric (receives filter key)
 */
export default function ProjectFinancialSummaryWidget({ 
  financialStatuses = [],
  onMetricClick,
  className,
  compact = false,
}) {
  // Calculate summary metrics from financial statuses
  const metrics = useMemo(() => {
    if (!financialStatuses || financialStatuses.length === 0) {
      return {
        billing: { total: 0, billed: 0, unbilled: 0, percent: 0 },
        vendor: { total: 0, paid: 0, unpaid: 0, percent: 0 },
        margin: { complete: 0, pending: 0, total: 0, percent: 0 },
      };
    }

    // Parts Billing Summary
    let totalBillable = 0;
    let billedParts = 0;
    let unbilledParts = 0;

    // Vendor Cost Summary  
    let totalVendorCost = 0;
    let vendorPaid = 0;
    let vendorUnpaid = 0;

    // Margin Completion
    let marginComplete = 0;
    let marginPending = 0;

    financialStatuses.forEach(fs => {
      if (!fs) return;

      // Billing metrics (exclude non-billable)
      if (fs.financial_role !== 'NON_BILLABLE' && fs.financial_role !== 'LABOR_ONLY') {
        totalBillable++;
        if (fs.client_billing_status === 'INVOICED' || 
            fs.client_billing_status === 'PARTIALLY_PAID' ||
            fs.client_billing_status === 'PAID') {
          billedParts++;
        } else if (fs.client_billing_status === 'NOT_INVOICED') {
          unbilledParts++;
        }
      }

      // Vendor metrics (only for vendor margin parts)
      if (fs.financial_role === 'VENDOR_MARGIN') {
        totalVendorCost++;
        if (fs.vendor_payment_status === 'PAID') {
          vendorPaid++;
        } else if (fs.vendor_payment_status === 'UNPAID' || fs.vendor_payment_status === 'PARTIAL') {
          vendorUnpaid++;
        }
      }

      // Margin metrics
      if (fs.margin_state === 'COMPLETE') {
        marginComplete++;
      } else if (fs.margin_state !== 'UNKNOWN') {
        marginPending++;
      }
    });

    const totalParts = financialStatuses.length;
    
    return {
      billing: {
        total: totalBillable,
        billed: billedParts,
        unbilled: unbilledParts,
        percent: totalBillable > 0 ? Math.round((billedParts / totalBillable) * 100) : 0,
      },
      vendor: {
        total: totalVendorCost,
        paid: vendorPaid,
        unpaid: vendorUnpaid,
        percent: totalVendorCost > 0 ? Math.round((vendorPaid / totalVendorCost) * 100) : 0,
      },
      margin: {
        complete: marginComplete,
        pending: marginPending,
        total: totalParts,
        percent: totalParts > 0 ? Math.round((marginComplete / totalParts) * 100) : 0,
      },
    };
  }, [financialStatuses]);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-4", className)}>
        {/* Billing Progress */}
        <button
          onClick={() => onMetricClick?.('unbilled')}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <DollarSign className="w-4 h-4 text-green-400" />
          <span className="text-white text-sm font-medium">{metrics.billing.percent}%</span>
          <span className="text-xs text-gray-400">billed</span>
          {metrics.billing.unbilled > 0 && (
            <span className="text-xs text-yellow-400 ml-1">({metrics.billing.unbilled} pending)</span>
          )}
        </button>

        {/* Vendor Progress */}
        <button
          onClick={() => onMetricClick?.('vendor_unpaid')}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Truck className="w-4 h-4 text-purple-400" />
          <span className="text-white text-sm font-medium">{metrics.vendor.percent}%</span>
          <span className="text-xs text-gray-400">vendor paid</span>
          {metrics.vendor.unpaid > 0 && (
            <span className="text-xs text-red-400 ml-1">({metrics.vendor.unpaid} unpaid)</span>
          )}
        </button>

        {/* Margin Progress */}
        <button
          onClick={() => onMetricClick?.('margin_incomplete')}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <span className="text-white text-sm font-medium">{metrics.margin.percent}%</span>
          <span className="text-xs text-gray-400">margin complete</span>
        </button>
      </div>
    );
  }

  return (
    <Card className={cn("bg-black/40 backdrop-blur-xl border border-gray-800", className)}>
      <CardHeader className="p-4 border-b border-gray-800">
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          Financial Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Parts Billing Summary */}
          <div className="space-y-3">
            <h4 className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-2">
              <DollarSign className="w-3 h-3" />
              Parts Billing
            </h4>
            
            <MetricCard
              icon={DollarSign}
              iconColor="text-green-400"
              label="Billable Parts"
              value={metrics.billing.total}
              progress={metrics.billing.percent}
              progressColor="[&>div]:bg-green-500"
            />
            
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                icon={CheckCircle2}
                iconColor="text-green-400"
                label="Billed"
                value={metrics.billing.billed}
                onClick={() => onMetricClick?.('billed')}
              />
              <MetricCard
                icon={Clock}
                iconColor="text-yellow-400"
                label="Unbilled"
                value={metrics.billing.unbilled}
                onClick={() => onMetricClick?.('unbilled')}
                highlight={metrics.billing.unbilled > 0}
              />
            </div>
            
            <div className="text-center">
              <span className="text-2xl font-bold text-green-400">{metrics.billing.percent}%</span>
              <span className="text-xs text-gray-500 ml-1">completion</span>
            </div>
          </div>

          {/* Vendor Cost Summary */}
          <div className="space-y-3">
            <h4 className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-2">
              <Truck className="w-3 h-3" />
              Vendor Costs
            </h4>
            
            <MetricCard
              icon={Truck}
              iconColor="text-purple-400"
              label="Vendor Parts"
              value={metrics.vendor.total}
              progress={metrics.vendor.percent}
              progressColor="[&>div]:bg-purple-500"
            />
            
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                icon={CheckCircle2}
                iconColor="text-green-400"
                label="Paid"
                value={metrics.vendor.paid}
                onClick={() => onMetricClick?.('vendor_paid')}
              />
              <MetricCard
                icon={AlertCircle}
                iconColor="text-red-400"
                label="Unpaid"
                value={metrics.vendor.unpaid}
                onClick={() => onMetricClick?.('vendor_unpaid')}
                highlight={metrics.vendor.unpaid > 0}
              />
            </div>
            
            <div className="text-center">
              <span className="text-2xl font-bold text-purple-400">{metrics.vendor.percent}%</span>
              <span className="text-xs text-gray-500 ml-1">completion</span>
            </div>
          </div>

          {/* Margin Completion */}
          <div className="space-y-3">
            <h4 className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-2">
              <TrendingUp className="w-3 h-3" />
              Margin Status
            </h4>
            
            <MetricCard
              icon={TrendingUp}
              iconColor="text-blue-400"
              label="Total Parts"
              value={metrics.margin.total}
              progress={metrics.margin.percent}
              progressColor="[&>div]:bg-blue-500"
            />
            
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                icon={CheckCircle2}
                iconColor="text-green-400"
                label="Complete"
                value={metrics.margin.complete}
                onClick={() => onMetricClick?.('margin_complete')}
              />
              <MetricCard
                icon={Clock}
                iconColor="text-orange-400"
                label="Pending"
                value={metrics.margin.pending}
                onClick={() => onMetricClick?.('margin_incomplete')}
                highlight={metrics.margin.pending > 0}
              />
            </div>
            
            <div className="text-center">
              <span className="text-2xl font-bold text-blue-400">{metrics.margin.percent}%</span>
              <span className="text-xs text-gray-500 ml-1">completion</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}