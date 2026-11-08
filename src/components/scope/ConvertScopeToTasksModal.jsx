import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useTaskStatuses } from "@/components/tasks/useTaskDropdownData";
import { getConvertibleScopeItems } from "./scopeTaskConversion";
import { invalidateBaselineCaches } from "./scopeBaselineCache";
import { errorText } from "./baselineFormat";
import BaselineResultsList from "./BaselineResultsList";

// Conversion runs server-side (scopeEstimateBaseline 'convert'): creates the Task + immutable
// approved-estimate baseline and links the ScopeItem. No Task writes from the browser.
export default function ConvertScopeToTasksModal({ projectId, requestId, items, categories, groups, onClose }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const candidates = useMemo(() => getConvertibleScopeItems(items), [items]);
  const [selected, setSelected] = useState(() => new Set(candidates.map(i => i.id)));
  const [bucketId, setBucketId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const { data: buckets = [] } = useQuery({
    queryKey: ["projectBuckets", projectId],
    queryFn: () => base44.entities.ProjectKanbanBucket.filter({ project_id: projectId }),
    enabled: !!projectId,
  });
  const { statuses = [] } = useTaskStatuses();
  const taskStatuses = statuses.filter(s => s.scope === "Task" && s.active !== false).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const catName = (id) => categories.find(c => c.id === id)?.name;
  const grpName = (id) => groups.find(g => g.id === id)?.name;

  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleConvert = async () => {
    const scopeItemIds = candidates.filter(i => selected.has(i.id)).map(i => i.id);
    setBusy(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("scopeEstimateBaseline", {
        action: "convert", requestId, projectId, scopeItemIds,
        bucketId: bucketId || undefined,
        statusId: statusId || taskStatuses[0]?.id || undefined,
      });
      const list = res.data?.results || [];
      setResults(list);
      const created = res.data?.created || 0;
      const notCreated = list.length - created;
      toast({ title: `Created ${created} task${created === 1 ? "" : "s"}${notCreated ? ` · ${notCreated} not created` : ""}` });
    } catch (e) {
      setError(errorText(e));
    } finally {
      // Refresh even on failure: earlier items in the batch may already have been created.
      invalidateBaselineCaches(queryClient, requestId, projectId);
      setBusy(false);
    }
  };

  const titleFor = (id) => items.find(i => i.id === id)?.title || id;
  const sortedBuckets = [...buckets].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <Dialog open onOpenChange={() => !busy && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle>Convert approved scope to tasks</DialogTitle>
          <DialogDescription className="text-gray-400">
            Each item becomes a project task and its approved estimate is locked as a reference baseline. Items already converted are skipped; items edited since approval are rejected until re-approved. Nothing is ordered or billed.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-red-400 border border-red-800/50 bg-red-950/30 rounded-md px-3 py-2">{error}</p>}

        {results ? (
          <BaselineResultsList results={results} titleFor={titleFor} />
        ) : candidates.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No new approved items to convert.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-400 text-xs">Phase</Label>
                <Select value={bucketId || "__none__"} onValueChange={v => setBucketId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No phase</SelectItem>
                    {sortedBuckets.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Status</Label>
                <Select value={statusId || taskStatuses[0]?.id || ""} onValueChange={setStatusId}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="Default" /></SelectTrigger>
                  <SelectContent>
                    {taskStatuses.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
              <span>{selected.size} of {candidates.length} selected</span>
              <button className="text-blue-400 hover:text-blue-300" onClick={() => setSelected(selected.size === candidates.length ? new Set() : new Set(candidates.map(i => i.id)))}>
                {selected.size === candidates.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="border border-gray-800 rounded-md divide-y divide-gray-800 max-h-[45vh] overflow-y-auto">
              {candidates.map(item => (
                <label key={item.id} className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-gray-800/50">
                  <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggle(item.id)} className="mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-sm text-white">{item.title}</div>
                    <div className="text-xs text-gray-500">{[catName(item.category_id), grpName(item.group_id)].filter(Boolean).join(" / ")}</div>
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>{results ? "Done" : "Cancel"}</Button>
          {!results && candidates.length > 0 && (
            <Button onClick={handleConvert} disabled={busy || selected.size === 0} className="bg-red-600 hover:bg-red-700">
              {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating {selected.size}…</> : `Create ${selected.size} task${selected.size === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}