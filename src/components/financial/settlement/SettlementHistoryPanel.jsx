import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Wallet } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import SettlementHistoryRow from "./SettlementHistoryRow";
import ReverseSettlementDialog from "./ReverseSettlementDialog";
import { loadSettlementHistory, finishSettlements, errorMessage, settlementKeys } from "./settlementApi";

// Parts credit settlements for one project: history, reversal and recovery of an interrupted settlement.
export default function SettlementHistoryPanel({ projectId, onChanged }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: settlementKeys.history(projectId), queryFn: () => loadSettlementHistory(projectId), enabled: !!projectId });

  const refresh = () => { queryClient.invalidateQueries({ queryKey: settlementKeys.history(projectId) }); onChanged?.(); };
  const finish = useMutation({
    mutationFn: () => finishSettlements(projectId),
    onSuccess: (r) => { toast({ title: "Settlement finished", description: `${r.parts_updated || 0} part(s) updated. No credit was spent twice.` }); refresh(); },
    onError: (e) => toast({ title: "Could not finish settlement", description: errorMessage(e), variant: "destructive" }),
  });

  const list = data?.settlements || [];
  const incomplete = data?.incomplete_settlement_ids?.length || 0;
  if (isLoading || (!list.length && !incomplete)) return null;

  return (
    <Card className="border-gray-700 bg-gray-900/60">
      <CardContent className="p-3 space-y-2">
        <button className="flex items-center gap-2 text-sm text-gray-200 w-full" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Wallet className="w-4 h-4 text-emerald-400" /> Parts credit settlements ({list.length})
        </button>
        {incomplete > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded border border-red-700/50 bg-red-900/20 text-xs text-red-300">
            <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> A settlement did not finish. Invoicing for this project is paused until it is completed.</span>
            <Button size="sm" onClick={() => finish.mutate()} disabled={finish.isPending} className="h-7 gap-1">
              {finish.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Finish settlement
            </Button>
          </div>
        )}
        {open && <div className="space-y-1.5 max-h-80 overflow-y-auto">{list.map((s) => <SettlementHistoryRow key={s.allocation_id} s={s} onReverse={setTarget} />)}</div>}
      </CardContent>
      <ReverseSettlementDialog settlement={target} projectId={projectId} onClose={() => setTarget(null)}
        onDone={(r) => { toast({ title: "Settlement reversed", description: `Returned ${r.duplicate ? "" : "$" + Number(r.amount_reversed).toFixed(2) + " "}to general credit.` }); setTarget(null); refresh(); }} />
    </Card>
  );
}