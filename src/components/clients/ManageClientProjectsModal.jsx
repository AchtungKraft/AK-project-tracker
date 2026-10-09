import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, AlertTriangle } from "lucide-react";
import { useClientAccounts } from "@/lib/clientAccounts";

// Admin-only bulk association. Writes ONLY Project.client_account_id.
export default function ManageClientProjectsModal({ account, onClose }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [changes, setChanges] = useState({}); // projectId -> { checked, project }
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { data: accounts = [] } = useClientAccounts();
  const accountName = (aid) => accounts.find((a) => a.id === aid)?.name || "Another client";

  const term = search.trim();
  const { data: projects = [], isFetching } = useQuery({
    queryKey: ["manageClientProjects", term],
    queryFn: async () => {
      const q = { is_system_project: { $ne: true } };
      if (term) q.name = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      return (await base44.entities.Project.filter(q, { sort: "name", limit: 100, fields: ["name", "client_name", "client_account_id"] })).items;
    },
  });

  const isLinked = (p) => p.client_account_id === account.id;
  const isChecked = (p) => (changes[p.id] ? changes[p.id].checked : isLinked(p));
  const toggle = (p) => {
    const next = !isChecked(p);
    setChanges((c) => {
      const copy = { ...c };
      if (next === isLinked(p)) delete copy[p.id]; else copy[p.id] = { checked: next, project: p };
      return copy;
    });
    setConfirming(false);
  };

  const pending = Object.values(changes);
  const reassigns = pending.filter((c) => c.checked && c.project.client_account_id && c.project.client_account_id !== account.id);

  const save = async () => {
    if (reassigns.length && !confirming) { setConfirming(true); return; }
    setSaving(true); setError("");
    try {
      const res = await base44.functions.invoke("setProjectClientAccounts", {
        account_id: account.id,
        confirm_reassign: confirming,
        changes: pending.map((c) => ({ project_id: c.project.id, assign: c.checked, expected_current: c.project.client_account_id || null })),
      }).catch((e) => { throw new Error(e?.response?.data?.error || e.message); });
      if (res.data?.failed?.length) throw new Error(`Could not update: ${res.data.failed.join(", ")}. Other changes were saved.`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["clientAccountProjects"] }),
        qc.invalidateQueries({ queryKey: ["manageClientProjects"] }),
        qc.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      onClose();
    } catch (e) {
      setError(e.message || "Save failed. Some changes may not have been applied.");
      qc.invalidateQueries({ queryKey: ["clientAccountProjects"] });
      qc.invalidateQueries({ queryKey: ["manageClientProjects"] });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-2xl">
        <DialogHeader><DialogTitle>Manage Projects — {account.name}</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects by name" className="pl-9 bg-gray-800 border-gray-700 text-white" />
        </div>
        <div className="max-h-[50vh] overflow-y-auto divide-y divide-gray-800 rounded-md border border-gray-800">
          {isFetching && projects.length === 0 ? <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            : projects.length === 0 ? <p className="p-4 text-sm text-gray-400">No projects found.</p>
            : projects.map((p) => {
              const other = p.client_account_id && !isLinked(p);
              return (
                <label key={p.id} data-project-row={p.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-800/60">
                  <Checkbox checked={isChecked(p)} onCheckedChange={() => toggle(p)} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm">{p.name}</p>
                    {p.client_name && <p className="truncate text-xs text-gray-500">{p.client_name}</p>}
                  </div>
                  <span className={`text-xs shrink-0 ${isLinked(p) ? "text-emerald-400" : other ? "text-amber-400" : "text-gray-500"}`}>
                    {isLinked(p) ? "This client" : other ? accountName(p.client_account_id) : "Unassigned"}
                  </span>
                </label>
              );
            })}
        </div>
        {confirming && (
          <div className="rounded-md border border-amber-700/50 bg-amber-950/40 p-3 text-sm text-amber-200 space-y-1">
            <p className="flex items-center gap-2 font-medium"><AlertTriangle className="w-4 h-4" /> Confirm reassignment</p>
            {reassigns.map((c) => <p key={c.project.id}>"{c.project.name}" will move from {accountName(c.project.client_account_id)} to {account.name}.</p>)}
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-400">{pending.length} pending change{pending.length === 1 ? "" : "s"}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || pending.length === 0} className="bg-red-600 hover:bg-red-700">
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {confirming ? "Confirm & Save" : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}