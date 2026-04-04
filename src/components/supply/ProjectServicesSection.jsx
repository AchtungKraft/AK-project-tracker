import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Truck, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import ServiceCommitmentCard from "@/components/supply/ServiceCommitmentCard";
import AddServiceModal from "@/components/supply/AddServiceModal";
import { useServicesView, useInvalidateServicesView } from "@/components/supply/useServicesView";

export default function ProjectServicesSection({ projectId, projectName }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Canonical read model — scoped to this project
  const { commitments, summary, isLoading, refetch } = useServicesView({ project_id: projectId });
  const invalidateAll = useInvalidateServicesView();

  const filtered = useMemo(() => {
    if (!searchTerm) return commitments;
    const term = searchTerm.toLowerCase();
    return commitments.filter(c =>
      c.description?.toLowerCase().includes(term) ||
      c.service_name?.toLowerCase().includes(term)
    );
  }, [commitments, searchTerm]);

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

      {/* Summary Strip — uses canonical summary from backend */}
      {summary.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <SummaryCell label="Services" value={summary.total} color="text-white" />
          <SummaryCell label="Total Cost" value={formatCurrencyUSD(summary.total_cost)} color="text-white" mono />
          <SummaryCell label="Total Billable" value={formatCurrencyUSD(summary.total_billable)} color="text-green-400" mono />
          <SummaryCell label="Margin" value={`${summary.margin_pct.toFixed(1)}%`} color={summary.margin_pct >= 0 ? "text-green-400" : "text-red-400"} />
          <SummaryCell label="Completed" value={(summary.by_status.completed || 0) + (summary.by_status.billed || 0)} color="text-blue-400" />
          <SummaryCell label="Pending" value={(summary.by_status.planned || 0) + (summary.by_status.ordered || 0)} color="text-amber-400" />
        </div>
      )}

      {/* Search */}
      {summary.total > 3 && (
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
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onTotalsChanged={invalidateAll}
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
          onSuccess={invalidateAll}
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