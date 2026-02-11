import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, 
  CheckCircle2, HelpCircle 
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  ok: { 
    label: 'Complete', 
    color: 'text-green-400 border-green-600', 
    icon: CheckCircle2,
    description: 'Pricing verified'
  },
  estimated_cost: { 
    label: 'Estimated', 
    color: 'text-yellow-400 border-yellow-600', 
    icon: HelpCircle,
    description: 'Using estimated cost'
  },
  missing_retail: { 
    label: 'Missing Retail', 
    color: 'text-red-400 border-red-600', 
    icon: AlertTriangle,
    description: 'No retail price set'
  },
  overridden_retail: { 
    label: 'Override', 
    color: 'text-blue-400 border-blue-600', 
    icon: DollarSign,
    description: 'Manual price override'
  },
  margin_negative: { 
    label: 'Negative Margin', 
    color: 'text-red-400 border-red-600', 
    icon: TrendingDown,
    description: 'Cost exceeds retail'
  },
};

function formatCurrency(value) {
  if (value === null || value === undefined) return '—';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(1)}%`;
}

/**
 * CommitmentPricingSummary - Display pricing details for a commitment
 */
export default function CommitmentPricingSummary({ commitment, variant = 'card' }) {
  const {
    unit_cost_snapshot,
    actual_unit_cost,
    unit_retail_snapshot,
    actual_extended_cost,
    margin_pct,
    pricing_integrity_status = 'estimated_cost',
    qty_committed = 0,
  } = commitment;

  const statusConfig = STATUS_CONFIG[pricing_integrity_status] || STATUS_CONFIG.estimated_cost;
  const StatusIcon = statusConfig.icon;
  
  const displayCost = actual_unit_cost || unit_cost_snapshot;
  const extendedRetail = unit_retail_snapshot ? unit_retail_snapshot * qty_committed : null;
  const extendedCost = actual_extended_cost || (displayCost ? displayCost * qty_committed : null);
  const estimatedProfit = extendedRetail && extendedCost ? extendedRetail - extendedCost : null;

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Cost:</span>
          <span className={actual_unit_cost ? 'text-white' : 'text-gray-400'}>
            {formatCurrency(displayCost)}
          </span>
          {!actual_unit_cost && unit_cost_snapshot && (
            <span className="text-xs text-yellow-500">(est)</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Retail:</span>
          <span className={unit_retail_snapshot ? 'text-white' : 'text-red-400'}>
            {formatCurrency(unit_retail_snapshot)}
          </span>
        </div>
        {margin_pct !== null && margin_pct !== undefined && (
          <div className="flex items-center gap-1">
            {margin_pct >= 0 ? (
              <TrendingUp className="w-3 h-3 text-green-400" />
            ) : (
              <TrendingDown className="w-3 h-3 text-red-400" />
            )}
            <span className={margin_pct >= 0 ? 'text-green-400' : 'text-red-400'}>
              {formatPercent(margin_pct)}
            </span>
          </div>
        )}
        <Badge variant="outline" className={cn('text-xs', statusConfig.color)}>
          <StatusIcon className="w-3 h-3 mr-1" />
          {statusConfig.label}
        </Badge>
      </div>
    );
  }

  return (
    <Card className="bg-gray-800/50 border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-300 flex items-center justify-between">
          <span>Pricing Summary</span>
          <Badge variant="outline" className={cn('text-xs', statusConfig.color)}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {statusConfig.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Unit Pricing */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Unit Cost</p>
            <p className={cn("text-lg font-semibold", actual_unit_cost ? 'text-white' : 'text-gray-400')}>
              {formatCurrency(displayCost)}
            </p>
            {!actual_unit_cost && unit_cost_snapshot && (
              <p className="text-xs text-yellow-500">Estimated</p>
            )}
            {actual_unit_cost && (
              <p className="text-xs text-green-500">From Invoice</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500">Unit Retail</p>
            <p className={cn("text-lg font-semibold", unit_retail_snapshot ? 'text-white' : 'text-red-400')}>
              {formatCurrency(unit_retail_snapshot)}
            </p>
            {!unit_retail_snapshot && (
              <p className="text-xs text-red-500">Missing!</p>
            )}
          </div>
        </div>

        {/* Extended Totals */}
        <div className="border-t border-gray-700 pt-3 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Extended Cost ({qty_committed} units)</p>
            <p className="text-base font-medium text-white">
              {formatCurrency(extendedCost)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Extended Retail</p>
            <p className="text-base font-medium text-white">
              {formatCurrency(extendedRetail)}
            </p>
          </div>
        </div>

        {/* Margin */}
        <div className="border-t border-gray-700 pt-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Margin</p>
            <div className="flex items-center gap-2">
              {margin_pct !== null && margin_pct !== undefined ? (
                <>
                  {margin_pct >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-400" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-400" />
                  )}
                  <span className={cn(
                    "text-lg font-semibold",
                    margin_pct >= 0 ? 'text-green-400' : 'text-red-400'
                  )}>
                    {formatPercent(margin_pct)}
                  </span>
                </>
              ) : (
                <span className="text-gray-500">—</span>
              )}
            </div>
          </div>
          {estimatedProfit !== null && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Est. Profit</p>
              <p className={cn(
                "text-base font-medium",
                estimatedProfit >= 0 ? 'text-green-400' : 'text-red-400'
              )}>
                {formatCurrency(estimatedProfit)}
              </p>
            </div>
          )}
        </div>

        {/* Status Description */}
        <p className="text-xs text-gray-500 italic">{statusConfig.description}</p>
      </CardContent>
    </Card>
  );
}