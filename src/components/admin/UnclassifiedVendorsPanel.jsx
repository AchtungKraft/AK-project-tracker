import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2, Check, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * UnclassifiedVendorsPanel — Shows vendors missing vendor_type or vendor_group_id,
 * and provides quick-assign dropdowns + migration trigger.
 */
export default function UnclassifiedVendorsPanel() {
  const queryClient = useQueryClient();
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);

  const { data: vendors = [] } = useQuery({
    queryKey: ["referenceData", "vendors"],
    queryFn: async () => {
      const list = await base44.entities.Vendor.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["referenceData", "vendorGroups"],
    queryFn: () => base44.entities.VendorGroup.list(),
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Vendor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referenceData", "vendors"] });
      queryClient.invalidateQueries({ queryKey: ["vendorsGrouped"] });
      toast.success("Vendor classified");
    },
  });

  // Vendors missing classification
  const unclassified = vendors.filter(v => !v.vendor_type || !v.vendor_group_id);
  
  // Vendors in UNCATEGORIZED groups
  const uncatGroupIds = new Set(
    groups.filter(g => g.name === "UNCATEGORIZED").map(g => g.id)
  );
  const uncategorized = vendors.filter(
    v => v.vendor_group_id && uncatGroupIds.has(v.vendor_group_id)
  );

  const needsAttention = [...unclassified, ...uncategorized.filter(v => !unclassified.some(u => u.id === v.id))];

  const partGroups = groups
    .filter(g => g.vendor_type === "PART" && g.is_active !== false && g.name !== "UNCATEGORIZED")
    .sort((a, b) => (a.sort_priority || 0) - (b.sort_priority || 0));
  const serviceGroups = groups
    .filter(g => g.vendor_type === "SERVICE" && g.is_active !== false && g.name !== "UNCATEGORIZED")
    .sort((a, b) => (a.sort_priority || 0) - (b.sort_priority || 0));

  const handleMigrate = async (dryRun) => {
    setMigrating(true);
    setMigrationResult(null);
    try {
      const res = await base44.functions.invoke("migrateVendorsToGroups", { dry_run: dryRun });
      setMigrationResult(res.data);
      if (!dryRun) {
        toast.success(`Migration complete: ${res.data.updated} vendors updated`);
        queryClient.invalidateQueries({ queryKey: ["referenceData", "vendors"] });
        queryClient.invalidateQueries({ queryKey: ["vendorsGrouped"] });
      }
    } catch (err) {
      toast.error("Migration failed: " + (err.message || "Unknown error"));
    }
    setMigrating(false);
  };

  const handleQuickAssign = (vendorId, vendorType, groupId) => {
    updateMutation.mutate({
      id: vendorId,
      data: { vendor_type: vendorType, vendor_group_id: groupId },
    });
  };

  return (
    <div className="space-y-6">
      {/* Migration Actions */}
      <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          Automatic Migration
        </h3>
        <p className="text-xs text-gray-400">
          Run the migration script to auto-classify vendors using name heuristics. 
          Use "Preview" first to see what would change.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleMigrate(true)}
            disabled={migrating}
            className="border-gray-600 text-gray-300 gap-1"
          >
            {migrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Preview (Dry Run)
          </Button>
          <Button
            size="sm"
            onClick={() => handleMigrate(false)}
            disabled={migrating}
            className="bg-amber-600 hover:bg-amber-700 gap-1"
          >
            {migrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Run Migration
          </Button>
        </div>

        {migrationResult && (
          <div className="mt-3 p-3 bg-gray-800/50 rounded-lg text-xs space-y-2">
            <div className="flex gap-4 text-gray-300">
              <span>Total: <strong>{migrationResult.total_vendors}</strong></span>
              <span>Already typed: <strong>{migrationResult.already_typed}</strong></span>
              <span className="text-green-400">Classified: <strong>{migrationResult.classified}</strong></span>
              <span className="text-amber-400">Unresolved: <strong>{migrationResult.unresolved}</strong></span>
              {!migrationResult.dry_run && <span className="text-blue-400">Updated: <strong>{migrationResult.updated}</strong></span>}
            </div>
            {migrationResult.dry_run && <Badge variant="outline" className="text-[10px] bg-yellow-900/30 text-yellow-400 border-yellow-700">DRY RUN — no changes made</Badge>}

            {migrationResult.classified_vendors?.length > 0 && (
              <div className="mt-2">
                <p className="text-gray-400 mb-1 font-semibold">Classified:</p>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {migrationResult.classified_vendors.map(v => (
                    <div key={v.id} className="flex items-center gap-2 text-gray-300">
                      <span className="truncate flex-1">{v.name}</span>
                      <Badge variant="outline" className="text-[9px] shrink-0">{v.assigned_type}</Badge>
                      <span className="text-green-400 shrink-0">→ {v.assigned_group}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {migrationResult.unresolved_vendors?.length > 0 && (
              <div className="mt-2">
                <p className="text-amber-400 mb-1 font-semibold">Unresolved (will be UNCATEGORIZED):</p>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {migrationResult.unresolved_vendors.map(v => (
                    <div key={v.id} className="text-gray-400">{v.name}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual Classification */}
      {needsAttention.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Vendors Needing Classification ({needsAttention.length})
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {needsAttention.map(vendor => (
              <VendorClassifyRow
                key={vendor.id}
                vendor={vendor}
                partGroups={partGroups}
                serviceGroups={serviceGroups}
                groups={groups}
                onAssign={handleQuickAssign}
                isSaving={updateMutation.isPending}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-gray-500">
          <Check className="w-8 h-8 mx-auto mb-2 text-green-500" />
          <p className="text-sm">All vendors are classified</p>
        </div>
      )}
    </div>
  );
}

function VendorClassifyRow({ vendor, partGroups, serviceGroups, groups, onAssign, isSaving }) {
  const [selectedType, setSelectedType] = useState(vendor.vendor_type || "PART");
  const currentGroupName = groups.find(g => g.id === vendor.vendor_group_id)?.name;
  const isUncategorized = currentGroupName === "UNCATEGORIZED";
  const isMissing = !vendor.vendor_type || !vendor.vendor_group_id;

  const availableGroups = selectedType === "PART" ? partGroups : serviceGroups;

  return (
    <div className={cn(
      "p-3 rounded-lg border flex items-center gap-3",
      isMissing ? "bg-red-900/10 border-red-800/30" : "bg-amber-900/10 border-amber-800/30"
    )}>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white font-medium truncate block">{vendor.vendor_name}</span>
        <div className="flex gap-1 mt-0.5">
          {isMissing && <Badge variant="outline" className="text-[9px] bg-red-900/30 text-red-400 border-red-700">Missing Type/Group</Badge>}
          {isUncategorized && <Badge variant="outline" className="text-[9px] bg-amber-900/30 text-amber-400 border-amber-700">UNCATEGORIZED</Badge>}
        </div>
      </div>

      <Select value={selectedType} onValueChange={setSelectedType}>
        <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-8 text-xs w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="PART">Part</SelectItem>
          <SelectItem value="SERVICE">Service</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value=""
        onValueChange={(groupId) => onAssign(vendor.id, selectedType, groupId)}
      >
        <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-8 text-xs w-52">
          <SelectValue placeholder="Assign group..." />
        </SelectTrigger>
        <SelectContent>
          {availableGroups.map(g => (
            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}