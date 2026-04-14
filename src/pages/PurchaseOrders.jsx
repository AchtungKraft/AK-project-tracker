import React, { useState, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
  ChevronsUpDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import POStatusGroup from "@/components/purchasing/POStatusGroup";
import POPrimaryGroup from "@/components/purchasing/POPrimaryGroup";

// ── Status Classification ──
// Strictly uses Order.status as the canonical field.
// Draft = "Draft", Ordered = "Ordered", Partial = "Partial", Received = "Received", Cancelled = "Cancelled"
// Fallback: if status doesn't match known values, classify based on qty data.

function classifyStatus(po) {
  const s = po.status;
  if (s === "Cancelled") return "Cancelled";
  if (s === "Draft") return "Draft";
  if (s === "Received") return "Received";
  if (s === "Partial") return "Partial";
  if (s === "Ordered") {
    // Ordered but might have receiving progress — refine
    if (po.total_qty_ordered > 0 && po.total_qty_remaining === 0) return "Received";
    if (po.total_qty_received > 0 && po.total_qty_remaining > 0) return "Partial";
    return "Ordered";
  }
  // Unknown status — derive from quantities
  if (po.total_qty_ordered > 0 && po.total_qty_remaining === 0) return "Received";
  if (po.total_qty_received > 0 && po.total_qty_remaining > 0) return "Partial";
  return "Draft";
}

// ── Sort ──
function sortOrders(orders, sortKey) {
  const sorted = [...orders];
  switch (sortKey) {
    case "newest":
      return sorted.sort((a, b) => (b.order_date || "").localeCompare(a.order_date || ""));
    case "oldest":
      return sorted.sort((a, b) => (a.order_date || "").localeCompare(b.order_date || ""));
    case "cost":
      return sorted.sort((a, b) => (b.total_cost || 0) - (a.total_cost || 0));
    case "remaining":
      return sorted.sort((a, b) => (b.total_qty_remaining || 0) - (a.total_qty_remaining || 0));
    default:
      return sorted;
  }
}

// ── Group Configs ──
const STATUS_GROUP_CONFIG = [
  { key: "Draft",     title: "Draft",                     colorClass: "text-gray-400",  defaultCollapsed: false },
  { key: "Ordered",   title: "Ordered — Awaiting Receipt", colorClass: "text-blue-400",  defaultCollapsed: false },
  { key: "Partial",   title: "Partially Received",         colorClass: "text-amber-400", defaultCollapsed: false },
  { key: "Received",  title: "Fully Received",             colorClass: "text-green-400", defaultCollapsed: true },
  { key: "Cancelled", title: "Cancelled",                  colorClass: "text-red-400",   defaultCollapsed: true },
];

function buildStatusGroups(orders) {
  const buckets = { Draft: [], Ordered: [], Partial: [], Received: [], Cancelled: [] };
  for (const po of orders) {
    const status = classifyStatus(po);
    if (buckets[status]) buckets[status].push(po);
    else buckets.Draft.push(po);
  }
  return STATUS_GROUP_CONFIG.map(cfg => ({
    ...cfg,
    orders: buckets[cfg.key],
  }));
}

function buildVendorGroups(orders) {
  const map = {};
  for (const po of orders) {
    const key = po.vendor_name || "Unknown Vendor";
    if (!map[key]) map[key] = [];
    map[key].push(po);
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, list]) => ({
      key: name,
      title: name,
      colorClass: "text-gray-300",
      defaultCollapsed: false,
      orders: list,
    }));
}

function buildProjectGroups(orders) {
  const map = {};
  for (const po of orders) {
    const projects = po.project_names?.length ? po.project_names : ["No Project"];
    for (const pName of projects) {
      if (!map[pName]) map[pName] = [];
      map[pName].push(po);
    }
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, list]) => ({
      key: name,
      title: name,
      colorClass: "text-gray-300",
      defaultCollapsed: false,
      orders: list,
    }));
}

