import React, { useEffect, useMemo, useState } from "react";
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
import { errorText, reasonText } from "./baselineFormat";
import BaselineResultsList from "./BaselineResultsList";
import SingleTaskDraftFields from "./SingleTaskDraftFields";
import BulkScopeSelectionList, { useBulkScopeTree } from "./BulkScopeSelectionList";
import BulkSelectionSummary from "./BulkSelectionSummary";

// Conversion runs server-side (scopeEstimateBaseline 'convert'): creates the Task + immutable
// approved-estimate baseline and links the ScopeItem. No Task writes from the browser.
// onlyItemId: per-item "Create Task" — single eligible item plus an editable execution draft.
export default function ConvertScopeToTasksModal({ projectId, requestId, items, categories, groups, onClose, onlyItemId = null }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const candidates = useMemo(() => {
    const all = getConvertibleScopeItems(items);
    return onlyItemId ? all.filter(i => i.id === onlyItemId) : all;
  }, [items, onlyItemId]);
  const [selected, setSelected] = useState(() => new Set(candidates.map(i => i.id)));
  const [bucketId, setBucketId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);

  const { data: preview, isLoading: previewLoading, error: previewError } = useQuery({
    queryKey: ["scopeConvertPreview", requestId, onlyItemId],
    queryFn: async () => (await base44.functions.invoke("scopeEstimateBaseline", { action: "convert_preview", requestId, projectId, scopeItemId: onlyItemId })).data,
    enabled: !!onlyItemId && candidates.length > 0,
    staleTime: 0,
  });
  useEffect(() => {
    if (preview && !draft) setDraft({ description: preview.description || "", imageUrls: preview.images || [], checklist: [] });
  }, [preview, draft]);

  const { data: buckets = [] } = useQuery({
    queryKey: ["projectBuckets", projectId],
    queryFn: () => base44.entities.ProjectKanbanBucket.filter({ project_id: projectId }),
    enabled: !!projectId,
  });
  const { statuses = [] } = useTaskStatuses();
  const taskStatuses = statuses.filter(s => s.scope === "Task" && s.active !== false).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const tree = useBulkScopeTree(items, categories, groups);

  const single = !!onlyItemId;
  const singleBlocked = single && (previewLoading || !draft || preview?.eligible === false);

  const handleConvert = async () => {
    const scopeItemIds = candidates.filter(i => selected.has(i.id)).map(i => i.id);
    setBusy(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("scopeEstimateBaseline", {
        action: "convert", requestId, projectId, scopeItemIds,
        bucketId: bucketId || undefined,
        statusId: statusId || taskStatuses[0]?.id || undefined,
        ...(single ? { taskOverrides: { description: draft.description, imageUrls: draft.imageUrls, checklist: draft.checklist.map(c => c.trim()).filter(Boolean) } } : {}),
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
          <DialogTitle>{single ? `Create task: ${candidates[0]?.title || "scope item"}` : "Convert approved scope to tasks"}</DialogTitle>
          <DialogDescription className="text-gray-400">
            {single
              ? "Review the task before creating it. Description, images and checklist apply to the task only; the approved estimate is locked as the baseline. Nothing is ordered or billed."
              : "Each item becomes a project task with its full description and images, and its approved estimate is locked as a reference baseline. Items already converted are skipped; items edited since approval are rejected until re-approved. Nothing is ordered or billed."}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-red-400 border border-red-800/50 bg-red-950/30 rounded-md px-3 py-2">{error}</p>}

        {results ? (
          <BaselineResultsList results={results} titleFor={titleFor} />
        ) : candidates.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">{single ? "This item is not eligible: it is already converted or no longer approved." : "No new approved items to convert."}</p>
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

            {single ? (
              previewError ? <p className="text-sm text-red-400">{errorText(previewError)}</p>
              : preview?.eligible === false ? <p className="text-sm text-amber-400">Not eligible: {reasonText(preview.reason)}</p>
              : !draft ? <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
              : <SingleTaskDraftFields draft={draft} setDraft={setDraft} images={preview.images || []} limits={preview.limits} />
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
                  <span>{selected.size} of {candidates.length} available for conversion selected</span>
                  <div className="flex gap-3">
                    <button type="button" className="text-blue-400 hover:text-blue-300 disabled:opacity-40" disabled={selected.size === candidates.length} onClick={() => setSelected(new Set(candidates.map(i => i.id)))}>Select all</button>
                    <button type="button" className="text-blue-400 hover:text-blue-300 disabled:opacity-40" disabled={!selected.size} onClick={() => setSelected(new Set())}>Clear</button>
                  </div>
                </div>
                <BulkScopeSelectionList tree={tree} selected={selected} setSelected={setSelected} />
              </>
            )}
          </>
        )}

        {!single && !results && candidates.length > 0 && <BulkSelectionSummary tree={tree} selected={selected} />}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>{results ? "Done" : "Cancel"}</Button>
          {!results && candidates.length > 0 && (
            <Button onClick={handleConvert} disabled={busy || selected.size === 0 || singleBlocked} className="bg-red-600 hover:bg-red-700">
              {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : single ? "Create task" : `Create ${selected.size} task${selected.size === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}