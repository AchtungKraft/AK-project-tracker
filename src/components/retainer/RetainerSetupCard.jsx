import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { retainerAction } from "@/lib/retainerMoney";
import DesignatedProjectSelect from "@/components/retainer/DesignatedProjectSelect";

export default function RetainerSetupCard({ clientId, projects }) {
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    setBusy(true); setError("");
    try {
      await retainerAction({ action: "create_account", client_account_id: clientId, designated_project_id: projectId || null });
      await qc.invalidateQueries({ queryKey: ["retainer", clientId] });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-5 space-y-4">
      <p className="text-gray-300 text-sm">This client has no retainer yet. Setting one up creates an empty retainer with a $0.00 balance. No project is created.</p>
      <DesignatedProjectSelect value={projectId} onChange={setProjectId} projects={projects} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button onClick={create} disabled={busy} className="bg-red-600 hover:bg-red-700">
        {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Set Up Retainer
      </Button>
    </div>
  );
}