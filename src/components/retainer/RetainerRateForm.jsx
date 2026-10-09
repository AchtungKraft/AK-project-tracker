import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { parseDollarsToCents, retainerAction } from "@/lib/retainerMoney";

export default function RetainerRateForm({ retainer }) {
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { data: groups = [] } = useQuery({
    queryKey: ["scopeLaborGroups", "active"],
    queryFn: async () => (await base44.entities.ScopeLaborGroup.filter({ is_active: true }, { sort: "sort_order", limit: 100 })).items,
  });

  const save = async () => {
    const cents = parseDollarsToCents(rate);
    if (!groupId) return setError("Choose a labor group.");
    if (cents === null || cents < 0) return setError("Enter a valid hourly rate, e.g. 125.00");
    setBusy(true); setError("");
    try {
      await retainerAction({ action: "set_rate", retainer_account_id: retainer.id, labor_group_id: groupId, negotiated_rate_cents: cents });
      setRate(""); setGroupId("");
      await qc.invalidateQueries({ queryKey: ["retainerRates", retainer.id] });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={groupId} onValueChange={setGroupId}>
        <SelectTrigger className="w-56 bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="Labor group" /></SelectTrigger>
        <SelectContent>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} (std ${g.hourly_rate})</SelectItem>)}</SelectContent>
      </Select>
      <Input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Negotiated $/hr" className="w-40 bg-gray-800 border-gray-700 text-white" />
      <Button variant="outline" onClick={save} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Set Rate</Button>
      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  );
}