// ── Status Toggle Chips ──
const STATUS_TOGGLES = [
  { key: "Draft",     label: "Draft",     color: "text-gray-300 border-gray-600" },
  { key: "Ordered",   label: "Ordered",   color: "text-blue-400 border-blue-500/50" },
  { key: "Partial",   label: "Partial",   color: "text-amber-400 border-amber-500/50" },
  { key: "Received",  label: "Received",  color: "text-green-400 border-green-500/50" },
  { key: "Cancelled", label: "Cancelled", color: "text-red-400 border-red-500/50" },
];

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [groupBy, setGroupBy] = useState("status");
  const [thenBy, setThenBy] = useState("vendor");
  const [sortKey, setSortKey] = useState("newest");
  const [visibleStatuses, setVisibleStatuses] = useState(
    () => new Set(["Draft", "Ordered", "Partial", "Received", "Cancelled"])
  );
  const [globalCollapse, setGlobalCollapse] = useState(null); // null = per-group default

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
    staleTime: 0,
  });

  const orders = data?.orders || [];
  const summary = data?.summary || {};
  const filterOptions = data?.filter_options || {};

  // Search filter
  const searchedOrders = useMemo(() => {
    if (!searchTerm) return orders;
    const term = searchTerm.toLowerCase();
    return orders.filter(o =>
      (o.po_number && o.po_number.toLowerCase().includes(term)) ||
      (o.order_number && o.order_number.toLowerCase().includes(term)) ||
      (o.vendor_name && o.vendor_name.toLowerCase().includes(term)) ||
      (o.project_names?.some(n => n.toLowerCase().includes(term)))
    );
  }, [orders, searchTerm]);

  // Status visibility filter
  const visibleOrders = useMemo(() => {
    return searchedOrders.filter(po => visibleStatuses.has(classifyStatus(po)));
  }, [searchedOrders, visibleStatuses]);

  // Sort
  const sortedOrders = useMemo(() => sortOrders(visibleOrders, sortKey), [visibleOrders, sortKey]);

  // Build sub-groups for a set of orders using a given dimension
  const buildSubGroups = useCallback((ordersList, dimension) => {
    switch (dimension) {
      case "status":  return buildStatusGroups(ordersList);
      case "vendor":  return buildVendorGroups(ordersList);
      case "project": return buildProjectGroups(ordersList);
      default:        return null;
    }
  }, []);

  // Group (primary + optional secondary)
  const groups = useMemo(() => {
    let primary;
    switch (groupBy) {
      case "vendor":  primary = buildVendorGroups(sortedOrders); break;
      case "project": primary = buildProjectGroups(sortedOrders); break;
      default:        primary = buildStatusGroups(sortedOrders); break;
    }
    if (thenBy === "none" || thenBy === groupBy) return primary;

    // Attach sub-groups to each primary group
    return primary.map(g => ({
      ...g,
      subGroups: buildSubGroups(g.orders, thenBy),
    }));
  }, [sortedOrders, groupBy, thenBy, buildSubGroups]);

  const handleNavigate = (orderId) => {
    navigate(createPageUrl("POReceiving") + `?order_id=${orderId}`, {
      state: { from: location.pathname },
    });
  };

  const toggleStatus = useCallback((key) => {
    setVisibleStatuses(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const allCollapsed = globalCollapse === true;
  const handleCollapseAll = () => setGlobalCollapse(true);
  const handleExpandAll = () => setGlobalCollapse(false);
  // Reset global control when user manually toggles a single group
  const handleGroupToggle = useCallback(() => setGlobalCollapse(null), []);

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

      {/* Filters Row */}
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

      {/* Controls Row: Group By, Sort, Collapse, Status Toggles */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Group By */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Group</span>
          <Select value={groupBy} onValueChange={(v) => { setGroupBy(v); if (thenBy === v) setThenBy("none"); }}>
            <SelectTrigger className="w-32 h-8 text-xs bg-gray-900 border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
              <SelectItem value="project">Project</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Then By */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Then</span>
          <Select value={thenBy} onValueChange={setThenBy}>
            <SelectTrigger className="w-32 h-8 text-xs bg-gray-900 border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {groupBy !== "status"  && <SelectItem value="status">Status</SelectItem>}
              {groupBy !== "vendor"  && <SelectItem value="vendor">Vendor</SelectItem>}
              {groupBy !== "project" && <SelectItem value="project">Project</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Sort</span>
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger className="w-32 h-8 text-xs bg-gray-900 border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="cost">Cost (High→Low)</SelectItem>
              <SelectItem value="remaining">Remaining (High→Low)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Collapse / Expand All */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={allCollapsed ? handleExpandAll : handleCollapseAll}
        >
          <ChevronsUpDown className="w-3.5 h-3.5" />
          {allCollapsed ? "Expand All" : "Collapse All"}
        </Button>

        {/* Divider */}
        <div className="h-5 w-px bg-gray-700 mx-1" />

        {/* Status Visibility Toggles */}
        {STATUS_TOGGLES.map(st => {
          const visible = visibleStatuses.has(st.key);
          return (
            <button
              key={st.key}
              onClick={() => toggleStatus(st.key)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-colors",
                visible
                  ? st.color + " bg-gray-800/50"
                  : "text-gray-600 border-gray-700/50 bg-transparent line-through"
              )}
            >
              {visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {st.label}
            </button>
          );
        })}
      </div>

      {/* Grouped Tables */}
      {isLoading ? (
        <Card className="bg-gray-900/50 border-gray-700 p-8 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-500 mx-auto" />
          <p className="text-gray-400 mt-2">Loading purchase orders...</p>
        </Card>
      ) : visibleOrders.length === 0 ? (
        <Card className="bg-gray-900/50 border-gray-700 p-8 text-center">
          <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">
            {orders.length === 0 ? 'No purchase orders found' : 'No orders match your filters'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <POPrimaryGroup
              key={g.key}
              title={g.title}
              colorClass={g.colorClass}
              orders={g.orders}
              subGroups={g.subGroups}
              onNavigate={handleNavigate}
              showProject={groupBy !== "project" && thenBy !== "project"}
              defaultCollapsed={g.defaultCollapsed}
              forceCollapsed={globalCollapse !== null ? globalCollapse : undefined}
              onToggle={globalCollapse !== null ? handleGroupToggle : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}