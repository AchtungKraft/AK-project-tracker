import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { orderKeys } from "@/components/financial/queryKeyFactories";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Package,
  Truck,
  Search,
  RefreshCw,
  CheckCircle2,
  ArrowDownWideNarrow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import POReceivingCard from "@/components/receiving/POReceivingCard";

// ── Reuse identical sort/group logic from POReceivingList ──

const SORT_OPTIONS = [
  { value: "most_remaining", label: "Most Items to Receive" },
  { value: "newest", label: "Newest Order" },
  { value: "vendor", label: "Vendor Name" },
  { value: "partial_first", label: "Partially Received First" },
];

function sortOrders(orders, sortBy) {
  const sorted = [...orders];
  switch (sortBy) {
    case "most_remaining":
      return sorted.sort((a, b) => b.total_qty_remaining - a.total_qty_remaining);
    case "newest":
      return sorted.sort((a, b) => (b.order_date || "").localeCompare(a.order_date || ""));
    case "vendor":
      return sorted.sort((a, b) => (a.vendor_name || "").localeCompare(b.vendor_name || ""));
    case "partial_first":
      return sorted.sort((a, b) => {
        const aPartial = a.total_qty_received > 0 && a.total_qty_remaining > 0 ? 0 : 1;
        const bPartial = b.total_qty_received > 0 && b.total_qty_remaining > 0 ? 0 : 1;
        if (aPartial !== bPartial) return aPartial - bPartial;
        return b.total_qty_remaining - a.total_qty_remaining;
      });
    default:
      return sorted;
  }
}

function groupOrders(orders) {
  const ready = [];
  const partial = [];
  const full = [];

  for (const po of orders) {
    if (po.total_qty_received >= po.total_qty_ordered && po.total_qty_ordered > 0) {
      full.push(po);
    } else if (po.total_qty_received > 0 && po.total_qty_remaining > 0) {
      partial.push(po);
    } else {
      ready.push(po);
    }
  }

  return { ready, partial, full };
}

// ── Collapsible group section (same pattern as POReceivingList) ──

function OrderGroup({ title, colorClass, borderClass, orders, onNavigate, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (orders.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 mb-3 group"
      >
        <h2 className={cn("text-xs font-semibold uppercase tracking-wider", colorClass)}>
          {title}
        </h2>
        <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-600">
          {orders.length}
        </Badge>
        <span className="text-gray-600 text-xs group-hover:text-gray-400 transition-colors">
          {collapsed ? "Show" : "Hide"}
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-3">
          {orders.map((po) => (
            <POReceivingCard
              key={po.order_id}
              po={po}
              borderClass={borderClass}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ProjectPurchaseOrders - Project-level PO tab
 * 
 * Reuses the same sort/group/card system as POReceivingList,
 * but scoped to a single project's purchase orders.
 * Receive button navigates to canonical POReceiving detail page.
 */
export default function ProjectPurchaseOrders({ projectId }) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [sortBy, setSortBy] = useState("most_remaining");

  const { data, isLoading, refetch } = useQuery({
    queryKey: orderKeys.projectPurchaseOrders(projectId),
    queryFn: async () => {
      const response = await base44.functions.invoke('getProjectPurchaseOrders', { project_id: projectId });
      return response.data;
    },
    enabled: !!projectId,
    staleTime: 0,
  });

  const rawOrders = data?.orders || [];
  const summary = data?.summary || {};

  // Enrich orders with part_names for POReceivingCard compatibility
  const enrichedOrders = useMemo(() => {
    return rawOrders.map(order => {
      const partNames = [];
      const seenPartIds = new Set();
      for (const line of (order.lines || [])) {
        if (line.is_line_cancelled || !line.part_id || seenPartIds.has(line.part_id)) continue;
        seenPartIds.add(line.part_id);
        if (line.part_name && line.part_name !== 'Unknown Part') partNames.push(line.part_name);
      }
      return { ...order, part_names: partNames };
    });
  }, [rawOrders]);

  // Extract unique vendors for filter dropdown
  const vendorOptions = useMemo(() => {
    const map = new Map();
    for (const order of enrichedOrders) {
      if (order.vendor_id && order.vendor_name) {
        map.set(order.vendor_id, { id: order.vendor_id, vendor_name: order.vendor_name });
      }
    }
    return [...map.values()].sort((a, b) => a.vendor_name.localeCompare(b.vendor_name));
  }, [enrichedOrders]);

  // Apply filters
  const filteredOrders = useMemo(() => {
    let result = enrichedOrders;

    if (vendorFilter !== "all") {
      result = result.filter(o => o.vendor_id === vendorFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(o =>
        (o.po_number && o.po_number.toLowerCase().includes(term)) ||
        (o.order_number && o.order_number.toLowerCase().includes(term)) ||
        (o.vendor_name && o.vendor_name.toLowerCase().includes(term))
      );
    }

    return result;
  }, [enrichedOrders, vendorFilter, searchTerm]);

  // Sort and group
  const sortedOrders = useMemo(() => sortOrders(filteredOrders, sortBy), [filteredOrders, sortBy]);
  const { ready, partial, full } = useMemo(() => groupOrders(sortedOrders), [sortedOrders]);

  const handleNavigate = (orderId) => {
    navigate(createPageUrl("POReceiving") + `?order_id=${orderId}`);
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

      {/* Filters + Sort */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search PO number, vendor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-gray-900 border-gray-700"
          />
        </div>
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="w-48 bg-gray-900 border-gray-700">
            <SelectValue placeholder="All Vendors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vendors</SelectItem>
            {vendorOptions.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-56 bg-gray-900 border-gray-700">
            <div className="flex items-center gap-2">
              <ArrowDownWideNarrow className="w-4 h-4 text-gray-400" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="border-gray-700">
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Grouped Order Cards */}
      {filteredOrders.length === 0 ? (
        <Card className="bg-gray-900/50 border-gray-700 p-8 text-center">
          {enrichedOrders.length === 0 ? (
            <>
              <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No purchase orders for this project</p>
              <p className="text-gray-500 text-sm mt-1">Orders will appear here when parts are ordered</p>
            </>
          ) : (
            <>
              <Search className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No orders match your filters</p>
            </>
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          <OrderGroup
            title="Ready to Receive"
            colorClass="text-blue-400"
            borderClass="border-l-blue-500"
            orders={ready}
            onNavigate={handleNavigate}
          />
          <OrderGroup
            title="Partially Received"
            colorClass="text-amber-400"
            borderClass="border-l-amber-500"
            orders={partial}
            onNavigate={handleNavigate}
          />
          <OrderGroup
            title="Fully Received"
            colorClass="text-green-400"
            borderClass="border-l-green-500"
            orders={full}
            onNavigate={handleNavigate}
            defaultCollapsed
          />
        </div>
      )}

      {/* Cost Summary */}
      {summary.total_cost > 0 && (
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Total Parts Cost (this project)</span>
              <span className="text-xl font-bold text-white font-mono">${summary.total_cost?.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}