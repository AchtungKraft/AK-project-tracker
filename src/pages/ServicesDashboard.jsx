import React, { useState, useMemo } from "react";
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
  Truck, Search, RefreshCw, Plus, Package, Settings,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import ServiceCommitmentCard from "@/components/supply/ServiceCommitmentCard";
import AddServiceModal from "@/components/supply/AddServiceModal";
import { useServicesView, useInvalidateServicesView } from "@/components/supply/useServicesView";
import ServicesDashboardSummary from "@/components/supply/ServicesDashboardSummary";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "planned", label: "Planned" },
  { value: "ordered", label: "Ordered" },
  { value: "completed", label: "Completed" },
  { value: "billed", label: "Billed" },
];

export default function ServicesDashboard() {
  const navigate = useNavigate();
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
    // CANONICAL: Use billing_locked from read model (is_billed || invoice_id)
    if (target?.billing_locked || target?.is_billed || target?.invoice_id) {
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
              Service Commitments
            </h1>
            <p className="text-sm text-gray-400">
              Manage shipping, plating, coating, and other non-inventory project costs
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate("/AdminConfig")} variant="outline" size="sm" className="border-gray-700 text-white gap-1">
              <Settings className="w-4 h-4" />
              Manage Service Vendors
            </Button>
            <Button onClick={() => refetch()} variant="outline" size="sm" className="border-gray-700 text-white">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button onClick={() => setShowAddModal(true)} size="sm" className="gap-1">
              <Plus className="w-4 h-4" />
              Add Service
            </Button>
          </div>
        </div>

        {/* Financial Summary — canonical derivation from commitments */}
        <ServicesDashboardSummary commitments={commitments} />

        {/* Service Commitments */}
        <div className="space-y-4">
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
        </div>
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