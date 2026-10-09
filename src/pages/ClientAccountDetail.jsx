import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Pencil, FolderKanban, Wallet } from "lucide-react";
import ManageClientProjectsModal from "@/components/clients/ManageClientProjectsModal";
import { useIsAdmin } from "@/lib/clientAccounts";
import { buildProjectDetailUrl, SOURCES } from "@/lib/workspaceConfig";
import ClientAccountFormModal from "@/components/clients/ClientAccountFormModal";

export default function ClientAccountDetail() {
  const id = new URLSearchParams(window.location.search).get("id");
  const isAdmin = useIsAdmin();
  const [editing, setEditing] = useState(false);
  const [managing, setManaging] = useState(false);

  const { data: account, isLoading } = useQuery({
    queryKey: ["clientAccount", id],
    queryFn: async () => (await base44.entities.ClientAccount.filter({ id }, { limit: 1 })).items[0] || null,
    enabled: !!id,
  });
  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ["clientAccountProjects", id],
    queryFn: async () => (await base44.entities.Project.filter({ client_account_id: id }, { sort: "-updated_date", limit: 200, fields: ["name", "client_name", "current_phase_name", "progress_percent"] })).items,
    enabled: !!id,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (!account) return <div className="p-6 text-gray-400">Client account not found. <Link to="/clients" className="text-blue-400">Back to Clients</Link></div>;

  const details = [["Primary contact", account.primary_contact_name], ["Email", account.email], ["Phone", account.phone]].filter(([, v]) => v);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <Link to="/clients" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Clients</Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{account.name}</h1>
          <Badge variant="outline" className="mt-1 text-gray-300 capitalize">{account.status || "active"}</Badge>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link to={`/retainer?client=${account.id}`}><Wallet className="w-4 h-4 mr-1" /> Retainer</Link></Button>
            <Button variant="outline" onClick={() => setManaging(true)}><FolderKanban className="w-4 h-4 mr-1" /> Manage Projects</Button>
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="w-4 h-4 mr-1" /> Edit</Button>
          </div>
        )}
      </div>
      {(details.length > 0 || account.notes) && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 space-y-2 text-sm">
          {details.map(([k, v]) => <p key={k}><span className="text-gray-400">{k}: </span><span className="text-white">{v}</span></p>)}
          {account.notes && <p className="text-gray-300 whitespace-pre-wrap">{account.notes}</p>}
        </div>
      )}
      <div>
        <h2 className="text-lg font-semibold text-white mb-2">Projects ({projects.length})</h2>
        {loadingProjects ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : projects.length === 0 ? (
          <p className="text-gray-400 text-sm">No projects linked yet. Admins can link a project from its Edit Project form.</p>
        ) : (
          <div className="divide-y divide-gray-800 rounded-lg border border-gray-800 bg-gray-900/60">
            {projects.map((p) => (
              <Link key={p.id} to={buildProjectDetailUrl(p.id, { source: SOURCES.DASHBOARD })} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/60">
                <div className="flex-1 min-w-0">
                  <p className="text-white truncate">{p.name}</p>
                  {p.client_name && <p className="text-xs text-gray-400 truncate">{p.client_name}</p>}
                </div>
                {p.current_phase_name && <span className="text-xs text-gray-400">{p.current_phase_name}</span>}
                <span className="text-xs text-gray-400 w-10 text-right">{p.progress_percent || 0}%</span>
              </Link>
            ))}
          </div>
        )}
      </div>
      {editing && <ClientAccountFormModal account={account} onClose={() => setEditing(false)} />}
      {managing && isAdmin && <ManageClientProjectsModal account={account} onClose={() => setManaging(false)} />}
    </div>
  );
}