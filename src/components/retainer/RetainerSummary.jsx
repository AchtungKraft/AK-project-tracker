import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { formatCents, retainerAction } from "@/lib/retainerMoney";
import DesignatedProjectSelect from "@/components/retainer/DesignatedProjectSelect";

const Stat = ({ label, value, muted }) => (
  <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
    <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
    <p className={muted ? "text-sm text-gray-500 mt-1" : "text-2xl font-semibold text-white mt-1"}>{value}</p>
  </div>
);

export default function RetainerSummary({ retainer, projects }) {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["retainerBalance", retainer.id],
    queryFn: () => retainerAction({ action: "get_balance", retainer_account_id: retainer.id }),
  });

  const changeProject = async (pid) => {
    setSaving(true); setError("");
    try {
      await retainerAction({ action: "update_account", retainer_account_id: retainer.id, designated_project_id: pid || null });
      await qc.invalidateQueries({ queryKey: ["retainer", retainer.client_account_id] });
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Funded balance" value={isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatCents(data?.balance_cents)} />
        <Stat label="Approved usage" value="Coming in a later phase" muted />
        <Stat label="Unposted usage" value="Coming in a later phase" muted />
        <Stat label="Posted usage" value="Coming in a later phase" muted />
      </div>
      <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 max-w-md">
        <DesignatedProjectSelect value={retainer.designated_project_id} onChange={changeProject} projects={projects} disabled={saving} />
        {error && <p className="text-sm text-red-400 mt-1">{error}</p>}
      </div>
    </div>
  );
}