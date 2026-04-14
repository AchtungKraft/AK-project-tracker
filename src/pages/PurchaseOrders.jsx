import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShoppingCart,
  Search,
  RefreshCw,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import POStatusGroup from "@/components/purchasing/POStatusGroup";

function groupByStatus(orders) {
  const draft = [];
  const ordered = [];
  const partial = [];
  const received = [];
  const cancelled = [];

  for (const po of orders) {
    if (po.status === 'Cancelled') {
      cancelled.push(po);
    } else if (po.total_qty_ordered > 0 && po.total_qty_remaining === 0) {
      received.push(po);
    } else if (po.total_qty_received > 0 && po.total_qty_remaining > 0) {
      partial.push(po);
    } else if (po.status === 'Ordered') {
      ordered.push(po);
    } else {
      draft.push(po);
    }
  }

  return { draft, ordered, partial, received, cancelled };
}

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['allPurchaseOrders', statusFilter, vendorFilter, projectFilter],
    queryFn: async () => {
      const res = await base44.functions.invoke('getAllPurchaseOrders', {
        filters: {
          status: statusFilter !== 'all' ? statusFilter : undefined,
          vendor_id: vendorFilter !== 'all' ? vendorFilter : undefined,
          project_id: projectFilter !== 'all' ? projectFilter : undefined,
        },
      });
      return res.data;
    },
    staleTime: 30000,
  });

  const orders = data?.orders || [];
  const summary = data?.summary || {};
  const filterOptions = data?.filter_options || {};

  const filteredOrders = useMemo(() => {
    if (!searchTerm) return orders;
    const term = searchTerm.toLowerCase();
    return orders.filter(o =>
      (o.po_number && o.po_number.toLowerCase().includes(term)) ||
      (o.order_number && o.order_number.toLowerCase().includes(term)) ||
      (o.vendor_name && o.vendor_name.toLowerCase().includes(term)) ||
      (o.project_names?.some(n => n.toLowerCase().includes(term)))
    );
  }, [orders, searchTerm]);

  const { draft, ordered, partial, received, cancelled } = useMemo(
    () => groupByStatus(filteredOrders), [filteredOrders]
  );

  const handleNavigate = (orderId) => {
    navigate(createPageUrl("POReceiving") + `?order_id=${orderId}`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-red-500" />
            Purchase Orders
          </h1>
          <p className="text-gray-400 text-sm mt-1">All purchase orders across the system</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-white">{summary.total_orders || 0}</div>
            <div className="text-xs text-gray-500">Total POs</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-emerald-400 font-mono">
              ${(summary.total_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-gray-500">Total Cost</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-blue-400">{summary.total_qty_ordered || 0}</div>
            <div className="text-xs text-gray-500">Qty Ordered</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-green-400">{summary.total_qty_received || 0}</div>
            <div className="text-xs text-gray-500">Qty Received</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-amber-400">{summary.total_qty_remaining || 0}</div>
            <div className="text-xs text-gray-500">Qty Remaining</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search PO, vendor, project..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-gray-900 border-gray-700"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-gray-900 border-gray-700">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {(filterOptions.statuses || []).map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="w-48 bg-gray-900 border-gray-700">
            <SelectValue placeholder="All Vendors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vendors</SelectItem>
            {(filterOptions.vendors || []).sort((a, b) => a.vendor_name.localeCompare(b.vendor_name)).map(v => (
              <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-48 bg-gray-900 border-gray-700">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {(filterOptions.projects || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grouped Tables */}
      {isLoading ? (
        <Card className="bg-gray-900/50 border-gray-700 p-8 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-500 mx-auto" />
          <p className="text-gray-400 mt-2">Loading purchase orders...</p>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card className="bg-gray-900/50 border-gray-700 p-8 text-center">
          <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">
            {orders.length === 0 ? 'No purchase orders found' : 'No orders match your filters'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <POStatusGroup
            title="Draft"
            colorClass="text-gray-400"
            orders={draft}
            onNavigate={handleNavigate}
            showProject
          />
          <POStatusGroup
            title="Ordered — Awaiting Receipt"
            colorClass="text-blue-400"
            orders={ordered}
            onNavigate={handleNavigate}
            showProject
          />
          <POStatusGroup
            title="Partially Received"
            colorClass="text-amber-400"
            orders={partial}
            onNavigate={handleNavigate}
            showProject
          />
          <POStatusGroup
            title="Fully Received"
            colorClass="text-green-400"
            orders={received}
            onNavigate={handleNavigate}
            showProject
            defaultCollapsed
          />
          <POStatusGroup
            title="Cancelled"
            colorClass="text-red-400"
            orders={cancelled}
            onNavigate={handleNavigate}
            showProject
            defaultCollapsed
          />
        </div>
      )}
    </div>
  );
}