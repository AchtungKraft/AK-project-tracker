import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Truck, Search, RefreshCw, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import ServiceCommitmentCard from "@/components/supply/ServiceCommitmentCard";
import AddServiceModal from "@/components/supply/AddServiceModal";

export default function ProjectServicesSection({ projectId }) {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editCostModal, setEditCostModal] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch service commitments for this project
  const { data: commitments = [], isLoading, refetch } = useQuery({
    queryKey: ["serviceCommitments", projectId],
    queryFn: () => base44.entities.ServiceCommitment.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  // Fetch service catalog for names
  const { data: services = [] } = useQuery({
    queryKey: ["services-catalog"],
    queryFn: () => base44.entities.Service.list(),
  });

  // Fetch vendors for names
  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-active"],
    queryFn: () => base44.entities.Vendor.filter({ active: true }),
  });

  const servicesMap = useMemo(() => new Map(services.map(s => [s.id, s])), [services]);
  const vendorsMap = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);

  // Filter
  const filtered = useMemo(() => {
    if (!searchTerm) return commitments;
    const term = searchTerm.toLowerCase();
    return commitments.filter(c =>
      c.description?.toLowerCase().includes(term) ||
      servicesMap.get(c.service_id)?.name?.toLowerCase().includes(term)
    );
  }, [commitments, searchTerm, servicesMap]);

  // Summary
  const summary = useMemo(() => {
    let totalEstimated = 0, totalActual = 0, count = 0;
    for (const c of commitments) {
      count++;
      totalEstimated += (c.estimated_cost || 0) * (c.quantity || 1);
      totalActual += (c.actual_cost != null ? c.actual_cost : c.estimated_cost || 0) * (c.quantity || 1);
    }
    const byStatus = { planned: 0, ordered: 0, completed: 0, billed: 0 };
    for (const c of commitments) byStatus[c.status || 'planned']++;
    return { totalEstimated, totalActual, count, byStatus };
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
            Shipping, plating, coating, and other project services
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => refetch()}
            variant="ghost"
            size="sm"
            className="text-gray-400"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            onClick={() => setShowAddModal(true)}
            size="sm"
            className="gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Service
          </Button>
        </div>
      </div>

      {/* Summary Strip */}
      {summary.count > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Total Services</p>
            <p className="text-lg font-bold text-white">{summary.count}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Estimated</p>
            <p className="text-lg font-bold text-gray-300 font-mono">{formatCurrencyUSD(summary.totalEstimated)}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Actual/Best</p>
            <p className="text-lg font-bold text-white font-mono">{formatCurrencyUSD(summary.totalActual)}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Completed</p>
            <p className="text-lg font-bold text-blue-400">{summary.byStatus.completed + summary.byStatus.billed}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Pending</p>
            <p className="text-lg font-bold text-amber-400">{summary.byStatus.planned + summary.byStatus.ordered}</p>
          </div>
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
            <Button
              variant="outline"
              size="sm"
              className="mt-3 border-gray-700 text-white"
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add First Service
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
              vendorName={vendorsMap.get(c.vendor_id)?.vendor_name}
              onStatusChange={handleStatusChange}
              onEditCost={setEditCostModal}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Add Service Modal */}
      {showAddModal && (
        <AddServiceModal
          projectId={projectId}
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={invalidate}
        />
      )}

      {/* Edit Cost Modal */}
      {editCostModal && (
        <EditCostModal
          commitment={editCostModal}
          onClose={() => setEditCostModal(null)}
          onSuccess={() => {
            invalidate();
            setEditCostModal(null);
          }}
        />
      )}
    </div>
  );
}

// ── EDIT COST MODAL ──
function EditCostModal({ commitment, onClose, onSuccess }) {
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
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Edit Cost
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-gray-400">{commitment.description}</p>
          <div>
            <Label className="text-gray-300">Estimated Cost</Label>
            <Input
              type="number"
              step="0.01"
              value={estimated}
              onChange={e => setEstimated(e.target.value)}
              className="bg-gray-800 border-gray-600 text-white mt-1"
            />
          </div>
          <div>
            <Label className="text-gray-300">Actual Cost</Label>
            <Input
              type="number"
              step="0.01"
              value={actual}
              onChange={e => setActual(e.target.value)}
              placeholder="Enter when known"
              className="bg-gray-800 border-gray-600 text-white mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-600">Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}