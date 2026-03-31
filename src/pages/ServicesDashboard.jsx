import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Truck, Search, RefreshCw, Plus, DollarSign,
  Filter, Package, ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import ServiceCommitmentCard from "@/components/supply/ServiceCommitmentCard";
import AddServiceModal from "@/components/supply/AddServiceModal";
import ServiceCatalogManager from "@/components/supply/ServiceCatalogManager";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "planned", label: "Planned" },
  { value: "ordered", label: "Ordered" },
  { value: "completed", label: "Completed" },
  { value: "billed", label: "Billed" },
];

export default function ServicesDashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("commitments");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalProjectId, setAddModalProjectId] = useState(null);
  const [editCostModal, setEditCostModal] = useState(null);

  // Data queries
  const { data: commitments = [], isLoading, refetch } = useQuery({
    queryKey: ["allServiceCommitments"],
    queryFn: () => base44.entities.ServiceCommitment.list("-created_date", 500),
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services-catalog"],
    queryFn: () => base44.entities.Service.list(),
  });

  const { data: serviceVendors = [] } = useQuery({
    queryKey: ["serviceVendors"],
    queryFn: () => base44.entities.ServiceVendor.filter({ is_active: true }),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-for-services"],
    queryFn: () => base44.entities.Project.list("-created_date", 200),
  });

  // Lookup maps
  const servicesMap = useMemo(() => new Map(services.map(s => [s.id, s])), [services]);
  const vendorsMap = useMemo(() => new Map(serviceVendors.map(v => [v.id, v])), [serviceVendors]);
  const projectsMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

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
        servicesMap.get(c.service_id)?.name?.toLowerCase().includes(term) ||
        projectsMap.get(c.project_id)?.name?.toLowerCase().includes(term)
      );
    }
    return list;
  }, [commitments, statusFilter, projectFilter, vendorFilter, searchTerm, servicesMap, projectsMap]);

  // Summary
  const summary = useMemo(() => {
    const byStatus = { planned: 0, ordered: 0, completed: 0, billed: 0 };
    let totalCost = 0, totalBillable = 0;
    for (const c of commitments) {
      byStatus[c.status || "planned"]++;
      totalCost += c.total_cost > 0 ? c.total_cost : ((c.actual_cost ?? c.estimated_cost ?? 0) * (c.quantity || 1));
      totalBillable += c.total_billable || 0;
    }
    const margin = totalBillable > 0 ? ((totalBillable - totalCost) / totalBillable) * 100 : 0;
    return { byStatus, totalCost, totalBillable, margin, total: commitments.length };
  }, [commitments]);

  // Unique projects & vendors in commitments for filters
  const projectsInUse = useMemo(() => {
    const ids = [...new Set(commitments.map(c => c.project_id))];
    return ids.map(id => projectsMap.get(id)).filter(Boolean);
  }, [commitments, projectsMap]);

  const vendorsInUse = useMemo(() => {
    const ids = [...new Set(commitments.map(c => c.vendor_id).filter(Boolean))];
    return ids.map(id => vendorsMap.get(id)).filter(Boolean);
  }, [commitments, vendorsMap]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["allServiceCommitments"] });
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["allServiceCommitments"] });
  };

  const handleStatusChange = async (commitmentId, newStatus) => {
    try {
      await base44.functions.invoke("executeServiceAction", {
        action_type: "UPDATE_STATUS",
        commitment_id: commitmentId,
        new_status: newStatus,
      });
      toast.success(`Service marked as ${newStatus}`);
      invalidate();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (commitmentId) => {
    if (!confirm("Delete this service commitment?")) return;
    try {
      await base44.functions.invoke("executeServiceAction", {
        action_type: "DELETE",
        commitment_id: commitmentId,
      });
      toast.success("Service deleted");
      invalidate();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAddService = (projectId) => {
    setAddModalProjectId(projectId || (projects[0]?.id ?? null));
    setShowAddModal(true);
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
            <Button onClick={() => handleAddService(null)} size="sm" className="gap-1">
              <Plus className="w-4 h-4" />
              Add Service
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-2">
          <SummaryCard label="Total" value={summary.total} color="text-white" />
          <SummaryCard label="Planned" value={summary.byStatus.planned} color="text-gray-400" />
          <SummaryCard label="Ordered" value={summary.byStatus.ordered} color="text-purple-400" />
          <SummaryCard label="Completed" value={summary.byStatus.completed} color="text-blue-400" />
          <SummaryCard label="Billed" value={summary.byStatus.billed} color="text-green-400" />
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Total Cost</p>
            <p className="text-lg font-bold text-white font-mono">{formatCurrencyUSD(summary.totalCost)}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Billable</p>
            <p className="text-lg font-bold text-green-400 font-mono">{formatCurrencyUSD(summary.totalBillable)}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Margin</p>
            <p className={`text-lg font-bold ${summary.margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{summary.margin.toFixed(1)}%</p>
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
                    <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
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
                  <Button variant="outline" size="sm" className="mt-3 border-gray-700 text-white" onClick={() => handleAddService(null)}>
                    <Plus className="w-4 h-4 mr-1" /> Add Service
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filtered.map(c => (
                  <div key={c.id} className="relative">
                    {/* Project tag */}
                    <div className="absolute -top-1 left-3 z-10">
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-gray-600 text-gray-400 bg-gray-900">
                        {projectsMap.get(c.project_id)?.name || "Unknown Project"}
                      </Badge>
                    </div>
                    <div className="pt-2">
                      <ServiceCommitmentCard
                        commitment={c}
                        serviceName={servicesMap.get(c.service_id)?.name || "Unknown"}
                        vendorName={vendorsMap.get(c.vendor_id)?.name}
                        onStatusChange={handleStatusChange}
                        onDelete={handleDelete}
                        onTotalsChanged={invalidateAll}
                      />
                    </div>
                  </div>
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
      {showAddModal && addModalProjectId && (
        <AddServiceModal
          projectId={addModalProjectId}
          open={showAddModal}
          onClose={() => { setShowAddModal(false); setAddModalProjectId(null); }}
          onSuccess={invalidate}
        />
      )}

      {/* Add Modal - project picker when no project preselected */}
      {showAddModal && !addModalProjectId && (
        <ProjectPickerForService
          projects={projects}
          onSelect={(pid) => { setAddModalProjectId(pid); }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Edit Cost */}
      {editCostModal && (
        <EditCostModalGlobal
          commitment={editCostModal}
          onClose={() => setEditCostModal(null)}
          onSuccess={() => { invalidate(); setEditCostModal(null); }}
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

function ProjectPickerForService({ projects, onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const filtered = projects.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-white font-semibold">Select Project</h3>
        <Input
          placeholder="Search projects..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border-gray-600 text-white"
        />
        <div className="max-h-64 overflow-y-auto space-y-1">
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 text-gray-200 text-sm transition-colors"
            >
              {p.name}
              {p.client_name && <span className="text-gray-500 ml-2">— {p.client_name}</span>}
            </button>
          ))}
        </div>
        <Button variant="outline" onClick={onClose} className="w-full border-gray-600">Cancel</Button>
      </div>
    </div>
  );
}

function EditCostModalGlobal({ commitment, onClose, onSuccess }) {
  const [estimated, setEstimated] = useState(String(commitment.estimated_cost || ""));
  const [actual, setActual] = useState(String(commitment.actual_cost ?? ""));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke("executeServiceAction", {
        action_type: "UPDATE_COST",
        commitment_id: commitment.id,
        estimated_cost: parseFloat(estimated) || 0,
        actual_cost: actual !== "" ? parseFloat(actual) : undefined,
      });
      toast.success("Cost updated");
      onSuccess();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-sm w-full p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-white font-semibold flex items-center gap-2">
          <DollarSign className="w-4 h-4" /> Edit Cost
        </h3>
        <p className="text-sm text-gray-400">{commitment.description}</p>
        <div>
          <label className="text-xs text-gray-400">Estimated Cost</label>
          <Input type="number" step="0.01" value={estimated} onChange={e => setEstimated(e.target.value)} className="bg-gray-800 border-gray-600 text-white mt-1" />
        </div>
        <div>
          <label className="text-xs text-gray-400">Actual Cost</label>
          <Input type="number" step="0.01" value={actual} onChange={e => setActual(e.target.value)} placeholder="Enter when known" className="bg-gray-800 border-gray-600 text-white mt-1" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 border-gray-600">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">{saving ? "Saving..." : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}