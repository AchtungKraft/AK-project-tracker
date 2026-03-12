import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import POReceivingCard from "./POReceivingCard";

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

export default function POReceivingList({
  orders,
  summary,
  filterOptions,
  isLoading,
  onRefresh,
  searchTerm,
  onSearchChange,
  vendorFilter,
  onVendorFilterChange,
}) {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState("most_remaining");

  const sortedOrders = useMemo(() => sortOrders(orders || [], sortBy), [orders, sortBy]);
  const { ready, partial, full } = useMemo(() => groupOrders(sortedOrders), [sortedOrders]);

  const handleNavigate = (orderId) => {
    navigate(createPageUrl("POReceiving") + `?order_id=${orderId}`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Truck className="w-6 h-6 text-green-500" />
            PO Receiving
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Fast batch receiving by purchase order
          </p>
        </div>
        <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-white">{summary.total_orders || 0}</div>
              <div className="text-sm text-gray-400">Open Orders</div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-400">{summary.total_lines || 0}</div>
              <div className="text-sm text-gray-400">Line Items</div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-400">{summary.total_qty_remaining || 0}</div>
              <div className="text-sm text-gray-400">Qty to Receive</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters + Sort */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search PO number, vendor..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 bg-gray-900 border-gray-700"
          />
        </div>
        <Select value={vendorFilter} onValueChange={onVendorFilterChange}>
          <SelectTrigger className="w-48 bg-gray-900 border-gray-700">
            <SelectValue placeholder="All Vendors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vendors</SelectItem>
            {filterOptions?.vendors?.map((v) => (
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
      </div>

      {/* Orders List */}
      {isLoading ? (
        <Card className="bg-gray-900/50 border-gray-700 p-8 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-500 mx-auto" />
          <p className="text-gray-400 mt-2">Loading orders...</p>
        </Card>
      ) : (orders?.length === 0) ? (
        <Card className="bg-gray-900/50 border-gray-700 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-white font-medium">All caught up!</p>
          <p className="text-gray-400 text-sm">No orders waiting to be received</p>
        </Card>
      ) : (
        <div className="space-y-6">
          <POReceivingGroup
            title="Ready to Receive"
            colorClass="text-blue-400"
            borderClass="border-l-blue-500"
            orders={ready}
            onNavigate={handleNavigate}
          />
          <POReceivingGroup
            title="Partially Received"
            colorClass="text-amber-400"
            borderClass="border-l-amber-500"
            orders={partial}
            onNavigate={handleNavigate}
          />
          <POReceivingGroup
            title="Fully Received"
            colorClass="text-green-400"
            borderClass="border-l-green-500"
            orders={full}
            onNavigate={handleNavigate}
            defaultCollapsed
          />
        </div>
      )}
    </div>
  );
}

function POReceivingGroup({ title, colorClass, borderClass, orders, onNavigate, defaultCollapsed = false }) {
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