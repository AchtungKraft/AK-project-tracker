import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { orderKeys } from "@/components/financial/queryKeyFactories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Package,
  Truck,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ProjectPurchaseOrders - Project-level PO visibility tab
 * 
 * Shows all POs tied to this project's commitments:
 * - Before receipt
 * - During partial receipt  
 * - After full receipt
 * - Cancelled (read-only)
 */
export default function ProjectPurchaseOrders({ projectId }) {
  const navigate = useNavigate();

  // PHASE 5: Use canonical query key factory for consistent cache invalidation
  const { data, isLoading, refetch } = useQuery({
    queryKey: orderKeys.projectPurchaseOrders(projectId),
    queryFn: async () => {
      const response = await base44.functions.invoke('getProjectPurchaseOrders', { project_id: projectId });
      return response.data;
    },
    enabled: !!projectId,
    // No staleTime - trust invalidation from forceAppRefresh
    staleTime: 0,
  });

  const orders = data?.orders || [];
  const summary = data?.summary || {};

  const getStatusBadge = (order) => {
    if (order.is_cancelled) {
      return <Badge variant="outline" className="bg-gray-500/20 text-gray-400 border-gray-500/30">Cancelled</Badge>;
    }
    if (order.is_fully_received) {
      return <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">Received</Badge>;
    }
    if (order.total_qty_received > 0) {
      return <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30">Partial</Badge>;
    }
    return <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">Ordered</Badge>;
  };

  const handleReceive = (orderId) => {
    navigate(createPageUrl('POReceiving') + `?order_id=${orderId}`);
  };

  if (isLoading) {
    return (
      <Card className="bg-gray-900/50 border-gray-700">
        <CardContent className="p-8 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-500" />
          <span className="ml-2 text-gray-400">Loading purchase orders...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-white">{summary.total_orders || 0}</div>
            <div className="text-sm text-gray-400">Total POs</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-400">{summary.total_qty_ordered || 0}</div>
            <div className="text-sm text-gray-400">Qty Ordered</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-400">{summary.total_qty_received || 0}</div>
            <div className="text-sm text-gray-400">Qty Received</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-400">{summary.receivable_count || 0}</div>
            <div className="text-sm text-gray-400">Awaiting Receipt</div>
          </CardContent>
        </Card>
      </div>

      {/* Orders List */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-400" />
            Purchase Orders
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No purchase orders for this project</p>
              <p className="text-gray-500 text-sm mt-1">Orders will appear here when parts are ordered</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700 hover:bg-transparent">
                  <TableHead>PO Number</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(order => (
                  <TableRow 
                    key={order.order_id} 
                    className={cn(
                      "border-gray-700",
                      order.is_cancelled && "opacity-50"
                    )}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-white">{order.po_number}</span>
                        {order.order_url && (
                          <a 
                            href={order.order_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      {order.order_number && (
                        <div className="text-xs text-gray-500">Ref: {order.order_number}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-300">{order.vendor_name}</TableCell>
                    <TableCell className="text-gray-400 text-sm">{order.order_date || '-'}</TableCell>
                    <TableCell className="text-center">{getStatusBadge(order)}</TableCell>
                    <TableCell className="text-right font-mono">{order.total_lines}</TableCell>
                    <TableCell className="text-right font-mono text-blue-400">{order.total_qty_ordered}</TableCell>
                    <TableCell className="text-right font-mono text-green-400">{order.total_qty_received}</TableCell>
                    <TableCell className="text-right font-mono text-gray-300">
                      ${order.total_cost?.toFixed(2) || '0.00'}
                    </TableCell>
                    <TableCell>
                      {order.is_receivable && !order.is_cancelled && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleReceive(order.order_id)}
                          className="border-green-600 text-green-400 hover:bg-green-600/20"
                        >
                          <Truck className="w-3 h-3 mr-1" />
                          Receive
                        </Button>
                      )}
                      {order.is_fully_received && (
                        <span className="text-green-500 flex items-center gap-1 text-sm">
                          <CheckCircle2 className="w-4 h-4" />
                          Complete
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Cost Summary */}
      {summary.total_cost > 0 && (
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Total Parts Cost (this project)</span>
              <span className="text-xl font-bold text-white">${summary.total_cost?.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}