import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw,
  Loader2,
  Plus,
  TrendingUp,
  TrendingDown,
  Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import PoolDetailView from "./PoolDetailView";
import CreatePoolModal from "./CreatePoolModal";

/**
 * Pool status badge with appropriate styling
 */
function PoolStatusBadge({ status }) {
  const config = {
    draft: { label: 'Draft', color: 'bg-gray-600', icon: null },
    invoiced: { label: 'Invoiced', color: 'bg-blue-600', icon: DollarSign },
    paid: { label: 'Paid', color: 'bg-green-600', icon: CheckCircle2 },
    closed: { label: 'Closed', color: 'bg-gray-500', icon: CheckCircle2 },
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

/**
 * PoolPanel - Displays billing pool summary with financial status
 * 
 * NOTE: This component is LEGACY MODEL ONLY.
 * Forward model projects should NOT render this component.
 * Forward model uses InvoiceBatch for revenue tracking, not billing pools.
 */
export default function PoolPanel({ 
  pool,
  projectId,
  onRefresh,
  onCreateAllocation,
  onPoolCreated,
  isRefreshing = false,
  compact = false,
}) {
  const [showDetailView, setShowDetailView] = useState(false);
  const [showCreatePoolModal, setShowCreatePoolModal] = useState(false);

  if (showDetailView && pool) {
    return (
      <Card className="bg-gray-900/50 border-gray-700">
        <CardContent className="p-4">
          <PoolDetailView poolId={pool.id} onClose={() => setShowDetailView(false)} />
        </CardContent>
      </Card>
    );
  }

  if (!pool) {
    return (
      <>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4 text-center">
            <p className="text-gray-500 mb-3">No billing pool configured</p>
            {projectId && (
              <Button
                onClick={() => setShowCreatePoolModal(true)}
                className="bg-green-600 hover:bg-green-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Pool
              </Button>
            )}
          </CardContent>
        </Card>
        {showCreatePoolModal && projectId && (
          <CreatePoolModal
            projectId={projectId}
            onClose={() => setShowCreatePoolModal(false)}
            onSuccess={onPoolCreated}
          />
        )}
      </>
    );
  }

  // NULL SAFETY: All pool fields use ?? 0
  const invoiced = pool.invoiced_amount ?? 0;
  const allocated = pool.allocated_total ?? 0;
  const charges = pool.charges_total ?? 0;
  const balance = pool.balance ?? (invoiced - allocated - charges);
  const paid = pool.paid_amount ?? 0;
  
  const isOverdrawn = balance < 0;
  const utilizationPct = invoiced > 0 ? ((allocated + charges) / invoiced * 100).toFixed(1) : 0;

  if (compact) {
    return (
      <div className={cn(
        "flex items-center justify-between p-3 rounded-lg border",
        isOverdrawn ? "bg-red-900/30 border-red-700/50" : "bg-gray-800/50 border-gray-700"
      )}>
        <div className="flex items-center gap-3">
          <DollarSign className={cn("w-4 h-4", isOverdrawn ? "text-red-400" : "text-green-400")} />
          <div>
            <p className="text-sm font-medium text-white">{pool.pool_name}</p>
            <p className="text-xs text-gray-400">
              ${allocated.toFixed(2)} / ${invoiced.toFixed(2)} allocated
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PoolStatusBadge status={pool.status} />
          {isOverdrawn && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="w-3 h-3" />
              -${Math.abs(balance).toFixed(2)}
            </Badge>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className={cn(
      "border",
      isOverdrawn ? "bg-red-900/20 border-red-700/50" : "bg-gray-900/50 border-gray-700"
    )}>
      <CardHeader className="p-4 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className={cn("w-5 h-5", isOverdrawn ? "text-red-400" : "text-green-400")} />
            <CardTitle className="text-white text-base">{pool.pool_name}</CardTitle>
            <PoolStatusBadge status={pool.status} />
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onRefresh}
                disabled={isRefreshing}
                className="h-8 w-8 p-0"
              >
                {isRefreshing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDetailView(true)}
              className="h-8 border-gray-600"
            >
              <Eye className="w-4 h-4 mr-1" />
              Details
            </Button>
            {onCreateAllocation && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCreateAllocation}
                className="h-8 border-gray-600"
              >
                <Plus className="w-4 h-4 mr-1" />
                Allocate
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {/* Overdrawn Warning */}
        {isOverdrawn && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-900/40 border border-red-700/50 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="text-red-300 font-medium">Pool Overdrawn</p>
              <p className="text-red-400/70 text-sm">
                Allocations exceed invoiced amount by ${Math.abs(balance).toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Financial Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Invoiced</p>
            <p className="text-lg font-bold text-blue-400">${invoiced.toFixed(2)}</p>
          </div>
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Paid</p>
            <p className="text-lg font-bold text-green-400">${paid.toFixed(2)}</p>
          </div>
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Allocated</p>
            <p className="text-lg font-bold text-purple-400">${allocated.toFixed(2)}</p>
          </div>
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Charges</p>
            <p className="text-lg font-bold text-orange-400">${charges.toFixed(2)}</p>
          </div>
        </div>

        {/* Balance Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Utilization</span>
            <span className="text-xs text-gray-300">{utilizationPct}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full transition-all",
                isOverdrawn ? "bg-red-500" : utilizationPct > 90 ? "bg-yellow-500" : "bg-green-500"
              )}
              style={{ width: `${Math.min(100, utilizationPct)}%` }}
            />
          </div>
        </div>

        {/* Balance Summary */}
        <div className={cn(
          "mt-4 p-3 rounded-lg flex items-center justify-between",
          isOverdrawn ? "bg-red-900/30" : "bg-green-900/20"
        )}>
          <span className="text-sm text-gray-300">Available Balance</span>
          <div className="flex items-center gap-2">
            {isOverdrawn ? (
              <TrendingDown className="w-4 h-4 text-red-400" />
            ) : (
              <TrendingUp className="w-4 h-4 text-green-400" />
            )}
            <span className={cn(
              "text-lg font-bold",
              isOverdrawn ? "text-red-400" : "text-green-400"
            )}>
              ${balance.toFixed(2)}
            </span>
          </div>
        </div>

        {/* QuickBooks Info */}
        {pool.qb_invoice_number && (
          <div className="mt-3 text-xs text-gray-500">
            QB Invoice: {pool.qb_invoice_number}
            {pool.qb_exported_at && ` · Exported ${new Date(pool.qb_exported_at).toLocaleDateString()}`}
          </div>
        )}

        {/* Notes */}
        {pool.notes && (
          <p className="mt-3 text-xs text-gray-500 italic">{pool.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}