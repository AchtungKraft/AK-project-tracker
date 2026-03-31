import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Truck, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import ServiceCommitmentCard from "@/components/supply/ServiceCommitmentCard";
import AddServiceModal from "@/components/supply/AddServiceModal";

export default function ProjectServicesSection({ projectId, projectName }) {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: commitments = [], isLoading, refetch } = useQuery({
    queryKey: ["serviceCommitments", projectId],
    queryFn: () => base44.entities.ServiceCommitment.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services-catalog"],
    queryFn: () => base44.entities.Service.list(),
  });

  const { data: serviceVendors = [] } = useQuery({
    queryKey: ["serviceVendors"],
    queryFn: () => base44.entities.ServiceVendor.filter({ is_active: true }),
  });

  const servicesMap = useMemo(() => new Map(services.map(s => [s.id, s])), [services]);
  const vendorsMap = useMemo(() => new Map(serviceVendors.map(v => [v.id, v])), [serviceVendors]);

  const filtered = useMemo(() => {
    if (!searchTerm) return commitments;
    const term = searchTerm.toLowerCase();
    return commitments.filter(c =>
      c.description?.toLowerCase().includes(term) ||
      servicesMap.get(c.service_id)?.name?.toLowerCase().includes(term)
    );
  }, [commitments, searchTerm, servicesMap]);

  const summary = useMemo(() => {
    let totalCost = 0, totalBillable = 0;
    const byStatus = { planned: 0, ordered: 0, completed: 0, billed: 0 };
    for (const c of commitments) {
      byStatus[c.status || 'planned']++;
      // Prefer line-item totals, fall back to legacy
      totalCost += c.total_cost > 0 ? c.total_cost : ((c.actual_cost ?? c.estimated_cost ?? 0) * (c.quantity || 1));
      totalBillable += c.total_billable || 0;
    }
    const margin = totalBillable > 0 ? ((totalBillable - totalCost) / totalBillable) * 100 : 0;
    return { totalCost, totalBillable, margin, count: commitments.length, byStatus };
  }, [commitments]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["serviceCommitments", projectId] });
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Project Services</h2>
          <p className="text-xs text-gray-500">
            Shipping, plating, coating, and other project services. Expand each to manage line items.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => refetch()} variant="ghost" size="sm" className="text-gray-400">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => setShowAddModal(true)} size="sm" className="gap-1">
            <Plus className="w-4 h-4" /> Add Service
          </Button>
        </div>
      </div>

      {/* Summary Strip */}
      {summary.count > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <SummaryCell label="Services" value={summary.count} color="text-white" />
          <SummaryCell label="Total Cost" value={formatCurrencyUSD(summary.totalCost)} color="text-white" mono />
          <SummaryCell label="Total Billable" value={formatCurrencyUSD(summary.totalBillable)} color="text-green-400" mono />
          <SummaryCell label="Margin" value={`${summary.margin.toFixed(1)}%`} color={summary.margin >= 0 ? "text-green-400" : "text-red-400"} />
          <SummaryCell label="Completed" value={summary.byStatus.completed + summary.byStatus.billed} color="text-blue-400" />
          <SummaryCell label="Pending" value={summary.byStatus.planned + summary.byStatus.ordered} color="text-amber-400" />
        </div>
      )}

      {/* Search */}
      {summary.count > 3 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search services..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 bg-gray-900/50 border-gray-700 text-white h-8 text-sm"
          />
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-6 text-center">
            <Truck className="w-10 h-10 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-400 text-sm">No services added to this project yet</p>
            <Button variant="outline" size="sm" className="mt-3 border-gray-700 text-white" onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add First Service
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <ServiceCommitmentCard
              key={c.id}
              commitment={c}
              serviceName={servicesMap.get(c.service_id)?.name || "Unknown Service"}
              vendorName={vendorsMap.get(c.vendor_id)?.name}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onTotalsChanged={invalidate}
            />
          ))}
        </div>
      )}

      {showAddModal && (
        <AddServiceModal
          projectId={projectId}
          projectName={projectName}
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={invalidate}
        />
      )}
    </div>
  );
}

function SummaryCell({ label, value, color, mono }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color} ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}