import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PartProjectUsageSection - Shows which projects are using a part
 * 
 * Displays:
 * - Part inventory summary
 * - List of projects with commitment details
 * - Coverage status per project
 * 
 * PERF FIX: This section is NON-BLOCKING - errors here don't block modal render.
 * Accepts isOpen prop to gate queries when modal is closed/collapsed.
 * Query only runs when isOpen === true AND partId exists.
 */
export default function PartProjectUsageSection({ partId, isOpen = true }) {
  // PERF FIX: Gate with isOpen + partId, add retry control
  // Query is completely disabled if isOpen is false
  const queryEnabled = Boolean(isOpen && partId);
  
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['partSupplyUsage', partId],
    queryFn: async () => {
      // Defensive: prevent late resolution into closed section
      if (!partId) return null;
      if (process.env.NODE_ENV === 'development') {
        console.debug('[PartProjectUsageSection] query start', partId);
      }
      const response = await base44.functions.invoke('getPartSupplyUsage', { part_id: partId });
      if (process.env.NODE_ENV === 'development') {
        console.debug('[PartProjectUsageSection] query success', partId);
      }
      return response.data;
    },
    enabled: queryEnabled,
    staleTime: 30000,
    gcTime: 120000,
    placeholderData: (prev) => prev, // keeps previous data during part switch
    networkMode: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      // Stop retrying on rate limit or server error
      if (error?.status === 429 || error?.status >= 500) return false;
      return failureCount < 1;
    },
  });

  // If section is not open, render nothing (don't even show skeleton)
  if (!isOpen) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full bg-gray-800" />
        <Skeleton className="h-16 w-full bg-gray-800" />
        <Skeleton className="h-16 w-full bg-gray-800" />
      </div>
    );
  }

  // PERF FIX: Non-blocking error state - show actionable message, don't break modal
  if (error) {
    const errorMessage = error?.status === 429 
      ? 'Rate limited - please wait a moment' 
      : 'Unable to load project usage';
    return (
      <div className="text-sm text-red-400 p-3 bg-red-900/20 rounded-lg flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        {errorMessage}
      </div>
    );
  }

  // Handle success:false from backend
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
      {/* Inventory Summary Card */}
      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Package className="w-4 h-4" />
            Inventory Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{inventory.physical_stock}</p>
              <p className="text-xs text-gray-500">In Stock</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-cyan-400">{inventory.allocated_total}</p>
              <p className="text-xs text-gray-500">Reserved</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">{inventory.available}</p>
              <p className="text-xs text-gray-500">Available</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-400">{inventory.on_order_total}</p>
              <p className="text-xs text-gray-500">On Order</p>
            </div>
          </div>

          {/* Health indicators */}
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-700">
            {health.is_low_stock && (
              <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 text-xs">
                <AlertCircle className="w-3 h-3 mr-1" />
                Low Stock
              </Badge>
            )}
            {health.has_unfulfilled_demand && (
              <Badge variant="outline" className="text-red-400 border-red-400/50 text-xs">
                <ShoppingCart className="w-3 h-3 mr-1" />
                {demand.total_to_order} To Order
              </Badge>
            )}
            {health.has_pending_orders && (
              <Badge variant="outline" className="text-purple-400 border-purple-400/50 text-xs">
                <Clock className="w-3 h-3 mr-1" />
                Orders Pending
              </Badge>
            )}
            {!health.has_unfulfilled_demand && demand.project_count > 0 && (
              <Badge variant="outline" className="text-green-400 border-green-400/50 text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Fully Covered
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Demand Summary */}
      {demand.project_count > 0 && (
        <div className="bg-gray-800/30 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-2">Demand Across {demand.project_count} Project(s)</p>
          <div className="flex gap-4 text-sm">
            <span className="text-gray-300">
              <span className="font-bold text-white">{demand.total_required}</span> Required
            </span>
            <span className="text-cyan-400">
              <span className="font-bold">{demand.total_reserved}</span> Reserved
            </span>
            <span className="text-green-400">
              <span className="font-bold">{demand.total_installed}</span> Installed
            </span>
          </div>
        </div>
      )}

      {/* Project Commitments List */}
      <div>
        <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
          <FolderKanban className="w-4 h-4" />
          Used in Projects ({commitments.length})
        </h4>
        
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
    </div>
  );
}

function ProjectCommitmentRow({ commitment }) {
  const {
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
    next_action
  } = commitment;

  const coverageColor = coverage_status === 'FULLY_COVERED' 
    ? 'bg-green-500' 
    : coverage_status === 'PARTIALLY_COVERED' 
      ? 'bg-yellow-500' 
      : 'bg-red-500';

  const nextActionLabel = {
    'CREATE_PO': 'Need to Order',
    'INSTALL': 'Ready to Install',
    'COMPLETE': 'Complete'
  }[next_action] || next_action;

  const nextActionColor = {
    'CREATE_PO': 'text-red-400',
    'INSTALL': 'text-blue-400',
    'COMPLETE': 'text-green-400'
  }[next_action] || 'text-gray-400';

  return (
    <Link
      to={createPageUrl('ProjectSupplyManager') + `?project_id=${project_id}`}
      className="block p-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-white truncate flex-1">{project_name}</span>
        <ArrowRight className="w-4 h-4 text-gray-500" />
      </div>
      
      {/* Progress bar */}
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mb-2">
        <div 
          className={cn("h-full rounded-full transition-all", coverageColor)}
          style={{ width: `${Math.min(100, coverage_pct)}%` }}
        />
      </div>
      
      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-3 text-gray-400">
          <span><span className="text-white font-medium">{required_total}</span> req</span>
          <span className="text-cyan-400"><span className="font-medium">{reserved_from_stock}</span> res</span>
          {covered_from_po > 0 && (
            <span className="text-purple-400"><span className="font-medium">{covered_from_po}</span> ord</span>
          )}
          {qty_installed > 0 && (
            <span className="text-green-400"><span className="font-medium">{qty_installed}</span> inst</span>
          )}
        </div>
        <span className={cn("font-medium", nextActionColor)}>
          {nextActionLabel}
        </span>
      </div>

      {/* Source type badge */}
      {source_type && source_type !== 'VENDOR' && (
        <Badge 
          variant="outline" 
          className="mt-2 text-xs border-gray-600 text-gray-400"
        >
          {source_type.replace(/_/g, ' ')}
        </Badge>
      )}
    </Link>
  );
}

/**
 * Compact version for inline display
 * PERF FIX: Uses same caching config as main section
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
    retry: (failureCount, error) => {
      if (error?.status === 429 || error?.status >= 500) return false;
      return failureCount < 1;
    },
  });

  if (isLoading || !data?.success) {
    return null;
  }

  const { demand, commitments } = data;

  if (commitments.length === 0) {
    return null;
  }

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