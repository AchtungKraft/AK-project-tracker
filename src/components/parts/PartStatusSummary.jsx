import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { 
  Package, Truck, FolderKanban, ExternalLink, AlertTriangle,
  CheckCircle2, Clock
} from "lucide-react";

/**
 * PartStatusSummary - CANONICAL: Read-only summary using supply read model
 * NO local InventoryItem math. All data from getPartSupplyUsage.
 */
export default function PartStatusSummary({ partId }) {
  // CANONICAL: Fetch from read model
  const { data: supplyUsage } = useQuery({
    queryKey: ['partSupplyUsage', partId],
    queryFn: async () => {
      const res = await base44.functions.invoke('getPartSupplyUsage', { part_id: partId });
      return res.data;
    },
    enabled: !!partId,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list(),
  });

  // CANONICAL inventory from read model
  const inventory = supplyUsage?.inventory || {};
  const demand = supplyUsage?.demand || {};
  const commitments = supplyUsage?.commitments || [];

  const onHand = inventory.physical_stock ?? 0;
  const reserved = inventory.allocated_total ?? 0;
  const available = inventory.available ?? 0;
  const totalNeeded = demand.total_required ?? 0;
  const totalOnOrder = demand.total_on_order ?? 0;
  const toOrder = demand.total_to_order ?? 0;
  const netPosition = available + totalOnOrder - toOrder;

  // Line items for this part (for On Order display)
  const partLineItems = lineItems.filter(li => li.part_id === partId);

  // CANONICAL: Status badge from commitment data
  const getStatusBadge = (commitment) => {
    const required = commitment.required_total ?? 0;
    const installed = commitment.qty_installed ?? 0;
    const reserved = commitment.reserved_from_stock ?? 0;
    const onOrder = commitment.on_order ?? 0;
    
    if (installed >= required) {
      return <Badge className="bg-green-600 text-white text-xs">Installed</Badge>;
    }
    if (installed > 0) {
      return <Badge className="bg-green-600/50 text-white text-xs">Partial Install</Badge>;
    }
    if (reserved >= required) {
      return <Badge className="bg-blue-600 text-white text-xs">Allocated</Badge>;
    }
    if (reserved > 0) {
      return <Badge className="bg-blue-600/50 text-white text-xs">Partial Alloc</Badge>;
    }
    if (onOrder > 0) {
      return <Badge className="bg-yellow-600 text-white text-xs">On Order</Badge>;
    }
    return <Badge className="bg-red-600 text-white text-xs">Needed</Badge>;
  };

  const getLineItemStatus = (li) => {
    if (li.qty_received >= li.qty_ordered) {
      return <Badge className="bg-green-600 text-white text-xs">Received</Badge>;
    }
    if (li.qty_received > 0) {
      return <Badge className="bg-yellow-600 text-white text-xs">Partial</Badge>;
    }
    return <Badge className="bg-orange-600 text-white text-xs">Ordered</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Inventory Position Summary */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Package className="w-4 h-4 text-blue-400" />
          <h4 className="text-sm font-medium text-white">Inventory Position</h4>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          <div className="p-2 bg-gray-800/50 rounded text-center">
            <p className="text-xs text-gray-500">On Hand</p>
            <p className="text-sm font-bold text-white">{onHand}</p>
          </div>
          <div className="p-2 bg-gray-800/50 rounded text-center">
            <p className="text-xs text-gray-500">Reserved</p>
            <p className="text-sm font-bold text-yellow-400">{reserved}</p>
          </div>
          <div className="p-2 bg-gray-800/50 rounded text-center">
            <p className="text-xs text-gray-500">Available</p>
            <p className={`text-sm font-bold ${available > 0 ? 'text-blue-400' : 'text-red-400'}`}>{available}</p>
          </div>
          <div className="p-2 bg-gray-800/50 rounded text-center">
            <p className="text-xs text-gray-500">Required</p>
            <p className={`text-sm font-bold ${totalNeeded > 0 ? 'text-purple-400' : 'text-gray-500'}`}>{totalNeeded}</p>
          </div>
          <div className="p-2 bg-gray-800/50 rounded text-center">
            <p className="text-xs text-gray-500">On Order</p>
            <p className={`text-sm font-bold ${totalOnOrder > 0 ? 'text-orange-400' : 'text-gray-500'}`}>{totalOnOrder}</p>
          </div>
          <div className="p-2 bg-gray-800/50 rounded text-center">
            <p className="text-xs text-gray-500">To Order</p>
            <p className={`text-sm font-bold ${toOrder > 0 ? 'text-red-400' : 'text-gray-500'}`}>{toOrder}</p>
          </div>
        </div>
      </div>

      {/* Project Demand - CANONICAL: from commitments in read model */}
      {commitments.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FolderKanban className="w-4 h-4 text-purple-400" />
            <h4 className="text-sm font-medium text-white">Project Demand ({commitments.length})</h4>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {commitments.map(c => {
              return (
                <Link 
                  key={c.commitment_id}
                  to={createPageUrl(`ProjectDetail?id=${c.project_id}&tab=parts`)}
                  className="flex items-center justify-between p-2 bg-gray-800/30 rounded hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-white truncate">{c.project_name || 'Unknown Project'}</span>
                    {getStatusBadge(c)}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0">
                    <span title="Required">{c.required_total || 0}</span>
                    <span>/</span>
                    <span className="text-blue-400" title="Reserved">{c.reserved_from_stock || 0}</span>
                    <span>/</span>
                    <span className="text-green-400" title="Installed">{c.qty_installed || 0}</span>
                    <ExternalLink className="w-3 h-3 text-gray-500" />
                  </div>
                </Link>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-1 text-right">Required / Reserved / Installed</p>
        </div>
      )}

      {/* On Order */}
      {partLineItems.filter(li => (li.qty_ordered || 0) > (li.qty_received || 0)).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-4 h-4 text-yellow-400" />
            <h4 className="text-sm font-medium text-white">
              On Order ({partLineItems.filter(li => (li.qty_ordered || 0) > (li.qty_received || 0)).length})
            </h4>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {partLineItems
              .filter(li => (li.qty_ordered || 0) > (li.qty_received || 0))
              .map(li => {
                const order = orders.find(o => o.id === li.order_id);
                const vendor = vendors.find(v => v.id === order?.vendor_id);
                return (
                  <div 
                    key={li.id}
                    className="flex items-center justify-between p-2 bg-gray-800/30 rounded"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-white">{order?.po_number || 'No PO#'}</span>
                      {vendor && <span className="text-xs text-gray-500">({vendor.vendor_name})</span>}
                      {getLineItemStatus(li)}
                    </div>
                    <div className="flex items-center gap-3 text-xs flex-shrink-0">
                      <span className="text-gray-400">
                        {li.qty_received || 0}/{li.qty_ordered || 0}
                      </span>
                      {order?.eta_date && (
                        <span className="text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(order.eta_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
          <p className="text-xs text-gray-500 mt-1 text-right">Received / Ordered</p>
        </div>
      )}

      {/* Empty state */}
      {commitments.length === 0 && partLineItems.length === 0 && onHand === 0 && (
        <div className="text-center py-4 text-gray-500 text-sm">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No activity for this part yet</p>
        </div>
      )}
    </div>
  );
}