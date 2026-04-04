import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Package, 
  FolderKanban, 
  ShoppingCart, 
  Wrench,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Truck,
  BoxSelect,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PartProjectUsageSection - Shows where each part is used across projects
 * and how inventory is allocated.
 *
 * Displays:
 * - Global allocation breakdown (allocated vs unallocated stock)
 * - Per-project commitment rows with all canonical quantities
 * - Next action per commitment with color coding
 * - Quick navigation links to project supply manager
 */
export default function PartProjectUsageSection({ partId, isOpen = true }) {
  const queryEnabled = Boolean(isOpen && partId);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['partSupplyUsage', partId],
    queryFn: async () => {
      if (!partId) return null;
      const response = await base44.functions.invoke('getPartSupplyUsage', { part_id: partId });
      return response.data;
    },
    enabled: queryEnabled,
    staleTime: 30000,
    gcTime: 120000,
    placeholderData: (prev) => prev,
    networkMode: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, err) => {
      if (err?.status === 429 || err?.status >= 500) return false;
      return failureCount < 1;
    },
  });

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full bg-gray-800" />
        <Skeleton className="h-16 w-full bg-gray-800" />
      </div>
    );
  }

  if (error) {
    const msg = error?.status === 429 ? 'Rate limited — wait a moment' : 'Unable to load project usage';
    return (
      <div className="text-sm text-red-400 p-3 bg-red-900/20 rounded-lg flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        {msg}
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="text-sm text-yellow-400 p-3 bg-yellow-900/20 rounded-lg flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        Unable to load project data
      </div>
    );
  }

  const { inventory, demand, commitments, health } = data;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
        <FolderKanban className="w-4 h-4" />
        Project Usage &amp; Allocation
      </h4>

      {/* Allocation Breakdown Bar */}
      <AllocationBreakdown inventory={inventory} demand={demand} health={health} />

      {/* Project Commitments */}
      {commitments.length === 0 ? (
        <div className="text-sm text-gray-500 p-4 bg-gray-800/30 rounded-lg text-center">
          Not assigned to any projects yet
        </div>
      ) : (
        <div className="space-y-2">
          {commitments.map((c) => (
            <ProjectCommitmentRow key={c.commitment_id} commitment={c} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Allocation Breakdown ─── */
function AllocationBreakdown({ inventory, demand, health }) {
  const { physical_stock, allocated_total, available, on_order_total } = inventory;
  const totalBar = Math.max(physical_stock, 1);
  const allocatedPct = Math.min(100, Math.round((allocated_total / totalBar) * 100));
  const availablePct = 100 - allocatedPct;

  // DEV: Summary-level canonical invariant assertion
  if (import.meta.env.DEV && demand) {
    const expectedTotal = (demand.total_reserved ?? 0) + (demand.total_covered_po ?? 0) + (demand.total_installed ?? 0) + (demand.total_to_order ?? 0);
    if (expectedTotal !== (demand.total_required ?? 0)) {
      console.warn('[SUMMARY COVERAGE DRIFT]', {
        total_required: demand.total_required,
        total_reserved: demand.total_reserved,
        total_covered_po: demand.total_covered_po,
        total_installed: demand.total_installed,
        total_to_order: demand.total_to_order,
        expected: expectedTotal,
        delta: (demand.total_required ?? 0) - expectedTotal,
      });
    }
  }

  return (
    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 space-y-3">
      {/* Metric row — canonical backend values only */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <MetricCell label="In Stock" value={physical_stock} color="text-white" />
        <MetricCell label="Allocated" value={allocated_total} color="text-cyan-400" />
        <MetricCell label="Unallocated" value={available} color="text-green-400" />
        <MetricCell label="On Order" value={on_order_total} color="text-purple-400" />
      </div>

      {/* Visual bar */}
      {physical_stock > 0 && (
        <div className="space-y-1">
          <div className="flex h-2 rounded-full overflow-hidden bg-gray-700">
            <div
              className="bg-cyan-500 transition-all"
              style={{ width: `${allocatedPct}%` }}
              title={`Allocated: ${allocated_total}`}
            />
            <div
              className="bg-green-500 transition-all"
              style={{ width: `${availablePct}%` }}
              title={`Unallocated: ${available}`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>{allocatedPct}% allocated</span>
            <span>{availablePct}% free</span>
          </div>
        </div>
      )}

      {/* Health badges */}
      <div className="flex flex-wrap gap-1.5">
        {health.is_low_stock && (
          <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 text-[10px]">
            <AlertCircle className="w-3 h-3 mr-1" />
            Low Stock
          </Badge>
        )}
        {health.has_unfulfilled_demand && (
          <Badge variant="outline" className="text-red-400 border-red-400/50 text-[10px]">
            <ShoppingCart className="w-3 h-3 mr-1" />
            {demand.total_to_order} to order
          </Badge>
        )}
        {health.has_pending_orders && (
          <Badge variant="outline" className="text-purple-400 border-purple-400/50 text-[10px]">
            <Clock className="w-3 h-3 mr-1" />
            Pending orders
          </Badge>
        )}
        {!health.has_unfulfilled_demand && demand.project_count > 0 && (
          <Badge variant="outline" className="text-green-400 border-green-400/50 text-[10px]">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Fully covered
          </Badge>
        )}
      </div>
    </div>
  );
}

function MetricCell({ label, value, color }) {
  return (
    <div>
      <p className={cn("text-lg font-bold", color)}>{value}</p>
      <p className="text-[10px] text-gray-500 leading-tight">{label}</p>
    </div>
  );
}

/* ─── Per-project commitment row ─── */
function ProjectCommitmentRow({ commitment }) {
  const {
    commitment_id,
    project_id,
    project_name,
    required_total,
    reserved_from_stock,
    covered_from_po,
    to_order,
    qty_installed,
    coverage_pct,
    coverage_status,
    source_type,
    next_action,
  } = commitment;

  const coverageColor =
    coverage_status === 'FULLY_COVERED'  ? 'bg-green-500' :
    coverage_status === 'PARTIALLY_COVERED' ? 'bg-yellow-500' :
    'bg-red-500';

  // DEV: Row-level coverage invariant assertion
  // required_total === reserved_from_stock + covered_from_po + qty_installed + to_order
  if (import.meta.env.DEV) {
    const coverageSum = reserved_from_stock + covered_from_po + qty_installed + to_order;
    if (coverageSum !== required_total) {
      console.error('[ROW COVERAGE DRIFT]', {
        commitment_id,
        part_id: commitment.part_id,
        required_total,
        reserved_from_stock,
        covered_from_po,
        qty_installed,
        to_order,
        coverageSum,
        delta: required_total - coverageSum,
      });
    }
  }

  return (
    <Link
      to={createPageUrl('ProjectSupplyManager') + `?project_id=${project_id}`}
      className="block p-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors group"
    >
      {/* Top row: project name + next action */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-white truncate flex-1">{project_name}</span>
        <div className="flex items-center gap-2">
          <NextActionBadge action={next_action} />
          <ArrowRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-colors" />
        </div>
      </div>

      {/* Coverage progress bar */}
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mb-2">
        <div
          className={cn("h-full rounded-full transition-all", coverageColor)}
          style={{ width: `${Math.min(100, coverage_pct)}%` }}
        />
      </div>

      {/* Quantity breakdown — canonical backend fields only, no local math */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
        <QtyChip label="req" value={required_total} />
        <QtyChip label="res" value={reserved_from_stock} color="text-cyan-400" />
        <QtyChip label="PO" value={covered_from_po} color="text-purple-400" show={covered_from_po > 0} />
        <QtyChip label="inst" value={qty_installed} color="text-green-400" show={qty_installed > 0} />
        {to_order > 0 && (
          <span className="text-red-400 font-semibold">
            Gap <span className="font-bold">{to_order}</span>
          </span>
        )}
      </div>

      {/* Source type badge if non-vendor */}
      {source_type && source_type !== 'VENDOR' && (
        <Badge variant="outline" className="mt-2 text-[10px] border-gray-600 text-gray-400">
          {source_type.replace(/_/g, ' ')}
        </Badge>
      )}
    </Link>
  );
}

function QtyChip({ label, value, color, show = true }) {
  if (!show && value === 0) return null;
  return (
    <span className={color || 'text-gray-300'}>
      <span className="font-medium">{value}</span>{' '}
      <span className="text-gray-500">{label.toLowerCase()}</span>
    </span>
  );
}

/* ─── Next Action Badge ─── */
const ACTION_CONFIG = {
  ALLOCATE:   { label: 'Allocate',  icon: BoxSelect,    color: 'text-cyan-400 border-cyan-400/40 bg-cyan-900/20' },
  CREATE_PO:  { label: 'Order',     icon: ShoppingCart,  color: 'text-red-400 border-red-400/40 bg-red-900/20' },
  RECEIVE:    { label: 'Receive',   icon: Truck,         color: 'text-purple-400 border-purple-400/40 bg-purple-900/20' },
  INSTALL:    { label: 'Install',   icon: Wrench,        color: 'text-blue-400 border-blue-400/40 bg-blue-900/20' },
  COMPLETE:   { label: 'Complete',  icon: CheckCircle2,  color: 'text-green-400 border-green-400/40 bg-green-900/20' },
};

function NextActionBadge({ action }) {
  const cfg = ACTION_CONFIG[action];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1 px-1.5 py-0", cfg.color)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

/**
 * Compact version for inline display
 */
export function PartProjectUsageCompact({ partId, isOpen = true }) {
  const { data, isLoading } = useQuery({
    queryKey: ['partSupplyUsage', partId],
    queryFn: async () => {
      const response = await base44.functions.invoke('getPartSupplyUsage', { part_id: partId });
      return response.data;
    },
    enabled: Boolean(isOpen && partId),
    staleTime: 30000,
    gcTime: 120000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, err) => {
      if (err?.status === 429 || err?.status >= 500) return false;
      return failureCount < 1;
    },
  });

  if (isLoading || !data?.success) return null;
  const { demand, commitments } = data;
  if (commitments.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <FolderKanban className="w-3 h-3" />
      <span>{commitments.length} project{commitments.length !== 1 ? 's' : ''}</span>
      <span>•</span>
      <span>{demand.total_required} required</span>
      {demand.total_to_order > 0 && (
        <>
          <span>•</span>
          <span className="text-red-400">{demand.total_to_order} to order</span>
        </>
      )}
    </div>
  );
}