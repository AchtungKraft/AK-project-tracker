import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Truck, Search, RefreshCw, Plus, Package,
} from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import ServiceCommitmentCard from "@/components/supply/ServiceCommitmentCard";
import AddServiceModal from "@/components/supply/AddServiceModal";
import ServiceCatalogManager from "@/components/supply/ServiceCatalogManager";
import { useServicesView, useInvalidateServicesView } from "@/components/supply/useServicesView";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "planned", label: "Planned" },
  { value: "ordered", label: "Ordered" },
  { value: "completed", label: "Completed" },
  { value: "billed", label: "Billed" },
];

export default function ServicesDashboard() {
  const [activeTab, setActiveTab] = useState("commitments");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);

  // Canonical read model — no client-side joins needed
  const { commitments, summary, isLoading, refetch } = useServicesView();
  const invalidateAll = useInvalidateServicesView();

  // Filtered commitments
  const filtered = useMemo(() => {
    let list = commitments;
    if (statusFilter !== "all") list = list.filter(c => c.status === statusFilter);
    if (projectFilter !== "all") list = list.filter(c => c.project_id === projectFilter);
    if (vendorFilter !== "all") list = list.filter(c => c.vendor_id === vendorFilter);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(c =>
        c.description?.toLowerCase().includes(term) ||
        c.service_name?.toLowerCase().includes(term) ||
        c.project_name?.toLowerCase().includes(term)
      );
    }
    return list;
  }, [commitments, statusFilter, projectFilter, vendorFilter, searchTerm]);

  // Unique projects & vendors in commitments for filter dropdowns
  const projectsInUse = useMemo(() => {
    const seen = new Map();
    for (const c of commitments) {
      if (c.project_id && c.project_name && !seen.has(c.project_id)) {
        seen.set(c.project_id, { id: c.project_id, name: c.project_name });
      }
    }
    return [...seen.values()];
  }, [commitments]);

  const vendorsInUse = useMemo(() => {
    const seen = new Map();
    for (const c of commitments) {
      if (c.vendor_id && c.vendor_name && !seen.has(c.vendor_id)) {
        seen.set(c.vendor_id, { id: c.vendor_id, name: c.vendor_name });
      }
    }
    return [...seen.values()];
  }, [commitments]);

  const handleStatusChange = async (commitmentId, newStatus) => {
    try {
      await base44.functions.invoke("executeServiceAction", {
        action_type: "UPDATE_STATUS",
        commitment_id: commitmentId,
        new_status: newStatus,
      });
      toast.success(`Service marked as ${newStatus}`);
      invalidateAll();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (commitmentId, alreadyDeleted) => {
    if (alreadyDeleted) {
      invalidateAll();
      return;
    }
    const target = commitments.find(c => c.id === commitmentId);
    if (target?.status === "billed") {
      toast.error("Billed services cannot be deleted");
      return;
    }
    try {
      await base44.functions.invoke("executeServiceAction", {
        action_type: "DELETE",
        commitment_id: commitmentId,
      });
      toast.success("Service deleted");
      invalidateAll();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <Truck className="w-6 h-6 text-amber-400" />
              Services Dashboard
            </h1>
            <p className="text-sm text-gray-400">
              Manage shipping, plating, coating, and other non-inventory project costs
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => refetch()} variant="outline" size="sm" className="border-gray-700 text-white">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button onClick={() => setShowAddModal(true)} size="sm" className="gap-1">
              <Plus className="w-4 h-4" />
              Add Service
            </Button>
          </div>
        </div>

        {/* Summary Cards — uses canonical summary from backend */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-2">
          <SummaryCard label="Total" value={summary.total} color="text-white" />
          <SummaryCard label="Planned" value={summary.by_status.planned} color="text-gray-400" />
          <SummaryCard label="Ordered" value={summary.by_status.ordered} color="text-purple-400" />
          <SummaryCard label="Completed" value={summary.by_status.completed} color="text-blue-400" />
          <SummaryCard label="Billed" value={summary.by_status.billed} color="text-green-400" />
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Total Cost</p>
            <p className="text-lg font-bold text-white font-mono">{formatCurrencyUSD(summary.total_cost)}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Billable</p>
            <p className="text-lg font-bold text-green-400 font-mono">{formatCurrencyUSD(summary.total_billable)}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Margin</p>
            <p className={`text-lg font-bold ${summary.margin_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{summary.margin_pct.toFixed(1)}%</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-black/40 border border-gray-800">
            <TabsTrigger value="commitments" className="data-[state=active]:bg-gray-700 gap-1.5">
              <Package className="w-4 h-4" />
              All Service Commitments
            </TabsTrigger>
            <TabsTrigger value="catalog" className="data-[state=active]:bg-gray-700 gap-1.5">
              <Truck className="w-4 h-4" />
              Service Catalog
            </TabsTrigger>
          </TabsList>

          {/* Commitments Tab */}
          <TabsContent value="commitments" className="mt-4 space-y-4">
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-2 items-start md:items-center">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Search services..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-900/50 border-gray-700 text-white h-8 text-sm"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 h-8 bg-gray-900/50 border-gray-700 text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-48 h-8 bg-gray-900/50 border-gray-700 text-white text-sm">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projectsInUse.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={vendorFilter} onValueChange={setVendorFilter}>
                <SelectTrigger className="w-44 h-8 bg-gray-900/50 border-gray-700 text-white text-sm">
                  <SelectValue placeholder="All Vendors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vendors</SelectItem>
                  {vendorsInUse.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Results */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : filtered.length === 0 ? (
              <Card className="bg-black/40 border-gray-800">
                <CardContent className="p-8 text-center">
                  <Truck className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                  <p className="text-gray-400">No service commitments found</p>
                  <Button variant="outline" size="sm" className="mt-3 border-gray-700 text-white" onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Add Service
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filtered.map(c => (
                  <ServiceCommitmentCard
                    key={c.id}
                    commitment={c}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                    onTotalsChanged={invalidateAll}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Catalog Tab */}
          <TabsContent value="catalog" className="mt-4">
            <ServiceCatalogManager />
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <AddServiceModal
          projectId={null}
          projectName={null}
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={invalidateAll}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}